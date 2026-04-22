"""
Crawler registry.

Maps crawlerKey strings (stored in the LicensingAgency DB table and agencies.json)
to their crawler class.

Adding a new crawler:
  1. Import the class here.
  2. Add one line: REGISTRY["your_crawler_key"] = YourCrawlerClass
"""
from __future__ import annotations

from typing import Type

from crawlers.base_crawler import BaseCrawler

# ── State imports ─────────────────────────────────────────────────────────────
from crawlers.states.florida import FlAhcaCrawler, FlDbprCrawler
from crawlers.states.georgia import GaCompositeMedicalCrawler, GaProfessionalLicensingCrawler
from crawlers.states.texas import TxDshsCrawler, TxHhsCrawler
from crawlers.states.north_carolina import NcMedicalBoardCrawler
from crawlers.states.illinois import IlIdfprCrawler

REGISTRY: dict[str, Type[BaseCrawler]] = {
    # Florida
    "fl_ahca": FlAhcaCrawler,
    "fl_dbpr": FlDbprCrawler,
    # Georgia
    "ga_composite_medical": GaCompositeMedicalCrawler,
    "ga_professional_licensing": GaProfessionalLicensingCrawler,
    # Texas
    "tx_dshs": TxDshsCrawler,
    "tx_hhs": TxHhsCrawler,
    # North Carolina
    "nc_medical_board": NcMedicalBoardCrawler,
    # Illinois
    "il_idfpr": IlIdfprCrawler,
    # Add additional state crawlers here as they are implemented
}


def get_crawler(key: str) -> Type[BaseCrawler] | None:
    return REGISTRY.get(key)


def list_registered() -> list[str]:
    return sorted(REGISTRY.keys())
