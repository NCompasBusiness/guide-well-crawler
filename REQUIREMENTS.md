# DME Supplier License Verification — Requirements Document

**Client:** GuideWell Source (GWS)  
**Prepared by:** NCompas Business Solutions  
**Date:** 2026-04-22  
**Version:** 1.0

---

## 1. Background

GuideWell Source (GWS) is a government subcontractor managing the Medicare DME (Durable Medical Equipment) supplier portfolio on behalf of CMS (Centers for Medicare & Medicaid Services). A regulatory obligation requires GWS to verify that every DME supplier license is active and current, reported on a quarterly basis to CMS.

Today this process is performed entirely manually by 3–4 staff in the Provider Enrollment Operations team, working from a large Excel workbook. As GWS has won additional business, the supplier count has grown to a point where manual verification is no longer sustainable.

---

## 2. Goals

| Goal | Description |
|---|---|
| **Automate license verification** | Reduce manual effort by automatically querying state licensing agency websites |
| **Maximize automation coverage** | Target ≥ 60% fully automated; remainder flagged for assisted or manual review |
| **Replace Excel** | Provide a web-based UI as the single system of record for supplier data and results |
| **Audit trail** | Store all verification records for CMS compliance and audit purposes |
| **SSO access** | Users log in with the same credentials they use for other GWS intranet applications |
| **On-prem deployable** | All components run within GWS's existing on-prem / CMS Cloud infrastructure |

---

## 3. Stakeholders

| Name | Role | Responsibility |
|---|---|---|
| Rick McClure | Head of Software Engineering, GWS | Executive sponsor; approves architecture and tech stack |
| Ajit Perakatte | Senior Manager, GWS | Owns functional requirements; team will maintain the system post-delivery |
| Tom Osborne | Enterprise IT Solutions Architect, GWS | Reviews architecture; must sign off on any new technology introduced |
| Meriwether (Operations Director) | Provider Enrollment Operations, GWS | Primary end user; currently does the manual verification work |

---

## 4. Scope

### 4.1 In Scope

- Web application (intranet) for supplier data management, run management, results review, and issue resolution
- Automated crawler engine (separate deployable) for batch license verification
- PostgreSQL database as the system of record
- SSO authentication via Microsoft Entra ID (Azure AD) or on-prem AD FS
- Reporting output equivalent to the current Excel report
- Audit log of all verification runs
- Manual review queue for CAPTCHA-blocked and broken-URL cases

### 4.2 Out of Scope

- Integration with CMS's own API (GWS feeds into that API; cannot use it for verification)
- HIPAA/PHI data handling (this data is entirely public)
- Mobile application
- External vendor-managed license services

---

## 5. Data Description

### 5.1 Input Data (from existing Excel)

| Field | Description |
|---|---|
| Supplier Name | Legal name of the DME supplier |
| License Number | State-issued license identifier |
| License Type | Category of DME license |
| State | 2-letter state code (29 states) |
| Effective Date | Date the license became active |
| Termination Date | Date the license expires or was terminated |

### 5.2 Licensing Agency Reference Data

| Field | Description |
|---|---|
| Agency Name | Name of the state licensing body |
| State | State the agency operates in |
| Website URL | URL of the agency's license lookup page |
| Crawler Key | Unique key identifying which scraper handles this agency |
| CAPTCHA Protected | Whether the site uses CAPTCHA |
| URL Broken | Whether the stored URL is currently unresolvable |
| Password Protected | Whether login credentials are required |

**Scale:** ~200 licensing agencies across 29 states; ~40,000 license records per quarterly run.

### 5.3 Verification Output

| Field | Description |
|---|---|
| Verification Status | ACTIVE / EXPIRED / TERMINATED / NOT_FOUND / ERROR / MANUAL_REQUIRED |
| Effective Date (verified) | Date confirmed from agency website |
| Termination Date (verified) | Expiry/termination date confirmed from agency website |
| Requires Manual Review | Boolean flag |
| Manual Reason | CAPTCHA_REQUIRED / BROKEN_URL / PASSWORD_PROTECTED / COMPLEX_NAVIGATION / SITE_UNAVAILABLE / OTHER |
| Error Message | Human-readable error detail when verification fails |
| Verified At | Timestamp of verification |

---

## 6. Functional Requirements

### 6.1 Authentication & Authorization

| ID | Requirement |
|---|---|
| AUTH-01 | Users must authenticate via the same SSO provider used for GWS intranet (Microsoft Entra ID / AD FS) |
| AUTH-02 | Three roles: ADMIN (full access), OPERATOR (can run verification, resolve issues), VIEWER (read-only) |
| AUTH-03 | Unauthenticated requests to any page must redirect to login |
| AUTH-04 | Session tokens must expire after 8 hours of inactivity |

### 6.2 Supplier Management

| ID | Requirement |
|---|---|
| SUP-01 | Display paginated, searchable, filterable list of all suppliers |
| SUP-02 | Filter by state, license type, last verification status, agency |
| SUP-03 | Allow bulk import of suppliers from Excel/CSV (migration from existing workbook) |
| SUP-04 | Allow individual supplier add, edit, deactivate |
| SUP-05 | Show each supplier's last verification status and date inline in the table |
| SUP-06 | Export current supplier list + latest verification status to CSV/Excel |

### 6.3 Licensing Agency Management

| ID | Requirement |
|---|---|
| AGY-01 | Display all licensing agencies with URL, state, crawler key, and current health status |
| AGY-02 | Allow ADMIN to flag an agency URL as broken and enter a replacement URL |
| AGY-03 | Show count of suppliers per agency |
| AGY-04 | Visual indicator (color-coded) for CAPTCHA-blocked, broken-URL, and password-protected agencies |
| AGY-05 | Track last successful verification date per agency |

### 6.4 Verification Runs

| ID | Requirement |
|---|---|
| RUN-01 | OPERATOR/ADMIN can trigger a new quarterly verification run from the UI |
| RUN-02 | Run status updates in near-real-time (polling every 30 seconds) while a run is in progress |
| RUN-03 | Dashboard shows current run progress: total / completed / failed / manual-required counts |
| RUN-04 | Completed runs listed with summary statistics (date, counts per status) |
| RUN-05 | Drill into any run to see per-supplier results with full detail |
| RUN-06 | Export run results to Excel/CSV for CMS submission |
| RUN-07 | Runs can also be triggered by the crawler on a cron schedule without UI interaction |

### 6.5 Issue Queue (Manual Review)

| ID | Requirement |
|---|---|
| ISS-01 | Separate page listing all records that require manual review from the latest (or any) run |
| ISS-02 | Each issue shows: supplier, agency, reason (CAPTCHA / broken URL / etc.), error detail |
| ISS-03 | OPERATOR can mark an issue as manually resolved, entering the verified status and dates |
| ISS-04 | Resolved issues are written back into the run's results so the final report is complete |
| ISS-05 | Broken URL issues allow OPERATOR to enter a corrected URL, which propagates to the agency record |
| ISS-06 | Filter issues by type, state, run, and resolution status |

### 6.6 Dashboard

| ID | Requirement |
|---|---|
| DASH-01 | Summary cards: total suppliers, last run date, active licenses, expired, manual required, errors |
| DASH-02 | Donut/pie chart of latest run results by status |
| DASH-03 | List of the 5 most recent runs with status badges |
| DASH-04 | Alert banner when a run is currently in progress |
| DASH-05 | Alert banner when there are unresolved manual review items from the latest run |

### 6.7 Notifications & Alerting

| ID | Requirement |
|---|---|
| NOT-01 | Email notification to OPERATOR group when a scheduled run completes |
| NOT-02 | Email notification when a run fails entirely |
| NOT-03 | In-app badge on the Issues nav item showing count of unresolved manual items |
| NOT-04 | Crawler posts run progress updates to the web app via internal webhook API |

---

## 7. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Performance | A full run of 40,000 licenses must complete within 8 hours when run overnight |
| NFR-02 | Concurrency | Crawler must support configurable parallel workers (default: 10) per agency |
| NFR-03 | Reliability | Failed individual license lookups must be retried up to 3 times before marking as ERROR |
| NFR-04 | Maintainability | Adding a new agency crawler must require only: (a) writing one new Python class, (b) adding one entry to agencies.json, (c) no changes to core runner |
| NFR-05 | Security | No PHI/HIPAA data; however all DB connections and API calls must use TLS. Secrets managed via environment variables, never committed |
| NFR-06 | Infrastructure | All components must run on Windows Server or Linux on-prem; no external cloud dependencies at runtime |
| NFR-07 | Compatibility | Web app must work in Chrome and Edge (GWS standard browsers) |
| NFR-08 | Audit | Every verification result stored permanently; runs never deleted |

---

## 8. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   GWS Intranet Network               │
│                                                     │
│  ┌──────────────────┐      ┌───────────────────┐   │
│  │  Next.js Web App │◄────►│   PostgreSQL DB   │   │
│  │  (Node.js server)│      │   (on-prem)       │   │
│  └────────┬─────────┘      └────────▲──────────┘   │
│           │  SSO                    │               │
│           ▼                         │               │
│  ┌──────────────────┐               │               │
│  │  Microsoft Entra │               │               │
│  │  ID / AD FS      │    ┌──────────┴──────────┐   │
│  └──────────────────┘    │  Python Crawler     │   │
│                           │  (background task)  │   │
│                           │  Windows Task Sched │   │
│                           │  or cron (Linux)    │   │
│                           └──────────┬──────────┘   │
│                                      │               │
│                           Scrapes state agency sites  │
└─────────────────────────────────────┼───────────────┘
                                      │ HTTPS
                              ┌───────▼────────┐
                              │  ~200 State    │
                              │  Agency Sites  │
                              └────────────────┘
```

### Component Repos

| Repo | Technology | Purpose |
|---|---|---|
| `gws-license-ui` | Next.js 14, TypeScript, Prisma, PostgreSQL | Web UI + REST API |
| `gws-license-crawler` | Python 3.11, Selenium, psycopg2 | Batch verification engine |

---

## 9. Crawler Architecture

### Site Complexity Classification

| Tier | % of ~200 agencies | Handling Strategy |
|---|---|---|
| **Tier 1 — Simple form** | ~60% | HTTP POST/GET scrape or simple Selenium form fill |
| **Tier 2 — Multi-step navigation** | ~30% | Full Selenium navigation with wait conditions |
| **Tier 3 — CAPTCHA protected** | ~10% | Selenium + human-in-the-loop via UI issue queue |
| **Broken URL** | Variable | Flagged in agency table; operation team provides corrected URL |
| **Password protected** | Rare | Flagged; GWS operations provides credentials stored in env secrets |

### Crawler Conventions

- Every crawler extends `BaseCrawler` and implements `verify(license_number, supplier_name) -> VerificationResult`
- Crawler key is the registry identifier (e.g., `fl_ahca`, `ga_composite_medical`)
- Crawlers write results directly to PostgreSQL
- Crawler reports progress to the web app via HTTP webhook after each agency batch

---

## 10. Migration Plan

1. Bulk import existing Excel workbook into the new DB via the Import feature (SUP-03)
2. Run one full verification batch and compare results against the last manual run
3. Operations team uses the web UI for quarterly reporting instead of Excel going forward
4. Existing Excel workbook retained as read-only archive

---

## 11. Open Items / Decisions Needed from GWS

| # | Item | Owner |
|---|---|---|
| 1 | Confirm SSO provider: Azure AD or on-prem AD FS | Rick / Tom |
| 2 | Share the complete agency URL spreadsheet for crawler build-out | Ajit / Meriwether |
| 3 | Share the 50-record complex sample set (used in vendor evaluation) | Rick / Meriwether |
| 4 | Confirm DB server platform: PostgreSQL on Windows Server or Linux | Tom |
| 5 | Confirm acceptable run window: overnight batch or business hours? | Ajit / Meriwether |
| 6 | Confirm email server (SMTP) available for notifications | Tom |
| 7 | Provide any credentials needed for password-protected agency sites | Meriwether |
