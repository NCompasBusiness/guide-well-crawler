"""
Human-in-the-loop verification for CAPTCHA-protected sites.

Runs AFTER the parallel automatic phase. For each LicenseVerification in the
current run that was short-circuited with manualReason='CAPTCHA_REQUIRED':

  1. Open a real Chrome window at the agency's lookup URL.
  2. Auto-fill the supplier's license number in the first likely text input.
  3. Wait for the user to solve the CAPTCHA, click Search, and press ENTER
     in the terminal once results are visible.
  4. Scrape visible status text + dates, update the existing verification row
     in place (flip requiresManual -> 0, set real status).

Password-protected agencies are intentionally skipped — they stay in the manual
queue untouched.
"""
from __future__ import annotations

import json
import logging
import re
import shutil
import sqlite3
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from selenium import webdriver
from selenium.common.exceptions import InvalidSessionIdException, NoSuchWindowException, WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

from config.settings import settings

_RESULT_INDICATORS = [
    "status", "expiration", "effective", "issue date",
    "profession", "license type", "licensee", "registration",
]
_NO_RESULT_MARKERS = ["no records found", "no results found", "no matches found", "no match found"]

logger = logging.getLogger(__name__)

_DATE_RE = re.compile(r"(\d{1,2}[/-]\d{1,2}[/-]\d{4})|(\d{4}-\d{2}-\d{2})")
_STATUS_KEYWORDS = [
    ("TERMINATED", ["revoked", "suspended", "surrendered", "null and void", "terminated", "retired"]),
    ("EXPIRED", ["expired", "lapsed", "delinquent", "inactive"]),
    ("ACTIVE", ["clear/active", "active", "current", "in good standing"]),
]
_LICENSE_FIELD_HINTS = [
    "license", "licensure", "licence",
    "licno", "lic_no", "lic#", "licnum", "lic_num", "licenseno", "license_no",
    "licensenumber", "licencenum", "licencenumber", "licencenbr", "licnbr", "lic_nbr",
    "permit", "registration",
]


def _parse_date_to_iso(text: str) -> str | None:
    m = _DATE_RE.search(text or "")
    if not m:
        return None
    raw = m.group(0)
    if re.match(r"\d{4}-\d{2}-\d{2}", raw):
        return f"{raw}T00:00:00.000Z"
    parts = re.split(r"[/-]", raw)
    if len(parts) != 3:
        return None
    return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}T00:00:00.000Z"


def _load_agency_lookup_urls() -> dict[str, str]:
    """Return {crawlerKey: lookupUrl or websiteUrl} from agencies.json."""
    path = Path(__file__).resolve().parent.parent / "config" / "agencies.json"
    agencies = json.loads(path.read_text())
    out: dict[str, str] = {}
    for a in agencies:
        key = a.get("crawlerKey")
        if not key:
            continue
        out[key] = a.get("lookupUrl") or a.get("websiteUrl") or ""
    return out


def _build_driver() -> tuple[webdriver.Chrome, str]:
    user_data_dir = tempfile.mkdtemp(prefix="gws_manual_")
    opts = Options()
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1280,900")
    opts.add_argument("--remote-allow-origins=*")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_argument(f"--user-data-dir={user_data_dir}")
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=opts)
    driver.set_page_load_timeout(60)
    return driver, user_data_dir


def _score_license_field(name: str, idv: str, placeholder: str) -> int:
    """Score a form field by how license-number-ish it looks. Combined tokens
    like 'lic'+'num' or 'lic'+'nbr' anywhere in name/id win over plain keywords,
    so ASP.NET patterns like ctl00$Content$txtLicNum match reliably."""
    combined = f"{name} {idv} {placeholder}".lower()
    score = 0
    for hint in _LICENSE_FIELD_HINTS:
        if hint in combined:
            score += 3
    # Combined-token fallback: 'lic' plus any of 'num', 'no', 'nbr', '#'
    if "lic" in combined and any(tok in combined for tok in ("num", "no", "nbr", "#")):
        # Exclude false positives from unrelated fields that happen to contain both
        if not any(bad in combined for bad in ("public", "click", "flick", "zip", "county", "city")):
            score += 5
    return score


def _try_click_detail(driver: webdriver.Chrome, license_number: str) -> str | None:
    """After search results are visible, try to click into the first matching row's
    detail link to get a page that includes issue/expiration dates.
    Returns the detail page text, or None if no link found / click failed."""
    try:
        links = driver.find_elements(By.TAG_NAME, "a")
        lic_upper = license_number.upper()
        # Prefer a link in a row that contains the license number
        for link in links:
            try:
                row = link.find_element(By.XPATH, "./ancestor::tr[1]")
                if lic_upper in row.text.upper():
                    href = link.get_attribute("href") or ""
                    if href and href not in ("#", "javascript:void(0)", ""):
                        driver.execute_script("arguments[0].click();", link)
                        time.sleep(2)
                        return driver.find_element(By.TAG_NAME, "body").text
            except Exception:
                continue
        # Fallback: click any non-navigation link on the page
        for link in links:
            try:
                href = link.get_attribute("href") or ""
                text = link.text.strip()
                if href and text and text.lower() not in ("home", "back to home", "print", "search"):
                    driver.execute_script("arguments[0].click();", link)
                    time.sleep(2)
                    return driver.find_element(By.TAG_NAME, "body").text
            except Exception:
                continue
    except Exception:
        pass
    return None


def _fill_license_field(driver: webdriver.Chrome, license_number: str) -> bool:
    try:
        inputs = driver.find_elements(By.TAG_NAME, "input")
    except Exception:
        return False
    scored: list[tuple[int, Any]] = []
    for inp in inputs:
        try:
            if not inp.is_displayed():
                continue
            t = (inp.get_attribute("type") or "text").lower()
            if t not in ("text", "search", ""):
                continue
            name = inp.get_attribute("name") or ""
            idv = inp.get_attribute("id") or ""
            placeholder = inp.get_attribute("placeholder") or ""
            score = _score_license_field(name, idv, placeholder)
            scored.append((score, inp))
        except Exception:
            continue
    scored.sort(key=lambda x: -x[0])
    for score, inp in scored:
        if score <= 0:
            break
        try:
            inp.clear()
            inp.send_keys(license_number)
            return True
        except Exception:
            continue
    # No scored match — refuse to silently fill the wrong field.
    return False


def _wait_for_results(
    driver: webdriver.Chrome,
    license_number: str,
    timeout_s: int = 300,
    poll_s: float = 1.5,
) -> tuple[str | None, str]:
    """Poll the browser until search results render, the user closes the window,
    or we hit the timeout. Returns (page_text, outcome) where outcome is one of
    'success' | 'closed' | 'timeout'."""
    start = time.time()
    try:
        initial_body = driver.find_element(By.TAG_NAME, "body").text
    except Exception:
        initial_body = ""
    license_lower = license_number.lower()
    next_progress_print = time.time() + 30
    while time.time() - start < timeout_s:
        time.sleep(poll_s)
        try:
            body = driver.find_element(By.TAG_NAME, "body").text
        except (NoSuchWindowException, InvalidSessionIdException):
            return None, "closed"
        except WebDriverException as e:
            if "no such window" in str(e).lower() or "invalid session" in str(e).lower():
                return None, "closed"
            continue
        if body == initial_body:
            if time.time() >= next_progress_print:
                elapsed = int(time.time() - start)
                print(f"    ...waiting for results ({elapsed}s)")
                next_progress_print = time.time() + 30
            continue
        lower = body.lower()
        if any(m in lower for m in _NO_RESULT_MARKERS):
            time.sleep(1)
            try:
                return driver.find_element(By.TAG_NAME, "body").text, "success"
            except Exception:
                return body, "success"
        if license_lower in lower:
            hits = sum(1 for kw in _RESULT_INDICATORS if kw in lower)
            if hits >= 2:
                time.sleep(1)
                try:
                    return driver.find_element(By.TAG_NAME, "body").text, "success"
                except Exception:
                    return body, "success"
    return None, "timeout"


def _scrape_result(page_text: str) -> tuple[str, str | None, str | None, dict[str, Any]]:
    lower = page_text.lower()
    status = "NOT_FOUND"
    for mapped, keywords in _STATUS_KEYWORDS:
        if any(k in lower for k in keywords):
            status = mapped
            break
    effective = None
    termination = None
    for label_re, which in [
        (r"(?:issue|effective|original issue|issued)(?:\s*date)?\s*[:\-]?\s*([\d/\-]+)", "effective"),
        (r"(?:expir(?:ation|es?|y)|termination)(?:\s*date)?\s*[:\-]?\s*([\d/\-]+)", "termination"),
    ]:
        m = re.search(label_re, page_text, re.I)
        if m:
            parsed = _parse_date_to_iso(m.group(1))
            if which == "effective":
                effective = parsed
            else:
                termination = parsed
    return status, effective, termination, {"scraped_text_sample": page_text[:2000]}


def _update_verification(
    verification_id: str,
    supplier_id: str,
    status: str,
    effective: str | None,
    termination: str | None,
    raw_data: dict[str, Any],
) -> None:
    now = datetime.utcnow().isoformat(timespec="milliseconds") + "Z"
    conn = sqlite3.connect(settings.DB_PATH, timeout=30)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        conn.execute(
            '''UPDATE "LicenseVerification"
                  SET status = ?, "effectiveDate" = ?, "terminationDate" = ?,
                      "rawData" = ?, "requiresManual" = 0,
                      "manualResolvedAt" = ?, "manualResolvedBy" = ?
                WHERE id = ?''',
            (
                status,
                effective,
                termination,
                json.dumps(raw_data),
                now,
                "manual-assist",
                verification_id,
            ),
        )
        conn.execute(
            '''UPDATE "Supplier" SET "lastStatus" = ?, "lastVerifiedAt" = ?, "updatedAt" = ?
                 WHERE id = ?''',
            (status, now, now, supplier_id),
        )
        conn.commit()
    finally:
        conn.close()


def _wait_for_input_ready(driver: webdriver.Chrome, timeout: int = 15) -> None:
    """Wait until at least one visible text input is present and interactable."""
    try:
        WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='text'], input[type='search'], input:not([type])"))
        )
    except Exception:
        time.sleep(2)


def run_manual_assist_for_run(run_id: str) -> int:
    """Process all CAPTCHA_REQUIRED rows for this run interactively.
    Opens one Chrome window per agency and reuses it for all licenses in that agency.
    Returns number of rows processed (excluding skips)."""
    url_by_key = _load_agency_lookup_urls()

    conn = sqlite3.connect(settings.DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        '''SELECT lv.id AS verification_id, lv."supplierId",
                  s."supplierName", s."licenseNumber",
                  a.name AS agency_name, a."crawlerKey"
             FROM "LicenseVerification" lv
             JOIN "Supplier" s ON s.id = lv."supplierId"
             JOIN "LicensingAgency" a ON a.id = s."agencyId"
            WHERE lv."runId" = ?
              AND lv."requiresManual" = 1
              AND lv."manualReason" = 'CAPTCHA_REQUIRED'
              AND lv."manualResolvedAt" IS NULL
            ORDER BY a."crawlerKey"''',
        (run_id,),
    ).fetchall()
    conn.close()

    if not rows:
        logger.info("Manual-assist: no CAPTCHA_REQUIRED rows for run %s", run_id)
        return 0

    # Group rows by agency so we reuse one Chrome window per agency
    groups: dict[str, list] = {}
    for row in rows:
        key = row["crawlerKey"]
        if key not in groups:
            groups[key] = []
        groups[key].append(row)

    total = len(rows)
    print(f"\n=== Manual-assist phase: {total} CAPTCHA row(s) for this run ===")
    print("One Chrome window opens per agency. Solve the CAPTCHA once —")
    print("each license loads automatically in the same window.\n")

    processed = 0
    idx = 0

    for agency_key, agency_rows in groups.items():
        lookup_url = url_by_key.get(agency_key, "")
        agency_name = agency_rows[0]["agency_name"]

        print(f"=== Agency: {agency_name} ({agency_key}) — {len(agency_rows)} license(s) ===")

        if not lookup_url or lookup_url.strip().lower() == "about:blank":
            for row in agency_rows:
                idx += 1
                print(f"    [{idx}/{total}] SKIP (no lookup URL): {row['supplierName']} ({row['licenseNumber']})")
            print()
            continue

        print(f"    URL: {lookup_url}\n")
        driver, user_data_dir = _build_driver()
        browser_alive = True
        try:
            driver.get(lookup_url)
            _wait_for_input_ready(driver)

            for row in agency_rows:
                idx += 1
                if not browser_alive:
                    print(f"    [{idx}/{total}] SKIP (browser closed): {row['supplierName']} ({row['licenseNumber']})")
                    continue

                license_number = row["licenseNumber"]
                supplier_name = row["supplierName"]
                verification_id = row["verification_id"]
                supplier_id = row["supplierId"]

                print(f"--- [{idx}/{total}] {supplier_name} — license {license_number} ---")
                print(f"    Filling license number — DO NOT click Search yet...")
                filled = _fill_license_field(driver, license_number)
                print(f"    License auto-filled: {'yes — now solve CAPTCHA and click Search' if filled else 'no (fill manually in the browser)'}")

                page_text, outcome = _wait_for_results(driver, license_number, timeout_s=300)

                if outcome == "closed":
                    print("    → Browser closed — skipping remaining rows for this agency.\n")
                    browser_alive = False
                    continue

                if outcome == "timeout":
                    print("    → Timed out after 5 minutes; left in manual queue.\n")
                    try:
                        driver.get(lookup_url)
                        _wait_for_input_ready(driver)
                    except Exception:
                        browser_alive = False
                    continue

                # Try clicking into a detail page to get dates (e.g. GA Medical Board
                # search results don't include dates — only the detail page does)
                detail_text = _try_click_detail(driver, license_number)
                scrape_text = detail_text if detail_text else (page_text or "")

                status, effective, termination, raw = _scrape_result(scrape_text)
                _update_verification(verification_id, supplier_id, status, effective, termination, raw)
                print(f"    → {status}  (effective={effective}, termination={termination})\n")
                processed += 1

                # Navigate back to search form for the next license in this agency
                if row is not agency_rows[-1]:
                    try:
                        driver.get(lookup_url)
                        _wait_for_input_ready(driver)
                    except Exception:
                        browser_alive = False

        except Exception as exc:
            logger.exception("Manual-assist agency %s failed: %s", agency_key, exc)
            print(f"    ERROR: {exc}\n")
        finally:
            try:
                driver.quit()
            except Exception:
                pass
            shutil.rmtree(user_data_dir, ignore_errors=True)

    print(f"=== Manual-assist phase done: {processed} processed ===\n")
    return processed
