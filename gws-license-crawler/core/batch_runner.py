"""
Orchestrates a full verification run.

Flow:
  1. Poll DB for the oldest PENDING VerificationRun.
  2. Mark it RUNNING and fetch all active suppliers.
  3. Group suppliers by crawlerKey (agency).
  4. Dispatch each group to the matching crawler (in parallel, WORKERS workers).
  5. Write every result back to DB via db_client.write_verification_result().
  6. Finalize the run and send notification.
"""
from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from config.settings import settings
from core import db_client, notifier
from crawlers.registry import get_crawler
from crawlers.base_crawler import VerificationResult

logger = logging.getLogger(__name__)


@dataclass
class _Task:
    supplier: dict[str, Any]
    run_id: str


def _process_task(task: _Task) -> tuple[str, VerificationResult]:
    supplier = task.supplier
    crawler_key = supplier["crawlerKey"]

    crawler_cls = get_crawler(crawler_key)
    if crawler_cls is None:
        logger.warning("No crawler registered for key '%s'", crawler_key)
        return supplier["id"], VerificationResult(
            status="MANUAL_REQUIRED",
            requires_manual=True,
            manual_reason="OTHER",
            error_message=f"No crawler implemented for key: {crawler_key}",
        )

    # Fast-path: skip if agency URL is broken
    if supplier.get("isUrlBroken"):
        return supplier["id"], VerificationResult(
            status="MANUAL_REQUIRED",
            requires_manual=True,
            manual_reason="BROKEN_URL",
            error_message="Agency URL is marked as broken",
        )

    # Fast-path: CAPTCHA-protected sites go straight to manual queue
    if supplier.get("isCaptchaBlocked"):
        return supplier["id"], VerificationResult(
            status="MANUAL_REQUIRED",
            requires_manual=True,
            manual_reason="CAPTCHA_REQUIRED",
            error_message="Agency site is CAPTCHA protected",
        )

    crawler = crawler_cls(settings)
    result = crawler.verify_with_retry(
        license_number=supplier["licenseNumber"],
        supplier_name=supplier["supplierName"],
        max_retries=settings.MAX_RETRIES,
    )
    time.sleep(settings.RATE_LIMIT_SECS)
    return supplier["id"], result


def run_batch() -> bool:
    """
    Execute one pending verification run.
    Returns True if a run was processed, False if none was pending.
    """
    pending = db_client.fetch_pending_run()
    if not pending:
        logger.info("No pending runs found.")
        return False

    run_id = pending["id"]
    logger.info("Starting run %s (total=%s, triggered_by=%s)",
                run_id, pending["totalCount"], pending["triggeredBy"])

    db_client.mark_run_started(run_id)
    started_at = datetime.utcnow()

    suppliers = db_client.fetch_suppliers_for_run()
    if not suppliers:
        db_client.fail_run(run_id, "No active suppliers found")
        return True

    tasks = [_Task(supplier=dict(s), run_id=run_id) for s in suppliers]

    counters = {"success": 0, "failed": 0, "manual": 0, "errors": 0}
    agency_success: set[str] = set()

    try:
        with ThreadPoolExecutor(max_workers=settings.WORKERS) as executor:
            futures = {executor.submit(_process_task, task): task for task in tasks}
            for future in as_completed(futures):
                task = futures[future]
                try:
                    supplier_id, result = future.result()
                except Exception as exc:
                    logger.error("Task failed for supplier %s: %s",
                                 task.supplier["id"], exc)
                    supplier_id = task.supplier["id"]
                    result = VerificationResult(
                        status="ERROR",
                        requires_manual=False,
                        error_message=str(exc),
                    )

                db_client.write_verification_result(
                    run_id=run_id,
                    supplier_id=supplier_id,
                    status=result.status,
                    effective_date=result.effective_date,
                    termination_date=result.termination_date,
                    raw_data=result.raw_data,
                    error_message=result.error_message,
                    requires_manual=result.requires_manual,
                    manual_reason=result.manual_reason,
                )

                if result.status == "ACTIVE":
                    counters["success"] += 1
                    agency_success.add(task.supplier["agencyId"])
                elif result.requires_manual:
                    counters["manual"] += 1
                elif result.status in ("EXPIRED", "TERMINATED", "NOT_FOUND"):
                    counters["failed"] += 1
                else:
                    counters["errors"] += 1

    except Exception as exc:
        logger.exception("Batch runner crashed: %s", exc)
        db_client.fail_run(run_id, str(exc))
        notifier.notify_run_failed(run_id, str(exc))
        return True

    for agency_id in agency_success:
        db_client.update_agency_last_success(agency_id)

    total = len(suppliers)
    duration = int((datetime.utcnow() - started_at).total_seconds() / 60)

    db_client.finalize_run(
        run_id=run_id,
        total=total,
        success=counters["success"],
        failed=counters["failed"],
        manual=counters["manual"],
        errors=counters["errors"],
    )

    logger.info(
        "Run %s complete in %d min — total=%d success=%d failed=%d manual=%d errors=%d",
        run_id, duration, total,
        counters["success"], counters["failed"], counters["manual"], counters["errors"],
    )

    notifier.notify_run_complete(
        run_id=run_id,
        total=total,
        success=counters["success"],
        failed=counters["failed"],
        manual=counters["manual"],
        errors=counters["errors"],
        duration_minutes=duration,
    )

    return True
