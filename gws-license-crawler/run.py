#!/usr/bin/env python3
"""
GWS License Crawler — main entrypoint.

Usage:
  python run.py                      # Start the scheduler (polls every 60s + quarterly cron)
  python run.py --now                # Run immediately against the oldest PENDING run
  python run.py --validate-urls      # Check all agency URLs and print a health report
  python run.py --test-crawler KEY --license LICENSE_NUMBER
                                     # Test one crawler without writing to DB
  python run.py --list-crawlers      # List all registered crawler keys
"""
import argparse
import logging
import sys

from dotenv import load_dotenv
load_dotenv()

from config.settings import settings

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("gws-crawler")


def cmd_start_scheduler() -> None:
    from core.scheduler import start
    logger.info("Starting GWS License Crawler scheduler…")
    start()


def cmd_run_now() -> None:
    from core.batch_runner import run_batch
    logger.info("Running immediately against oldest PENDING run…")
    ran = run_batch()
    if not ran:
        logger.warning("No PENDING runs found. Use the web portal to create one, or check the DB.")
        sys.exit(1)


def cmd_validate_urls() -> None:
    from core import db_client
    from utils.url_validator import validate_all_agencies, print_report

    agencies = db_client.list_agencies()
    if not agencies:
        logger.warning("No agencies found in DB. Have you seeded agencies.json?")
        sys.exit(1)

    results = validate_all_agencies(agencies)
    print_report(results)

    for r in results:
        db_client.set_agency_url_broken(r.agency_id, not r.ok)


def cmd_test_crawler(crawler_key: str, license_number: str) -> None:
    from crawlers.registry import get_crawler
    crawler_cls = get_crawler(crawler_key)
    if not crawler_cls:
        logger.error("No crawler found for key: %s", crawler_key)
        logger.info("Registered crawlers: %s", ", ".join(__import__("crawlers.registry", fromlist=["list_registered"]).list_registered()))
        sys.exit(1)

    logger.info("Testing crawler '%s' with license '%s'…", crawler_key, license_number)
    crawler = crawler_cls(settings)
    result = crawler.verify_with_retry(license_number, max_retries=1)

    print(f"\nResult:")
    print(f"  Status         : {result.status}")
    print(f"  Effective Date : {result.effective_date}")
    print(f"  Termination    : {result.termination_date}")
    print(f"  Requires Manual: {result.requires_manual}")
    print(f"  Manual Reason  : {result.manual_reason}")
    print(f"  Error Message  : {result.error_message}")
    if result.raw_data:
        print(f"  Raw Data       : {result.raw_data}")


def cmd_list_crawlers() -> None:
    from crawlers.registry import list_registered
    keys = list_registered()
    print(f"\nRegistered crawlers ({len(keys)}):")
    for key in keys:
        print(f"  {key}")


def cmd_seed_agencies() -> None:
    """Seed/update the LicensingAgency table from config/agencies.json."""
    import json
    from pathlib import Path
    from core import db_client

    path = Path(__file__).parent / "config" / "agencies.json"
    agencies = json.loads(path.read_text())
    inserted = updated = 0

    for a in agencies:
        ins, upd = db_client.upsert_agency(a)
        inserted += int(ins)
        updated += int(upd)

    logger.info("Seeded agencies from agencies.json — inserted=%d updated=%d", inserted, updated)


def main() -> None:
    parser = argparse.ArgumentParser(description="GWS License Crawler")
    parser.add_argument("--now", action="store_true", help="Run immediately against pending run")
    parser.add_argument("--validate-urls", action="store_true", help="Check all agency URLs")
    parser.add_argument("--test-crawler", metavar="KEY", help="Test a single crawler")
    parser.add_argument("--license", metavar="NUMBER", help="License number for --test-crawler")
    parser.add_argument("--list-crawlers", action="store_true", help="List registered crawlers")
    parser.add_argument("--seed-agencies", action="store_true", help="Seed agencies.json into DB")
    args = parser.parse_args()

    if args.now:
        cmd_run_now()
    elif args.validate_urls:
        cmd_validate_urls()
    elif args.test_crawler:
        if not args.license:
            parser.error("--test-crawler requires --license NUMBER")
        cmd_test_crawler(args.test_crawler, args.license)
    elif args.list_crawlers:
        cmd_list_crawlers()
    elif args.seed_agencies:
        cmd_seed_agencies()
    else:
        cmd_start_scheduler()


if __name__ == "__main__":
    main()
