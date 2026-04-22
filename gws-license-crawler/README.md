# GWS License Crawler

Python batch engine for DME supplier license verification. Runs independently from the web UI, on-prem, as a scheduled background task.

## Setup

```bash
# 1. Create virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate      # Linux/macOS

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
copy .env.example .env
# Edit .env with DB credentials and webhook secret

# 4. Seed agencies into the database (run once after DB migration)
python run.py --seed-agencies
```

## Usage

```bash
# Start the scheduler (runs quarterly + polls for web-triggered runs every 60s)
python run.py

# Run immediately against the oldest PENDING run
python run.py --now

# Check health of all agency URLs
python run.py --validate-urls

# Test a single crawler without writing to DB
python run.py --test-crawler fl_ahca --license FL12345678

# List all registered crawlers
python run.py --list-crawlers
```

## Running as a Windows Service / Scheduled Task

**Windows Task Scheduler (recommended for on-prem):**
```
Action: Start a program
Program: C:\Path\To\gws-license-crawler\.venv\Scripts\python.exe
Arguments: C:\Path\To\gws-license-crawler\run.py
Start in: C:\Path\To\gws-license-crawler
```
Set trigger to run at startup and repeat every hour (the scheduler handles the actual cron internally).

**Linux cron (alternative):**
```cron
@reboot /opt/gws-crawler/.venv/bin/python /opt/gws-crawler/run.py >> /var/log/gws-crawler.log 2>&1
```

## Adding a New Agency Crawler

1. Copy `crawlers/states/template.py` → `crawlers/states/<state>_<agency>.py`
2. Rename the class and set `REQUIRES_SELENIUM = True/False`
3. Implement `verify(license_number, supplier_name)`
4. Register in `crawlers/registry.py`
5. Add entry in `config/agencies.json`
6. Test: `python run.py --test-crawler <your_key> --license TEST123`

## Architecture

```
run.py                    ← CLI entrypoint
core/
  scheduler.py            ← APScheduler: quarterly cron + 60s poll
  batch_runner.py         ← Orchestrates a full run (ThreadPoolExecutor)
  db_client.py            ← Direct PostgreSQL read/write
  notifier.py             ← Email notifications
crawlers/
  base_crawler.py         ← Abstract base class + VerificationResult
  registry.py             ← crawlerKey → class mapping
  states/                 ← One file per state/agency group
config/
  settings.py             ← Environment-based config
  agencies.json           ← Agency metadata (seeded to DB via --seed-agencies)
utils/
  url_validator.py        ← Pre-run URL health check
  captcha_handler.py      ← CAPTCHA detection (solving intentionally not automated)
```

## Tier Classification

| Tier | Handling | % of agencies |
|------|----------|---------------|
| 1 — Simple form/API | `requests` + `BeautifulSoup` | ~60% |
| 2 — Multi-step navigation | `Selenium` | ~30% |
| 3 — CAPTCHA protected | Flagged → manual review queue | ~10% |
| Broken URL | Flagged → ops team fixes URL | Variable |
