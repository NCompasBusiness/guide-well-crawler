"""
APScheduler-based cron runner for unattended quarterly verification runs.

Also supports one-shot immediate execution via run.py --now.
The scheduler polls for PENDING runs every 60 seconds so that runs
triggered from the web UI are picked up promptly.
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from config.settings import settings
from core.batch_runner import run_batch
from core import db_client

logger = logging.getLogger(__name__)


def _create_pending_run_and_execute() -> None:
    """Scheduled job: create a PENDING run then immediately process it."""
    import psycopg2
    logger.info("Scheduler triggered — creating quarterly verification run")
    try:
        with db_client.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT COUNT(*) FROM "Supplier" WHERE "isActive" = true
                    """
                )
                total = cur.fetchone()[0]
                cur.execute(
                    """
                    INSERT INTO "VerificationRun"
                        (id, status, "totalCount", "triggeredBy", "createdAt", "updatedAt")
                    VALUES
                        (gen_random_uuid()::text, 'PENDING', %s, 'scheduler', NOW(), NOW())
                    """,
                    (total,),
                )
    except Exception as exc:
        logger.error("Failed to create scheduled run: %s", exc)
        return

    run_batch()


def _poll_for_pending() -> None:
    """Poll job: pick up runs triggered from the web UI."""
    pending = db_client.fetch_pending_run()
    if pending:
        logger.info("Poll: found pending run %s", pending["id"])
        run_batch()


def start() -> None:
    scheduler = BlockingScheduler(timezone="America/New_York")

    # Quarterly cron (configurable via SCHEDULE_CRON env var)
    parts = settings.SCHEDULE_CRON.split()
    if len(parts) == 5:
        minute, hour, day, month, day_of_week = parts
        scheduler.add_job(
            _create_pending_run_and_execute,
            CronTrigger(
                minute=minute,
                hour=hour,
                day=day,
                month=month,
                day_of_week=day_of_week,
            ),
            id="quarterly_run",
            name="Quarterly Verification Run",
            replace_existing=True,
        )
        logger.info("Quarterly run scheduled: %s", settings.SCHEDULE_CRON)

    # Poll every 60 seconds to pick up web-triggered runs
    scheduler.add_job(
        _poll_for_pending,
        IntervalTrigger(seconds=60),
        id="poll_pending",
        name="Poll for Pending Runs",
        replace_existing=True,
    )

    logger.info("Scheduler started. Press Ctrl+C to exit.")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped.")
