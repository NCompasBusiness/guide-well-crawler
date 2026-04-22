"""
Texas agency crawlers.

  tx_dshs : Texas DSHS — Tier 2 Selenium (multi-step facility type selection)
  tx_hhs  : Texas HHS  — Tier 3 CAPTCHA (auto-flagged as manual)
"""
from __future__ import annotations

import logging
import re

from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select

from crawlers.base_crawler import BaseCrawler, VerificationResult

logger = logging.getLogger(__name__)

_DATE_RE = re.compile(r"\d{1,2}/\d{1,2}/\d{4}")


def _parse_date(text: str) -> str | None:
    m = _DATE_RE.search(text or "")
    if not m:
        return None
    parts = m.group().split("/")
    return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"


class TxDshsCrawler(BaseCrawler):
    """
    Texas DSHS Regulatory Activity Search.
    Requires: select facility type → enter license → read result.
    """
    REQUIRES_SELENIUM = True
    URL = "https://vo.ras.dshs.state.tx.us/"
    FACILITY_TYPE = "Home and Community Support Services"  # DME-relevant type

    def verify(self, license_number: str, supplier_name: str | None = None) -> VerificationResult:
        driver = self._get_driver()
        wait = self._wait(15)

        driver.get(self.URL)

        # Select facility type
        type_select = wait.until(EC.presence_of_element_located((By.ID, "FacilityType")))
        Select(type_select).select_by_visible_text(self.FACILITY_TYPE)

        # Enter license number
        lic_input = wait.until(EC.presence_of_element_located((By.ID, "LicenseNumber")))
        lic_input.clear()
        lic_input.send_keys(license_number)

        # Search
        driver.find_element(By.ID, "SearchButton").click()

        # Wait for result grid
        wait.until(EC.presence_of_element_located((By.ID, "SearchResults")))

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(driver.page_source, "lxml")
        table = soup.find("table", {"id": "SearchResults"})

        if not table:
            return self.not_found()

        for row in table.find_all("tr")[1:]:
            cells = [td.get_text(strip=True) for td in row.find_all("td")]
            if not cells:
                continue
            row_text = " ".join(cells).upper()
            if license_number.upper() not in row_text:
                continue

            # cells: [License#, Facility Name, Status, Effective, Expiry, ...]
            status_text = cells[2].upper() if len(cells) > 2 else ""
            effective = _parse_date(cells[3]) if len(cells) > 3 else None
            expiry = _parse_date(cells[4]) if len(cells) > 4 else None
            raw = {"cells": cells}

            if "ACTIVE" in status_text or "CURRENT" in status_text:
                return self.active(effective, expiry, raw)
            elif "EXPIRED" in status_text:
                return self.expired(effective, expiry, raw)
            elif "REVOKED" in status_text or "TERMINATED" in status_text:
                return self.terminated(effective, expiry, raw)

        return self.not_found(f"License {license_number} not found in TX DSHS results")


class TxHhsCrawler(BaseCrawler):
    """
    Texas HHS — CAPTCHA-protected. Always flags for manual review.
    The batch_runner short-circuits this via agency.isCaptchaBlocked,
    but this class exists as a safety net.
    """
    REQUIRES_SELENIUM = False

    def verify(self, license_number: str, supplier_name: str | None = None) -> VerificationResult:
        return self.manual_required(
            reason="CAPTCHA_REQUIRED",
            msg="TX HHS site requires CAPTCHA solving. Please verify manually.",
        )
