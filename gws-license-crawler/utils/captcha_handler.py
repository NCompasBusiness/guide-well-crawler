"""
CAPTCHA handling utilities.

Strategy: Do NOT attempt to solve CAPTCHAs automatically.
Instead, detect CAPTCHA presence and flag the record as MANUAL_REQUIRED
so the operations team can resolve it via the web UI issue queue.

This module provides detection helpers only.
If GWS later subscribes to a CAPTCHA solving service (e.g., 2Captcha, Anti-Captcha),
the solve() function below can be implemented without touching the crawlers.
"""
from __future__ import annotations

import logging
import re

from bs4 import BeautifulSoup
from selenium.webdriver.remote.webdriver import WebDriver

logger = logging.getLogger(__name__)

_CAPTCHA_PATTERNS = [
    re.compile(r"captcha", re.I),
    re.compile(r"recaptcha", re.I),
    re.compile(r"cloudflare", re.I),
    re.compile(r"challenge-form", re.I),
    re.compile(r"g-recaptcha", re.I),
    re.compile(r"h-captcha", re.I),
]

_CAPTCHA_IFRAME_SRCS = [
    "google.com/recaptcha",
    "hcaptcha.com",
]


def is_captcha_page_html(html: str) -> bool:
    """Detect CAPTCHA presence in raw HTML."""
    for pattern in _CAPTCHA_PATTERNS:
        if pattern.search(html):
            return True

    soup = BeautifulSoup(html, "lxml")
    for iframe in soup.find_all("iframe"):
        src = iframe.get("src", "")
        if any(hint in src for hint in _CAPTCHA_IFRAME_SRCS):
            return True

    return False


def is_captcha_page_driver(driver: WebDriver) -> bool:
    """Detect CAPTCHA presence using an active Selenium driver."""
    return is_captcha_page_html(driver.page_source)


def solve(image_base64: str, site_key: str | None = None, page_url: str | None = None) -> str | None:
    """
    Placeholder for future CAPTCHA solving service integration.

    To implement:
      1. Subscribe to a service like 2Captcha (https://2captcha.com)
      2. Store API key in .env as CAPTCHA_SOLVER_API_KEY
      3. Call the service API here and return the solved token

    Returns the solved token string, or None if solving failed.
    """
    logger.warning(
        "CAPTCHA solving is not configured. Record will be flagged for manual review."
    )
    return None
