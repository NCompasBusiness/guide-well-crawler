"""Send email notifications on run completion or failure."""
from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config.settings import settings

logger = logging.getLogger(__name__)


def _send(subject: str, body: str) -> None:
    if not settings.SMTP_HOST or not settings.NOTIFY_EMAILS:
        logger.debug("SMTP not configured — skipping notification")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_USER
    msg["To"] = ", ".join(settings.NOTIFY_EMAILS)
    msg.attach(MIMEText(body, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            if settings.SMTP_PASS:
                server.login(settings.SMTP_USER, settings.SMTP_PASS)
            server.sendmail(settings.SMTP_USER, settings.NOTIFY_EMAILS, msg.as_string())
        logger.info("Notification sent to %s", settings.NOTIFY_EMAILS)
    except Exception as exc:
        logger.error("Failed to send notification: %s", exc)


def notify_run_complete(
    run_id: str,
    total: int,
    success: int,
    failed: int,
    manual: int,
    errors: int,
    duration_minutes: int,
) -> None:
    pct = round(success / total * 100) if total else 0
    subject = f"[GWS License Verify] Run complete — {pct}% verified ({total:,} licenses)"
    body = f"""
    <h2>Verification Run Complete</h2>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
      <tr><td style="padding:4px 12px;color:#666">Run ID</td><td><code>{run_id}</code></td></tr>
      <tr><td style="padding:4px 12px;color:#666">Total Licenses</td><td><strong>{total:,}</strong></td></tr>
      <tr><td style="padding:4px 12px;color:#666">Active</td><td style="color:#16a34a">{success:,}</td></tr>
      <tr><td style="padding:4px 12px;color:#666">Expired / Terminated</td><td style="color:#dc2626">{failed:,}</td></tr>
      <tr><td style="padding:4px 12px;color:#666">Manual Review Required</td><td style="color:#9333ea">{manual:,}</td></tr>
      <tr><td style="padding:4px 12px;color:#666">Errors</td><td style="color:#ea580c">{errors:,}</td></tr>
      <tr><td style="padding:4px 12px;color:#666">Duration</td><td>{duration_minutes} minutes</td></tr>
    </table>
    {"<p style='color:#9333ea;font-weight:bold'>⚠ " + str(manual) + " items require manual review. Log in to the portal to resolve them.</p>" if manual else ""}
    <p><a href="{settings.WEBAPP_WEBHOOK_URL.replace('/api/webhooks/crawler', '')}">Open Portal</a></p>
    """
    _send(subject, body)


def notify_run_failed(run_id: str, error_message: str) -> None:
    subject = "[GWS License Verify] Run FAILED — action required"
    body = f"""
    <h2 style="color:#dc2626">Verification Run Failed</h2>
    <p>Run ID: <code>{run_id}</code></p>
    <p>Error: <pre>{error_message}</pre></p>
    <p>Please check the crawler logs and retry the run from the portal.</p>
    """
    _send(subject, body)
