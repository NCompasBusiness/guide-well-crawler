"""
Florida agency crawlers.

Tier 1 — straightforward form submissions, no CAPTCHA.
  fl_ahca     : Florida Agency for Health Care Administration
  fl_dbpr     : Florida Department of Business and Professional Regulation
  fl_doh_mqa  : Florida Department of Health — Medical Quality Assurance portal
                (covers Medical Board, Pharmacy, Podiatrists, Optometry, PT, OT,
                Orthotics/Prosthetics, Respiratory — ~13 license types under one URL)
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


class FlDohMqaCrawler(BaseCrawler):
    """
    Florida DOH Medical Quality Assurance — license verification.

    ASP.NET MVC form. Flow:
      1. GET the search page to capture __RequestVerificationToken and session cookie
      2. POST license number back to the same URL
      3. Server redirects to a detail page (LicenseVerification?LicInd=...&Procde=...)
      4. Parse the <dl class="dl-horizontal"> block: <dt> labels / <dd> values
    """
    REQUIRES_SELENIUM = False
    SEARCH_URL = "https://mqa-internet.doh.state.fl.us/MQASearchServices/HealthCareProviders"

    def verify(self, license_number: str, supplier_name: str | None = None) -> VerificationResult:
        # FL DOH MQA stores license numbers without spaces or hyphens (e.g. "TT7317" not "TT 7317")
        license_number = re.sub(r"[\s\-]", "", license_number).upper()

        session = requests.Session()
        session.headers.update({
            "User-Agent": "Mozilla/5.0 GWSBot/1.0",
            "Referer": self.SEARCH_URL,
        })

        get_resp = session.get(self.SEARCH_URL, timeout=30)
        get_resp.raise_for_status()
        get_soup = BeautifulSoup(get_resp.text, "lxml")
        token_tag = get_soup.find("input", {"name": "__RequestVerificationToken"})
        if not token_tag or not token_tag.get("value"):
            return self.error("Could not fetch FL DOH MQA CSRF token")

        post_resp = session.post(
            self.SEARCH_URL,
            data={
                "__RequestVerificationToken": token_tag["value"],
                "SearchDto.LicenseNumber": license_number,
                "SearchDto.Board": "",
                "SearchDto.Profession": "",
            },
            timeout=30,
            allow_redirects=True,
        )
        post_resp.raise_for_status()

        text_lower = post_resp.text.lower()
        if "no records" in text_lower or "no results" in text_lower:
            return self.not_found(f"FL DOH MQA: no records for {license_number}")

        soup = BeautifulSoup(post_resp.text, "lxml")
        dl = soup.find("dl", class_="dl-horizontal")
        if not dl:
            return self.not_found(f"FL DOH MQA: could not parse detail page for {license_number}")

        fields: dict[str, str] = {}
        dts = dl.find_all("dt")
        dds = dl.find_all("dd")
        for dt, dd in zip(dts, dds):
            label = " ".join(dt.get_text(" ", strip=True).split())
            value = " ".join(dd.get_text(" ", strip=True).split())
            if label:
                fields[label] = value

        status_text = fields.get("License Status", "").upper()
        effective = _parse_date(fields.get("License Original Issue Date", ""))
        expiration = _parse_date(fields.get("License Expiration Date", ""))
        raw = {"fields": fields}

        if "ACTIVE" in status_text or "CLEAR" in status_text:
            return self.active(effective, expiration, raw)
        if "EXPIRED" in status_text or "DELINQUENT" in status_text:
            return self.expired(effective, expiration, raw)
        if "NULL" in status_text or "REVOKED" in status_text or "TERMINATED" in status_text or "RETIRED" in status_text:
            return self.terminated(effective, expiration, raw)

        return VerificationResult(
            status="NOT_FOUND",
            raw_data=raw,
            error_message=f"Unrecognized FL DOH MQA status: {fields.get('License Status')}",
        )
