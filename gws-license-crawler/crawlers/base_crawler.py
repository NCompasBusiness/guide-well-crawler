"""
Base crawler class. Every state agency crawler inherits from this.

Implementing a new agency:
  1. Copy crawlers/states/template.py to crawlers/states/<state>_<agency>.py
  2. Implement the `verify()` method.
  3. Register the crawler in crawlers/registry.py.
  4. Add an entry in config/agencies.json.
"""
from __future__ import annotations

import logging
import shutil
import tempfile
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

logger = logging.getLogger(__name__)


@dataclass
class VerificationResult:
    status: str                       # VerificationStatus enum value
    effective_date: str | None = None  # ISO date string YYYY-MM-DD
    termination_date: str | None = None
    raw_data: dict[str, Any] | None = None
    error_message: str | None = None
    requires_manual: bool = False
    manual_reason: str | None = None  # ManualReason enum value


class BaseCrawler(ABC):
    """Abstract base for all agency-specific crawlers."""

    # Set to True in the subclass if this site needs a real browser
    REQUIRES_SELENIUM: bool = True

    def __init__(self, settings: Any) -> None:
        self.settings = settings
        self._driver: webdriver.Chrome | None = None
        self._user_data_dir: str | None = None

    # ── Public API ────────────────────────────────────────────────────────────

    @abstractmethod
    def verify(self, license_number: str, supplier_name: str | None = None) -> VerificationResult:
        """
        Perform one license lookup.
        Must return a VerificationResult; must NOT raise on expected failures.
        """

    def verify_with_retry(
        self,
        license_number: str,
        supplier_name: str | None = None,
        max_retries: int = 3,
    ) -> VerificationResult:
        last_error: Exception | None = None
        for attempt in range(1, max_retries + 1):
            try:
                result = self.verify(license_number, supplier_name)
                return result
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "Attempt %d/%d failed for license %s: %s",
                    attempt, max_retries, license_number, exc,
                )
                time.sleep(attempt * 2)  # back-off
            finally:
                self._quit_driver()

        return VerificationResult(
            status="ERROR",
            error_message=f"All {max_retries} attempts failed: {last_error}",
        )

    # ── Selenium helpers ──────────────────────────────────────────────────────

    def _get_driver(self) -> webdriver.Chrome:
        if self._driver is None:
            self._user_data_dir = tempfile.mkdtemp(prefix="gws_chrome_")
            opts = Options()
            if self.settings.HEADLESS:
                opts.add_argument("--headless=new")
            opts.add_argument("--no-sandbox")
            opts.add_argument("--disable-dev-shm-usage")
            opts.add_argument("--disable-gpu")
            opts.add_argument("--window-size=1280,900")
            opts.add_argument("--remote-allow-origins=*")
            opts.add_argument("--disable-blink-features=AutomationControlled")
            opts.add_argument(f"--user-data-dir={self._user_data_dir}")
            opts.add_argument(
                "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
            service = Service(ChromeDriverManager().install())
            self._driver = webdriver.Chrome(service=service, options=opts)
            self._driver.set_page_load_timeout(30)
        return self._driver

    def _quit_driver(self) -> None:
        if self._driver:
            try:
                self._driver.quit()
            except Exception:
                pass
            self._driver = None
        if self._user_data_dir:
            shutil.rmtree(self._user_data_dir, ignore_errors=True)
            self._user_data_dir = None

    def _wait(self, timeout: int = 10) -> WebDriverWait:
        return WebDriverWait(self._get_driver(), timeout)

    # ── Result helpers ────────────────────────────────────────────────────────

    @staticmethod
    def active(effective: str | None = None, termination: str | None = None, raw: dict | None = None) -> VerificationResult:
        return VerificationResult(
            status="ACTIVE",
            effective_date=effective,
            termination_date=termination,
            raw_data=raw,
        )

    @staticmethod
    def expired(effective: str | None = None, termination: str | None = None, raw: dict | None = None) -> VerificationResult:
        return VerificationResult(
            status="EXPIRED",
            effective_date=effective,
            termination_date=termination,
            raw_data=raw,
        )

    @staticmethod
    def terminated(effective: str | None = None, termination: str | None = None, raw: dict | None = None) -> VerificationResult:
        return VerificationResult(
            status="TERMINATED",
            effective_date=effective,
            termination_date=termination,
            raw_data=raw,
        )

    @staticmethod
    def not_found(msg: str = "License not found on agency site") -> VerificationResult:
        return VerificationResult(status="NOT_FOUND", error_message=msg)

    @staticmethod
    def manual_required(reason: str, msg: str = "") -> VerificationResult:
        return VerificationResult(
            status="MANUAL_REQUIRED",
            requires_manual=True,
            manual_reason=reason,
            error_message=msg,
        )

    @staticmethod
    def error(msg: str) -> VerificationResult:
        return VerificationResult(status="ERROR", error_message=msg)
