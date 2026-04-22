"""
North Carolina — nc_medical_board
API-backed lookup; no browser required.
"""
from __future__ import annotations

import logging
import re

import requests

from crawlers.base_crawler import BaseCrawler, VerificationResult

logger = logging.getLogger(__name__)

_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4}")


def _parse_date(text: str | None) -> str | None:
    if not text:
        return None
    m = _DATE_RE.search(str(text))
    if not m:
        return None
    val = m.group()
    if "-" in val:
        return val
    parts = val.split("/")
    return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"


class NcMedicalBoardCrawler(BaseCrawler):
    REQUIRES_SELENIUM = False
    API_URL = "https://www.ncmedboard.org/resources-information/professional-profile-search/api/search"

    def verify(self, license_number: str, supplier_name: str | None = None) -> VerificationResult:
        session = requests.Session()
        session.headers.update({
            "User-Agent": "Mozilla/5.0 GWSBot/1.0",
            "Accept": "application/json",
        })

        resp = session.get(
            self.API_URL,
            params={"license": license_number},
            timeout=30,
        )
        resp.raise_for_status()

        results = resp.json()
        if not results:
            return self.not_found()

        item = results[0] if isinstance(results, list) else results
        status_text = str(item.get("status", "")).upper()
        effective = _parse_date(item.get("effectiveDate") or item.get("issueDate"))
        expiry = _parse_date(item.get("expirationDate") or item.get("renewalDate"))

        if "ACTIVE" in status_text or "CURRENT" in status_text:
            return self.active(effective, expiry, item)
        elif "EXPIRED" in status_text:
            return self.expired(effective, expiry, item)
        elif "REVOKED" in status_text or "SUSPENDED" in status_text or "SURRENDERED" in status_text:
            return self.terminated(effective, expiry, item)

        return self.not_found(f"Unrecognized NC status: {item.get('status')}")
