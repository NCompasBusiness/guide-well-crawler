"""
TEMPLATE — copy this file to implement a new agency crawler.

Steps:
  1. Copy to crawlers/states/<state_code>_<agency_short_name>.py
  2. Rename the class.
  3. Set REQUIRES_SELENIUM = True/False based on the site.
  4. Implement verify().
  5. Add the crawlerKey + class to crawlers/registry.py.
  6. Add an entry to config/agencies.json.
  7. Test with: python run.py --test-crawler <crawlerKey> --license <NUMBER>
"""
from __future__ import annotations

import logging
import re

import requests
from bs4 import BeautifulSoup

from crawlers.base_crawler import BaseCrawler, VerificationResult

logger = logging.getLogger(__name__)

_DATE_RE = re.compile(r"\d{1,2}/\d{1,2}/\d{4}|\d{4}-\d{2}-\d{2}")


def _parse_date(text: str | None) -> str | None:
    if not text:
        return None
    m = _DATE_RE.search(text)
    if not m:
        return None
    val = m.group()
    if "-" in val:
        return val
    parts = val.split("/")
    return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"


class TemplateCrawler(BaseCrawler):
    """
    Replace with a descriptive name matching the agency.
    Register as: "xx_agency_key": TemplateCrawler  in registry.py
    """

    # Set to False if plain HTTP requests work (faster, no browser needed)
    REQUIRES_SELENIUM = False

    LOOKUP_URL = "https://example-agency.gov/license/verify"

    def verify(self, license_number: str, supplier_name: str | None = None) -> VerificationResult:
        # ── Option A: Plain HTTP request (for simple form/API sites) ──────────
        session = requests.Session()
        session.headers.update({"User-Agent": "Mozilla/5.0 GWSBot/1.0"})

        resp = session.get(
            self.LOOKUP_URL,
            params={"licenseNo": license_number},
            timeout=30,
        )
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "lxml")

        # Check for "not found" message
        if soup.find(string=re.compile(r"no results|not found", re.I)):
            return self.not_found()

        # Parse result
        # TODO: Adapt selectors to the actual site structure
        status_cell = soup.select_one("td.license-status") or soup.select_one(".status-value")
        expiry_cell = soup.select_one("td.expiry-date") or soup.select_one(".expiry-value")

        if not status_cell:
            return self.error(f"Could not parse status for {license_number}")

        status_text = status_cell.get_text(strip=True).upper()
        expiry = _parse_date(expiry_cell.get_text(strip=True) if expiry_cell else "")

        if "ACTIVE" in status_text or "CURRENT" in status_text:
            return self.active(termination_date=expiry)
        elif "EXPIRED" in status_text:
            return self.expired(termination_date=expiry)
        elif "REVOKED" in status_text or "TERMINATED" in status_text:
            return self.terminated(termination_date=expiry)

        # ── Option B: Selenium navigation (for multi-step sites) ──────────────
        # Uncomment and adapt this block if the site needs a real browser.
        # Set REQUIRES_SELENIUM = True above.
        #
        # from selenium.webdriver.common.by import By
        # from selenium.webdriver.support import expected_conditions as EC
        #
        # driver = self._get_driver()
        # wait = self._wait(15)
        # driver.get(self.LOOKUP_URL)
        # wait.until(EC.presence_of_element_located((By.ID, "license-input"))).send_keys(license_number)
        # driver.find_element(By.ID, "search-btn").click()
        # wait.until(EC.presence_of_element_located((By.ID, "result-table")))
        # ...

        return self.not_found(f"Unrecognized status: {status_text}")
