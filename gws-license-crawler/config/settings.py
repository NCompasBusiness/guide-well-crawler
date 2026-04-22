import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

_DEFAULT_DB_PATH = str(
    (Path(__file__).resolve().parent.parent.parent / "gws-license-ui" / "prisma" / "dev.db")
)


class Settings:
    # Local SQLite database (shared with the Next.js UI via Prisma).
    # Set DB_PATH in .env to override.
    DB_PATH: str = os.getenv("DB_PATH", _DEFAULT_DB_PATH)

    # Web app webhook
    WEBAPP_WEBHOOK_URL: str = os.getenv("WEBAPP_WEBHOOK_URL", "http://localhost:3000/api/webhooks/crawler")
    CRAWLER_WEBHOOK_SECRET: str = os.getenv("CRAWLER_WEBHOOK_SECRET", "")

    # Crawler behaviour
    WORKERS: int = int(os.getenv("CRAWLER_WORKERS", "10"))
    MAX_RETRIES: int = int(os.getenv("CRAWLER_MAX_RETRIES", "3"))
    RATE_LIMIT_SECS: float = float(os.getenv("CRAWLER_RATE_LIMIT_SECS", "2"))
    HEADLESS: bool = os.getenv("CRAWLER_HEADLESS", "true").lower() == "true"

    # Notifications
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASS: str = os.getenv("SMTP_PASS", "")
    NOTIFY_EMAILS: list[str] = [
        e.strip() for e in os.getenv("NOTIFY_EMAILS", "").split(",") if e.strip()
    ]

    # Schedule
    SCHEDULE_CRON: str = os.getenv("SCHEDULE_CRON", "0 1 1 1,4,7,10 *")

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")


settings = Settings()
