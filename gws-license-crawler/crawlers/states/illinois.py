"""
Illinois — il_idfpr
ASP.NET ViewState form; uses requests + BeautifulSoup (no Selenium needed).
"""
from __future__ import annotations

import logging
import re

import requests
from bs4 import BeautifulSoup

from crawlers.base_crawler import BaseCrawler, VerificationResult

logger = logging.getLogger(__name__)

_DATE_RE = re.compile(r"\d{1,2}/\d{1,2}/\d{4}")
SEARCH_URL = "https://online-dfpr.micropact.com/lookup/licenselookup.aspx"


def _parse_date(text: str) -> str | None:
    m = _DATE_RE.search(text or "")
    if not m:
        return None
    parts = m.group().split("/")
    return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"


def _extract_viewstate(soup: BeautifulSoup) -> dict[str, str]:
    fields = {}
    for name in ("__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"):
        el = soup.find("input", {"name": name})
        if el:
            fields[name] = el.get("value", "")
    return fields


class IlIdfprCrawler(BaseCrawler):
    REQUIRES_SELENIUM = False

    def verify(self, license_number: str, supplier_name: str | None = None) -> VerificationResult:
        session = requests.Session()
        session.headers.update({
            "User-Agent": "Mozilla/5.0 GWSBot/1.0",
            "Referer": SEARCH_URL,
        })

        # Step 1: GET to extract ViewState
        resp = session.get(SEARCH_URL, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
        vs = _extract_viewstate(soup)

        # Step 2: POST search form
        form_data = {
            **vs,
            "__EVENTTARGET": "",
            "__EVENTARGUMENT": "",
            "ctl00$MainContentPlaceHolder$txtLicenseNumber": license_number,
            "ctl00$MainContentPlaceHolder$btnSearch": "Search",
        }
        resp2 = session.post(SEARCH_URL, data=form_data, timeout=30)
        resp2.raise_for_status()
        soup2 = BeautifulSoup(resp2.text, "lxml")

        # No results
        if soup2.find(string=re.compile(r"no records", re.I)):
            return self.not_found()

        result_table = soup2.find("table", {"id": re.compile(r"GridView", re.I)}) or \
                       soup2.find("table", {"class": re.compile(r"grid", re.I)})
        if not result_table:
            return self.not_found(f"Could not parse IDFPR result for {license_number}")

        for row in result_table.find_all("tr")[1:]:
            cells = [td.get_text(strip=True) for td in row.find_all("td")]
            if not cells:
                continue
            if license_number.upper() not in " ".join(cells).upper():
                continue

            # cols: License#, Name, Type, Status, Expiration
            status_text = cells[3].upper() if len(cells) > 3 else ""
            expiry = _parse_date(cells[4]) if len(cells) > 4 else None
            raw = {"cells": cells}

            if "ACTIVE" in status_text or "RENEWED" in status_text:
                return self.active(None, expiry, raw)
            elif "EXPIRED" in status_text:
                return self.expired(None, expiry, raw)
            elif "REVOKED" in status_text or "SUSPENDED" in status_text:
                return self.terminated(None, expiry, raw)

        return self.not_found(f"License {license_number} not found in IL IDFPR results")
