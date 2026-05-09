# FirstIn — User Edition

A self-hosted, multi-user job search automation platform — aggregate, evaluate, and prioritize job opportunities with an AI-assisted scoring pipeline.

## About

FirstIn was built to solve one core problem: **submitting quality applications as early as possible**. Being an early applicant dramatically increases your chances, but manually triaging hundreds of listings across LinkedIn, Indeed, and email alerts is unsustainable.

This tool helps you:

- **Aggregate** job listings from multiple sources (LinkedIn / Indeed extensions, mbox email alerts, JSON import) into one place
- **Filter** irrelevant positions automatically (wrong level, low salary, no visa sponsorship)
- **Evaluate** opportunities with AI scoring (1–10) and category tags, deciding which deserve a tailored application
- **Auto-process** new jobs in the background — research the company, clean the JD, and evaluate, all without manual prompt copy/paste
- **Track** your pipeline from discovery to offer, with daily activity charts
- **Collaborate** — multi-user with per-user data isolation and admin-managed feature/quota groups

Two AI delivery modes are supported:

1. **Manual prompt export/import** — copy a prompt, paste it into any LLM you already subscribe to (ChatGPT, Gemini, Claude.ai, etc.), import structured results back. **Zero additional AI cost** to FirstIn itself.
2. **Auto-eval worker** — runs `claude -p` (Claude CLI) in the background. Costs accrue against your Anthropic key, with per-run cost/token tracking in the audit log.

> Built with [Claude Code](https://claude.ai/claude-code) (Opus 4.7).

## Features

### Core
| Feature | Description |
|---------|-------------|
| **Multi-User Auth** | Per-user accounts with scrypt password hashing, session management, invite-only registration |
| **Per-User DB Isolation** | Each user gets their own SQLite file (`data/user-{id}.db`); shared `auth.db` only stores accounts/sessions |
| **Admin Panel** | User management — list users, disable/enable, delete, generate invite codes, assign permission groups |
| **Permission Groups** | Configurable feature flags + usage quotas per user (see below) |
| **Setup Wizard** | First-run configuration for visa preferences, resume, and filter rule templates |
| **Database Export** | Download a full copy of your SQLite database |

### Job Ingestion
| Feature | Description |
|---------|-------------|
| **Chrome Extension (LinkedIn)** | Single-click save + batch save from search results, virtualized list aware (auto-scroll + polling to avoid lazy-render misses) |
| **Chrome Extension (Indeed)** | Save from `/viewjob` and `/jobs?vjk=...` SPA; batch save from search list (card-level only, no JD enrichment due to anti-bot) |
| **mbox Email Import** | Parse LinkedIn / Indeed job alert emails; extract jobs with company, title, location, JD link |
| **JSON Import** | Paste structured job data directly |
| **Cross-Source Dedup** | Source ID fast path → content hash → trigram JD similarity (>0.7) — same role from LinkedIn + Indeed merges into one record |

### Filtering & Rules
| Feature | Description |
|---------|-------------|
| **Rule Engine** | Configurable filters with `exclude` / `include` / `flag` / `protect` actions, regex, salary comparisons, and priority-based protect-overrides-exclude semantics |
| **Visa Tracking** | Company-level H1B history filtering + job-level visa sponsorship detection (scans for "without sponsorship" phrases) |
| **Manual Archive** | One-click archive with categorized reasons; rejected jobs cool-down at company level |

### AI Scoring Pipeline
| Feature | Description |
|---------|-------------|
| **Company Research** | AI-assisted company evaluation — H1B history, size, funding round, application limits, cooldown periods |
| **Job Evaluation** | 1–10 score with reason, plus category tags; status routing: `ready_to_apply` / `pending_deep_analysis` / `archived_low_match` |
| **JD Cleaner** | Haiku-based batch cleanup of HTML / boilerplate from raw JD text — preserves structure, removes noise, stored in `jd_cleaned_text` |
| **Recheck Pipeline** | Borderline jobs (score 4–6) re-evaluated with single-job depth and enriched candidate context — independent score, no anchor bias |
| **Deep Analysis** | Detailed JD-resume matching with strengths, concerns, and recommendations — for top-tier candidates |
| **Rejection Scan** | Detect rejection emails from your inbox, mark companies into cooldown automatically |

### Automation
| Feature | Description |
|---------|-------------|
| **Auto-Eval Worker** | Background 3-phase pipeline: company research → JD cleanup → job evaluation. Runs via `claude -p` CLI |
| **Manual / Auto Mode** | One-shot pass or continuous polling (~30 s cadence). Triggered/stopped from admin |
| **Ultra Mode** | Per-phase 3× parallelism + Opus-based 20% QA sample for evaluation accuracy |
| **Cost & Token Audit** | Every auto-eval run logged to `auto_eval_log` (run_type, status, tokens, cost USD, duration ms) |
| **QA Flagging** | QA layer can flag jobs / companies as low-quality output; red banner on detail page; admin can clear |

### Customization
| Feature | Description |
|---------|-------------|
| **Prompt Registry** | All scoring prompts editable in-app — 22 keys across evaluation / scoring rules / recheck / company / deep analysis / rejection. Append-only versioning with restore-to-version |
| **Workspace Editor** | UI for editing prompts, viewing version history, comparing against the bundled default |
| **Application Meta** | Mark jobs as "Resume Tailored" / "Has Referral" — feeds the daily activity chart |

### Dashboard
| Feature | Description |
|---------|-------------|
| **Daily Activity Chart** | 7 / 30 / 90 / 365-day window. Stacked bars: tailored vs non-tailored applications. Lines: gross new jobs vs active (non-archived) new jobs |
| **Status Counts** | Pipeline overview by status (pending_eval, ready_to_apply, applied, etc.) |
| **Pending Counters** | Auto-eval surfaces how many companies / JDs / jobs await processing |

## Permission Groups

Admins create named groups; each group bundles **feature flags** and **usage quotas**. Users without an assignment fall back to the default group; admins always bypass checks.

**Feature flags (7):**
`can_import`, `can_export`, `can_eval`, `can_use_extension`, `can_manage_rules`, `can_import_rejections`, `can_research`

**Quota dimensions (3, `0` = unlimited):**
- `max_jobs` — total jobs in user's DB
- `max_eval_per_month` — evaluations performed per calendar month (UTC)
- `max_import_per_day` — imports per day

Counters live in `usage_tracking` (user × dimension × period). Exactly one group can be marked `is_default=true`; new users land in the default automatically.

## Recommended Workflow

After deploying and completing the Setup Wizard:

1. **Install the Chrome Extension** — Settings page → generate extension token → load `extension/` (unpacked) in Chrome
2. **Capture jobs** — browse LinkedIn / Indeed, the extension marks jobs as **New** or **Saved** with status badge; batch-select to save in one shot
3. **(Alternative) Email import** — point the mbox importer at exported LinkedIn / Indeed alert emails
4. **Let auto-eval do triage** *(optional)* — admin enables the worker; it researches companies, cleans JDs, and scores jobs in the background
5. **(Alternative) Manual evaluate** — Workspace tab → select pending companies / jobs → copy prompt → paste into your LLM → paste result back
6. **Recheck borderline jobs** — for jobs scored 4–6 in `ready_to_apply`, run recheck for a deeper second pass
7. **Apply strategically** — `proceed` jobs get tailored resumes (mark "Resume Tailored"), `mass_apply` for volume practice, lower scores skipped

## Deployment

### Requirements

- **Node.js** 20+ LTS
- **npm**
- **OS**: Ubuntu 22 / 24 LTS or macOS
- **Resources**: ~512 MB RAM, ~1 GB disk
- **Optional**: Anthropic API key + `claude` CLI installed in `PATH` (only needed for auto-eval worker)

### Quick Start

```bash
git clone https://github.com/CyberWanderess/FirstIn.git firstin
cd firstin
npm install
cp .env.example .env.local
npm run build
npm start
```

Open http://localhost:3000 and register your account (first user becomes admin).

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Set to `production` for production builds |
| `PORT` | No | `3000` | Server port |
| `AUTH_DB_PATH` | No | `./data/auth.db` | Path to the shared auth database |
| `EXTENSION_ALLOWED_ORIGINS` | No | `*` (dev) / blocked (prod) | Comma-separated origins for Chrome extension CORS |
| `ANTHROPIC_API_KEY` | Auto-eval only | — | Picked up by the `claude` CLI for the worker |

### Running as a Service

#### With pm2

```bash
npm install -g pm2
pm2 start npm --name firstin -- start
pm2 save
pm2 startup   # auto-start on reboot
```

#### With systemd

Create `/etc/systemd/system/firstin.service`:

```ini
[Unit]
Description=FirstIn
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/firstin
ExecStart=/usr/bin/npm start
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable firstin
sudo systemctl start firstin
```

### Reverse Proxy (nginx)

```nginx
server {
    listen 80;
    server_name firstin.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

## Tech Stack

- **Framework**: Next.js 16 + React 19
- **Language**: TypeScript 5
- **Database**: SQLite via better-sqlite3 (per-user isolation)
- **Charts**: Recharts 3
- **Auth**: scrypt password hashing, session tokens, extension API tokens (SHA-256 hashed)
- **AI Worker** *(optional)*: `claude -p` CLI for auto-eval pipeline
- **Styling**: Tailwind CSS 4
- **Testing**: Vitest

## Project Structure

```
src/
  app/
    api/
      admin/
        users/                    # User CRUD + invite codes
        permission-groups/        # Permission group CRUD + set-default
      auth/                       # login / register / logout / change-password / me
      auto-eval/worker/           # Auto-eval worker control (start/stop/status)
      auto-eval-log/              # Read audit log entries
      dashboard/daily-stats/      # Daily activity chart data
      extension/                  # save / save-batch / check (Chrome ext endpoints)
      jobs/                       # Job CRUD + re-evaluate + visa scan
      companies/                  # Company CRUD
      rules/                      # Filter rule CRUD + reorder + test
      settings/                   # Settings + extension token
      prompts/                    # Prompt registry CRUD + version history + restore
      import/
        json/                     # Paste structured job data
        mbox/                     # Email alert import
        rejections/               # Rejection email scan
        recheck/                  # Apply recheck results
      export/
        evaluate/                 # Job eval prompt export
        companies/                # Company research prompt export
        deep-analysis/            # Deep analysis prompt export
        rejections/               # Rejection scan prompt export
        recheck/                  # Recheck prompt export (borderline jobs)
        database/                 # Full DB download
    admin/                        # Admin dashboard + permissions section
    jobs/                         # Job list + detail (with application-meta editor + QA banner)
    companies/                    # Company list + detail (with sort control)
    workspace/                    # Evaluate + prompts management UI
    import/, rules/, settings/, setup/
    daily-stats-chart.tsx         # Home page chart (recharts)
  lib/
    repositories/                 # job, company, rule, settings, dashboard, prompt
    migrations/                   # Schema migrations 001-022
    export/
      archived-prompts/           # Date-stamped baselines (per prompt-change protocol)
      evaluation-defaults.ts      # Default eval prompts
      scoring-rules.ts            # Shared scoring rules (eval + recheck)
      evaluation-recheck.ts       # Recheck-specific framing
      prompt-registry.ts          # 22-key registry definitions
    auth-db.ts                    # Auth database (users, sessions, invites, ext tokens)
    permissions.ts                # Permission group enforcement
    rate-limit.ts                 # IP-based rate limiting
    dedup.ts                      # Cross-source job deduplication
    rule-engine.ts                # Pure rule evaluator (no DB)
    jd-cleaner.ts                 # Haiku-driven JD cleanup
    db.ts                         # Per-user DB isolation via AsyncLocalStorage
  types/                          # TypeScript type definitions
extension/
  src/content/
    linkedin/                     # LinkedIn adapter (single + batch save, virtualized list)
    indeed/                       # Indeed adapter (viewjob + search list, card-level batch)
scripts/
  auto-evaluate.ts                # Auto-eval worker process (spawned via tsx)
  smoke-*.ts                      # Smoke test scripts for prompt experiments
data/
  auth.db                         # Shared auth database
  user-{id}.db                    # Per-user databases
```

## Database Migrations

| ID | Purpose |
|----|---------|
| 001–016 | Initial schema, Chinese affinity, deep analysis, visa, apply URL, cooldown, status renames, score tags + success, application limits, funding round, currency, source IDs, posted_at, dedup dismissals |
| 017 | `application_meta` — `resume_tailored`, `has_referral` on jobs |
| 018 | `auto_eval_log` table — run_type, status, tokens, cost USD, duration ms |
| 019 | `jd_cleaned_text` column on jobs |
| 020 | `qa_flagged` + `qa_notes` on jobs and companies |
| 021 | Performance indexes — source dedup, company FK, lower-name lookup |
| 022 | `prompt_templates` table — versioned, append-only, latest-row-wins |

## Changelog

### Current — Stability & UX Refinement (2026-05-09)

- **:4001 perf fix** — `/api/extension/check` and `/check-batch` slow path no longer load the full 10 k jobs per ~8 s extension poll; switched to indexed `listJobsByCompanyId` + per-batch per-company cache. CPU profile previously showed 21 % GC and the filter-builder at 3 s self-time over a 17.5 s window
- **`perf-pulse` PM2 process** — 60 s lightweight snapshot of fd / vmsize / accept-queue into `~/perf-pulse.log` to distinguish polling-overload slowness from the separate epoll-not-accepting fd-leak stall pattern
- **Dashboard archived breakdown** — compact card summarizing `rejected_resume` / `archived_filtered` (no-visa vs other) / `archived_low_match` / `archived_no_response` / `archived_manual` (with manual reason tally + estimated post-eval mismatch rate)
- **Per-request log + SIGUSR2 cpu profiler** — middleware emits `[req] <ts> <method> <path>` for every non-static request; `instrumentation.ts` registers a SIGUSR2 → 5 s V8 profile dumped to `cpu-profile-<ts>.cpuprofile`
- **`diag-stuck.sh` PID resolution** — five fallback strategies (fuser → ss → lsof → pm2 child walk → pgrep) because Next 16's worker cmdline doesn't reliably contain "next-server" or "4001"
- **DB pragmas + `getJobCount` cleanup** — WAL/synchronous/mmap tightening; admin-context fallback no longer leaks a Database handle per call
- **Cookie `Secure` derives from request protocol** — auto-enables when an HTTPS reverse proxy is in front, doesn't break direct HTTP access
- **PM2 guardrails** — `max_memory_restart: '1G'` + `cron_restart: '0 */6 * * *'` self-clear long-tail VmSize bloat

### v0.5.0 — Auto-Eval & Customization Era (2026-04-29)

- **Auto-eval worker** — 3-phase background pipeline (company research, JD cleanup, evaluation) via `claude -p`; manual / auto / ultra modes
- **Auto-eval audit log** — every run records tokens + cost + duration; surfaced in the admin UI
- **Dashboard chart** — recharts-based daily activity (tailored vs non-tailored applications, gross vs active new jobs)
- **Permission groups** — feature flags + per-period quotas, default group, admin CRUD
- **Prompt registry** — 22 prompt keys editable in-app with append-only version history and restore
- **Recheck pipeline** — borderline jobs (4–6) re-evaluated with single-job depth and shared scoring rules
- **Indeed extension** — `viewjob` + search-list adapter; card-level batch save to dodge anti-bot
- **LinkedIn virtualization fix** — throttled observer + 2 s polling + auto-scroll for lazy-rendered cards
- **JD cleaner** — Haiku batch cleanup with `splitLongLines`, stored in `jd_cleaned_text`
- **Application meta** — "Resume Tailored" / "Has Referral" toggles on job detail
- **QA flag banner** — red banner on QA-flagged jobs / companies with admin-only clear action
- **Migrations 017–022**

### v0.4.0 — Multi-Tenant (2026-04-03)

- Multi-user authentication with scrypt + 30-day sessions
- Per-user database isolation
- Admin panel with invite codes
- Chrome Extension (LinkedIn) with single + batch save
- Cross-source dedup (source ID + content hash + trigram similarity)
- Security hardening (rate limiting, timing-safe login, token hashing, CORS)

### v0.3.0 — Job List Overhaul & Testing (2026-03-03)

- Multi-select filters, score tags, manual archive
- Vitest framework with 119 unit tests
- PII protection in release pipeline
- English-only UI

### v0.2.0 — Evaluation & Company Research (2026-02-28)

- Project rename JobHQ → FirstIn
- Company cooldown, mass apply tier, deep analysis
- Visa tracking, feature flags

### v0.1.0 — Initial Release

- Dashboard, job list, company management
- Rule engine, AI prompt export/import workflow
- Setup wizard, SQLite migrations, deploy script

## Credits

Built with [Claude Code](https://claude.ai/claude-code) (Opus 4.7).
