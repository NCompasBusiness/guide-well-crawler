"""
Pre-flight check: validate all agency URLs before a run.
Flags broken URLs so they are queued for manual review rather than wasting workers.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

import requests

logger = logging.getLogger(__name__)

TIMEOUT = 15
WORKERS = 20


@dataclass
class UrlCheckResult:
    agency_id: str
    crawler_key: str
    url: str
    ok: bool
    status_code: int | None
    error: str | None


def check_url(agency_id: str, crawler_key: str, url: str) -> UrlCheckResult:
    try:
        resp = requests.head(
            url,
            timeout=TIMEOUT,
            allow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 GWSBot/1.0"},
        )
        ok = resp.status_code < 400
        return UrlCheckResult(agency_id, crawler_key, url, ok, resp.status_code, None)
    except requests.exceptions.ConnectionError as e:
        return UrlCheckResult(agency_id, crawler_key, url, False, None, f"Connection error: {e}")
    except requests.exceptions.Timeout:
        return UrlCheckResult(agency_id, crawler_key, url, False, None, "Timeout")
    except Exception as e:
        return UrlCheckResult(agency_id, crawler_key, url, False, None, str(e))


def validate_all_agencies(agencies: list[dict]) -> list[UrlCheckResult]:
    """
    Check URLs for all agencies in parallel.
    agencies: list of dicts with keys: id, crawlerKey, websiteUrl
    Returns list of UrlCheckResult sorted by ok=False first.
    """
    results: list[UrlCheckResult] = []

    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        futures = {
            executor.submit(check_url, a["id"], a["crawlerKey"], a["websiteUrl"]): a
            for a in agencies
        }
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            if not result.ok:
                logger.warning(
                    "URL check FAILED for %s (%s): %s — %s",
                    result.crawler_key, result.url, result.status_code, result.error,
                )

    results.sort(key=lambda r: r.ok)
    return results


def print_report(results: list[UrlCheckResult]) -> None:
    broken = [r for r in results if not r.ok]
    ok_count = len(results) - len(broken)
    print(f"\nURL Validation Report")
    print(f"  OK:     {ok_count}")
    print(f"  Broken: {len(broken)}")
    if broken:
        print("\nBroken URLs:")
        for r in broken:
            print(f"  [{r.status_code or 'ERR'}] {r.crawler_key} — {r.url}")
            if r.error:
                print(f"         {r.error}")
    print()
