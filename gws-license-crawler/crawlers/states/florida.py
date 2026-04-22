"""
Florida agency crawlers.

Tier 1 — straightforward form submissions, no CAPTCHA.
  fl_ahca : Florida Agency for Health Care Administration
  fl_dbpr : Florida Department of Business and Professional Regulation
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
    """Parse MM/DD/YYYY → YYYY-MM-DD."""
    m = _DATE_RE.search(text)
    if not m:
        return None
    parts = m.group().split("/")
    return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"


class FlAhcaCrawler(BaseCrawler):
    """
    Florida AHCA — provider/facility license lookup.
    Uses a simple HTTP GET with license number as query param.
    No Selenium needed.
    """
    REQUIRES_SELENIUM = False
    BASE_URL = "https://apps.ahca.myflorida.com/hcaf_internet/Home/ProvidersAndFacilitiesSearch"

    def verify(self, license_number: str, supplier_name: str | None = None) -> VerificationResult:
        session = requests.Session()
        session.headers.update({"User-Agent": "Mozilla/5.0 GWSBot/1.0"})

        resp = session.get(
            self.BASE_URL,
            params={"licenseId": license_number},
            timeout=30,
        )
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "lxml")

        # Check "No results found"
        if soup.find(string=re.compile(r"no results", re.I)):
            return self.not_found()

        # Look for status in result table
        rows = soup.select("table.search-results tr")
        for row in rows:
            cells = [td.get_text(strip=True) for td in row.find_all("td")]
            if len(cells) < 4:
                continue
            if license_number.upper() in cells[0].upper():
                status_text = cells[2].upper()
                effective = _parse_date(cells[3]) if len(cells) > 3 else None
                termination = _parse_date(cells[4]) if len(cells) > 4 else None
                raw = {"raw_status": cells[2], "cells": cells}

                if "ACTIVE" in status_text:
                    return self.active(effective, termination, raw)
                elif "EXPIRED" in status_text:
                    return self.expired(effective, termination, raw)
                elif "TERMINATED" in status_text or "REVOKED" in status_text:
                    return self.terminated(effective, termination, raw)
                else:
                    return VerificationResult(
                        status="NOT_FOUND",
                        raw_data=raw,
                        error_message=f"Unrecognized status: {cells[2]}",
                    )

        return self.not_found(f"License {license_number} not found in AHCA results")


class FlDbprCrawler(BaseCrawler):
    """
    Florida DBPR — myfloridalicense.com license verification.
    Uses an HTTP POST to the license verification endpoint.
    """
    REQUIRES_SELENIUM = False
    SEARCH_URL = "https://www.myfloridalicense.com/wl11.asp"

    def verify(self, license_number: str, supplier_name: str | None = None) -> VerificationResult:
        session = requests.Session()
        session.headers.update({
            "User-Agent": "Mozilla/5.0 GWSBot/1.0",
            "Referer": self.SEARCH_URL,
        })

        data = {
            "lic_no": license_number,
            "button": "Search",
        }
        resp = session.post(self.SEARCH_URL, data=data, timeout=30)
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "lxml")

        if soup.find(string=re.compile(r"no records found", re.I)):
            return self.not_found()

        result_table = soup.find("table", {"id": "tblLicenseDetails"}) or \
                       soup.find("table", {"class": re.compile(r"result", re.I)})

        if not result_table:
            return self.not_found(f"Could not parse DBPR result page for {license_number}")

        cells = {
            label.get_text(strip=True).rstrip(":"): value.get_text(strip=True)
            for row in result_table.find_all("tr")
            for label, value in [(row.find("th"), row.find("td"))]
            if label and value
        }

        status_text = cells.get("Status", "").upper()
        effective = _parse_date(cells.get("Effective Date", ""))
        termination = _parse_date(cells.get("Expiration Date", "") or cells.get("Termination Date", ""))

        if "CURRENT" in status_text or "ACTIVE" in status_text:
            return self.active(effective, termination, cells)
        elif "EXPIRED" in status_text:
            return self.expired(effective, termination, cells)
        elif "NULL AND VOID" in status_text or "REVOKED" in status_text or "TERMINATED" in status_text:
            return self.terminated(effective, termination, cells)

        return VerificationResult(
            status="NOT_FOUND",
            raw_data=cells,
            error_message=f"Unrecognized DBPR status: {cells.get('Status')}",
        )
