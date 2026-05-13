"""
New Jersey agency crawler.

Tier 1 — standard mylicense.com ASP.NET verification portal, no CAPTCHA.
  nj_mylicense : New Jersey Division of Consumer Affairs unified license lookup.
                 Serves Medical Examiners, Pharmacy, Optometry, Respiratory,
                 Orthotics/Prosthetics, Ophthalmic Dispensers — one URL, dropdown
                 filters profession client-side; search-by-license-number works
                 without needing to pre-select profession.
"""
from __future__ import annotations

import logging
import re

import requests
from bs4 import BeautifulSoup

from crawlers.base_crawler import BaseCrawler, VerificationResult

logger = logging.getLogger(__name__)

_DATE_RE = re.compile(r"\d{1,2}/\d{1,2}/\d{4}")


def _parse_date(text: str) -> str | None:
    m = _DATE_RE.search(text or "")
    if not m:
        return None
    parts = m.group().split("/")
    return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"


class NjMyLicenseCrawler(BaseCrawler):
    """
    NJ Division of Consumer Affairs - mylicense.com portal.

    Flow:
      1. GET Search.aspx to capture __VIEWSTATE/__EVENTVALIDATION and session cookie
      2. POST the search form with the license number
      3. Parse the results page for the row that exactly matches the license,
         follow its Details link
      4. Parse label/value pairs on the detail page
    """
    REQUIRES_SELENIUM = False
    SEARCH_URL = "https://newjersey.mylicense.com/Verification/Search.aspx"
    DETAIL_BASE = "https://newjersey.mylicense.com/Verification/"

    def _search(self, session: requests.Session, license_number: str) -> requests.Response:
        get_resp = session.get(self.SEARCH_URL, timeout=30)
        get_resp.raise_for_status()
        get_soup = BeautifulSoup(get_resp.text, "lxml")

        def hidden(name: str) -> str:
            el = get_soup.find("input", {"name": name})
            return el.get("value", "") if el else ""

        post_data = {
            "__VIEWSTATE": hidden("__VIEWSTATE"),
            "__EVENTVALIDATION": hidden("__EVENTVALIDATION"),
            "__VIEWSTATEGENERATOR": hidden("__VIEWSTATEGENERATOR"),
            "t_web_lookup__first_name": "",
            "t_web_lookup__last_name": "",
            "t_web_lookup__license_no": license_number,
            "t_web_lookup__addr_city": "",
            "t_web_lookup__profession_name": "",
            "t_web_lookup__license_type_name": "",
            "sch_button": "Search",
        }
        resp = session.post(self.SEARCH_URL, data=post_data, timeout=30)
        resp.raise_for_status()
        return resp

    def verify(self, license_number: str, supplier_name: str | None = None) -> VerificationResult:
        session = requests.Session()
        session.headers.update({
            "User-Agent": "Mozilla/5.0 GWSBot/1.0",
            "Referer": self.SEARCH_URL,
        })

        # Build candidate license numbers to try: original, no-spaces, OCR fixes (0↔O, 1↔I)
        candidates: list[str] = [license_number]
        stripped = re.sub(r"[\s\-]", "", license_number)
        if stripped != license_number:
            candidates.append(stripped)
        # Common OCR confusion in the first 4 chars (board code prefix)
        prefix = stripped[:4]
        rest = stripped[4:]
        for src, dst in [("0", "O"), ("O", "0"), ("1", "I"), ("I", "1")]:
            fixed = prefix.replace(src, dst) + rest
            if fixed not in candidates:
                candidates.append(fixed)

        post_resp: requests.Response | None = None
        used_number = license_number
        for candidate in candidates:
            resp = self._search(session, candidate)
            if "no records" not in resp.text.lower() and "no results" not in resp.text.lower():
                post_resp = resp
                used_number = candidate
                break

        if post_resp is None:
            return self.not_found(f"NJ mylicense: no records for {license_number}")

        results_soup = BeautifulSoup(post_resp.text, "lxml")

        # Find the Details link. Match against the candidate number that got results.
        lic_norm = re.sub(r"[\s\-]", "", used_number).upper()
        detail_href: str | None = None
        for row in results_soup.find_all("tr"):
            row_norm = re.sub(r"[\s\-]", "", row.get_text(" ", strip=True)).upper()
            if lic_norm not in row_norm:
                continue
            a = row.find("a", href=lambda h: h and "Detail" in h)
            if a:
                detail_href = a["href"]
                break

        # Fallback: if search returned exactly one result, take the only Detail link.
        if not detail_href:
            all_detail_links = results_soup.find_all("a", href=lambda h: h and "Detail" in h)
            if len(all_detail_links) == 1:
                detail_href = all_detail_links[0]["href"]

        if not detail_href:
            return self.not_found(
                f"NJ mylicense: results page had no detail link for {license_number}"
            )

        detail_url = self.DETAIL_BASE + detail_href.lstrip("/")
        detail_resp = session.get(detail_url, timeout=30)
        detail_resp.raise_for_status()
        detail_soup = BeautifulSoup(detail_resp.text, "lxml")

        # Parse Label: Value pairs from the detail page. The page lays them out
        # as <span class="lbl">Label:</span> <span class="val">Value</span>-like
        # pairs; fall back to scanning the DOM text for known labels.
        fields: dict[str, str] = {}
        text = detail_soup.get_text("\n", strip=True)
        lines = [line for line in text.split("\n") if line]
        for i, line in enumerate(lines):
            if line.endswith(":") and i + 1 < len(lines):
                label = line.rstrip(":").strip()
                value = lines[i + 1].strip()
                if label and value and value != ",":
                    fields[label] = value

        status_text = fields.get("License Status", "").upper()
        effective = _parse_date(fields.get("Issue Date", ""))
        expiration = _parse_date(fields.get("Expiration Date", ""))
        raw = {"fields": fields}

        if "ACTIVE" in status_text or "CLEAR" in status_text or status_text == "ACTIVE":
            return self.active(effective, expiration, raw)
        if "EXPIRED" in status_text or "DELINQUENT" in status_text or "LAPSED" in status_text:
            return self.expired(effective, expiration, raw)
        if "REVOKED" in status_text or "SUSPENDED" in status_text or "TERMINATED" in status_text or "SURRENDERED" in status_text:
            return self.terminated(effective, expiration, raw)

        return VerificationResult(
            status="NOT_FOUND",
            raw_data=raw,
            error_message=f"Unrecognized NJ mylicense status: {fields.get('License Status')}",
        )
