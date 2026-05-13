"""
SQLite-backed DB client for the crawler.

We share a single SQLite file with the Next.js UI (Prisma-managed).
When GWS moves to on-prem PostgreSQL, this module is the only swap point.
"""
from __future__ import annotations

import json
import logging
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Generator

from config.settings import settings

logger = logging.getLogger(__name__)


def _cuid_like() -> str:
    return "c" + uuid.uuid4().hex[:24]


def _now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="milliseconds") + "Z"


def _to_datetime_iso(value: str | None) -> str | None:
    """Normalize date/datetime strings to full ISO 8601 datetime that Prisma's
    DateTime column accepts. Crawlers return date-only strings (YYYY-MM-DD);
    Prisma needs YYYY-MM-DDTHH:MM:SS.sssZ."""
    if value is None or value == "":
        return None
    if len(value) == 10 and value[4] == "-" and value[7] == "-":
        return f"{value}T00:00:00.000Z"
    return value


@contextmanager
def get_conn() -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(settings.DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _row_to_dict(row: sqlite3.Row | None) -> dict | None:
    return {k: row[k] for k in row.keys()} if row else None


def fetch_pending_run() -> dict | None:
    with get_conn() as conn:
        cur = conn.execute(
            '''SELECT id, "totalCount", "triggeredBy"
               FROM "VerificationRun"
               WHERE status = 'PENDING'
               ORDER BY "createdAt" ASC
               LIMIT 1'''
        )
        return _row_to_dict(cur.fetchone())


def fetch_suppliers_for_run() -> list[dict]:
    with get_conn() as conn:
        cur = conn.execute(
            '''SELECT
                   s.id             AS id,
                   s."supplierName" AS "supplierName",
                   s."licenseNumber" AS "licenseNumber",
                   s."licenseType"  AS "licenseType",
                   s.state          AS state,
                   a.id             AS "agencyId",
                   a."crawlerKey"   AS "crawlerKey",
                   a."websiteUrl"   AS "websiteUrl",
                   a."isCaptchaBlocked"    AS "isCaptchaBlocked",
                   a."isUrlBroken"         AS "isUrlBroken",
                   a."isPasswordProtected" AS "isPasswordProtected"
               FROM "Supplier" s
               JOIN "LicensingAgency" a ON a.id = s."agencyId"
               WHERE s."isActive" = 1
               ORDER BY a."crawlerKey", s."licenseNumber"'''
        )
        return [_row_to_dict(r) for r in cur.fetchall()]


def mark_run_started(run_id: str) -> None:
    with get_conn() as conn:
        conn.execute(
            '''UPDATE "VerificationRun"
               SET status = 'RUNNING', "startedAt" = ?, "updatedAt" = ?
               WHERE id = ?''',
            (_now_iso(), _now_iso(), run_id),
        )


def write_verification_result(
    run_id: str,
    supplier_id: str,
    status: str,
    effective_date: str | None,
    termination_date: str | None,
    raw_data: dict | None,
    error_message: str | None,
    requires_manual: bool,
    manual_reason: str | None,
) -> str:
    verification_id = _cuid_like()
    raw_data_text = json.dumps(raw_data) if raw_data else None
    with get_conn() as conn:
        conn.execute(
            '''INSERT INTO "LicenseVerification"
                   (id, "runId", "supplierId", status,
                    "effectiveDate", "terminationDate",
                    "rawData", "errorMessage",
                    "requiresManual", "manualReason", "verifiedAt")
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (
                verification_id, run_id, supplier_id, status,
                _to_datetime_iso(effective_date), _to_datetime_iso(termination_date),
                raw_data_text, error_message,
                1 if requires_manual else 0, manual_reason, _now_iso(),
            ),
        )
        conn.execute(
            '''UPDATE "Supplier"
               SET "lastStatus" = ?, "lastVerifiedAt" = ?, "updatedAt" = ?
               WHERE id = ?''',
            (status, _now_iso(), _now_iso(), supplier_id),
        )
    return verification_id


def finalize_run(
    run_id: str,
    total: int,
    success: int,
    failed: int,
    manual: int,
    errors: int,
) -> None:
    final_status = "PARTIAL" if manual > 0 else "COMPLETED"
    with get_conn() as conn:
        conn.execute(
            '''UPDATE "VerificationRun"
               SET status = ?, "completedAt" = ?,
                   "totalCount" = ?, "successCount" = ?, "failedCount" = ?,
                   "manualCount" = ?, "errorCount" = ?, "updatedAt" = ?
               WHERE id = ?''',
            (final_status, _now_iso(), total, success, failed,
             manual, errors, _now_iso(), run_id),
        )


def fail_run(run_id: str, error_message: str) -> None:
    with get_conn() as conn:
        conn.execute(
            '''UPDATE "VerificationRun"
               SET status = 'FAILED', "completedAt" = ?, notes = ?, "updatedAt" = ?
               WHERE id = ?''',
            (_now_iso(), error_message, _now_iso(), run_id),
        )


def update_agency_last_success(agency_id: str) -> None:
    with get_conn() as conn:
        conn.execute(
            '''UPDATE "LicensingAgency"
               SET "lastSuccessAt" = ?, "updatedAt" = ?
               WHERE id = ?''',
            (_now_iso(), _now_iso(), agency_id),
        )


# ── Helpers only used by run.py seed/validate commands ───────────────────────

def list_agencies() -> list[dict]:
    with get_conn() as conn:
        cur = conn.execute(
            'SELECT id, "crawlerKey", "websiteUrl" FROM "LicensingAgency"'
        )
        return [_row_to_dict(r) for r in cur.fetchall()]


def set_agency_url_broken(agency_id: str, is_broken: bool) -> None:
    with get_conn() as conn:
        conn.execute(
            '''UPDATE "LicensingAgency"
               SET "isUrlBroken" = ?, "updatedAt" = ?
               WHERE id = ?''',
            (1 if is_broken else 0, _now_iso(), agency_id),
        )


def upsert_agency(a: dict[str, Any]) -> tuple[bool, bool]:
    """Insert or update an agency by crawlerKey. Returns (inserted, updated)."""
    with get_conn() as conn:
        cur = conn.execute(
            'SELECT id FROM "LicensingAgency" WHERE "crawlerKey" = ?',
            (a["crawlerKey"],),
        )
        existing = cur.fetchone()
        now = _now_iso()
        if existing:
            conn.execute(
                '''UPDATE "LicensingAgency"
                   SET name = ?, state = ?, "websiteUrl" = ?,
                       "isCaptchaBlocked" = ?, "isUrlBroken" = ?,
                       "isPasswordProtected" = ?, notes = ?, "updatedAt" = ?
                   WHERE id = ?''',
                (
                    a["name"], a["state"], a["websiteUrl"],
                    1 if a.get("isCaptchaBlocked", False) else 0,
                    1 if a.get("isUrlBroken", False) else 0,
                    1 if a.get("isPasswordProtected", False) else 0,
                    a.get("notes"), now, existing["id"],
                ),
            )
            return (False, True)
        conn.execute(
            '''INSERT INTO "LicensingAgency"
                   (id, name, state, "websiteUrl", "crawlerKey",
                    "isCaptchaBlocked", "isUrlBroken", "isPasswordProtected",
                    notes, "createdAt", "updatedAt")
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (
                _cuid_like(), a["name"], a["state"], a["websiteUrl"], a["crawlerKey"],
                1 if a.get("isCaptchaBlocked", False) else 0,
                1 if a.get("isUrlBroken", False) else 0,
                1 if a.get("isPasswordProtected", False) else 0,
                a.get("notes"), now, now,
            ),
        )
        return (True, False)
