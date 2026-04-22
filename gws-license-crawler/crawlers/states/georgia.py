"""
Georgia agency crawlers.

  ga_composite_medical       : Georgia Composite Medical Board (Tier 2 — Selenium)
  ga_professional_licensing  : Georgia SOS Professional Licensing (Tier 1 — requests)
"""
from __future__ import annotations

import logging
import re

import requests
from bs4 import BeautifulSoup
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC

from crawlers.base_crawler import BaseCrawler, VerificationResult

logger = logging.getLogger(__name__)

_DATE_RE = re.compile(r"\d{1,2}/\d{1,2}/\d{4}|\d{4}-\d{2}-\d{2}")


def _parse_date(text: str) -> str | None:
    m = _DATE_RE.search(text or "")
    if not m:
        return None
    val = m.group()
    if "-" in val:
        return val  # already YYYY-MM-DD
    parts = val.split("/")
    return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"


class GaCompositeMedicalCrawler(BaseCrawler):
    """
    Georgia Composite Medical Board — myLicense portal.
    Requires Selenium: multiple page transitions before result appears.
    """
    REQUIRES_SELENIUM = True
    URL = "https://gcmb.mylicense.com/eGov/"

    def verify(self, license_number: str, supplier_name: str | None = None) -> VerificationResult:
        driver = self._get_driver()
        wait = self._wait(15)

        driver.get(self.URL)

        # Click "License Verification" link
        link = wait.until(EC.element_to_be_clickable((By.PARTIAL_LINK_TEXT, "License Verification")))
        link.click()

        # Fill license number
        lic_input = wait.until(EC.presence_of_element_located((By.ID, "t_web_lookup__license_no")))
        lic_input.clear()
        lic_input.send_keys(license_number)

        # Submit
        driver.find_element(By.XPATH, "//input[@type='submit' and @value='Search']").click()

        # Wait for results
        wait.until(EC.presence_of_element_located((By.ID, "datagrid_results")))

        soup = BeautifulSoup(driver.page_source, "lxml")
        table = soup.find("table", {"id": "datagrid_results"})

        if not table:
            return self.not_found()

        for row in table.find_all("tr")[1:]:
            cells = [td.get_text(strip=True) for td in row.find_all("td")]
            if not cells:
                continue

            # Try to find the row matching our license number
            row_text = " ".join(cells)
            if license_number.upper() not in row_text.upper():
                continue

            # Click the detail link for accurate status
            detail_link = row.find("a")
            if detail_link and detail_link.get("href"):
                driver.get("https://gcmb.mylicense.com/eGov/" + detail_link["href"])
                wait.until(EC.presence_of_element_located((By.CLASS_NAME, "t_detail_value")))
                detail_soup = BeautifulSoup(driver.page_source, "lxml")

                detail = {}
                for label in detail_soup.select(".t_detail_label"):
                    value_el = label.find_next_sibling(class_="t_detail_value")
                    if value_el:
                        detail[label.get_text(strip=True).rstrip(":")] = value_el.get_text(strip=True)

                status_text = detail.get("License Status", "").upper()
                effective = _parse_date(detail.get("Original Issue Date", ""))
                expiry = _parse_date(detail.get("Expiration Date", ""))

                if "ACTIVE" in status_text or "CURRENT" in status_text:
                    return self.active(effective, expiry, detail)
                elif "EXPIRED" in status_text:
                    return self.expired(effective, expiry, detail)
                elif "REVOKED" in status_text or "TERMINATED" in status_text:
                    return self.terminated(effective, expiry, detail)

        return self.not_found(f"License {license_number} not found in GA Composite Medical results")


class GaProfessionalLicensingCrawler(BaseCrawler):
    """
    Georgia SOS Professional Licensing — JSON lookup.
    No browser needed, but the site's WAF rejects anything that doesn't
    look like a real browser, so we send full Chrome-style headers and
    warm a session by hitting the main page first to pick up cookies.
    """
    REQUIRES_SELENIUM = False
    HOME_URL = "https://sos.ga.gov/index.php/licensing/plb/verify_license"
    API_URL = "https://sos.ga.gov/PLB/lookup/LicenseList"

    _BROWSER_HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": HOME_URL,
        "X-Requested-With": "XMLHttpRequest",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
    }

    def verify(self, license_number: str, supplier_name: str | None = None) -> VerificationResult:
        session = requests.Session()
        session.headers.update(self._BROWSER_HEADERS)

        # Warm the session: visit the verify page first so the WAF sees a
        # normal navigation and sets any cookies the API endpoint expects.
        try:
            session.get(self.HOME_URL, timeout=30)
        except requests.RequestException as exc:
            logger.debug("GA SOS home warmup failed (continuing): %s", exc)

        resp = session.get(
            self.API_URL,
            params={"licenseNumber": license_number},
            timeout=30,
        )
        if resp.status_code == 403:
            return self.manual_required(
                "SITE_UNAVAILABLE",
                msg=f"GA SOS returned 403 for license {license_number}; site is blocking automated lookups.",
            )
        resp.raise_for_status()

        try:
            data = resp.json()
        except ValueError:
            return self.error(f"GA SOS returned non-JSON response (status {resp.status_code}).")

        if not data or not isinstance(data, list):
            return self.not_found()

        item = data[0]
        status_text = str(item.get("LicenseStatus", "")).upper()
        effective = _parse_date(item.get("EffectiveDate", ""))
        expiry = _parse_date(item.get("ExpirationDate", ""))

        if "ACTIVE" in status_text:
            return self.active(effective, expiry, item)
        elif "EXPIRED" in status_text:
            return self.expired(effective, expiry, item)
        elif "TERMINATED" in status_text or "REVOKED" in status_text:
            return self.terminated(effective, expiry, item)

        return self.not_found(f"Unrecognized status: {item.get('LicenseStatus')}")
