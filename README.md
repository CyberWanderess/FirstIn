# FirstIn — User Edition

A self-hosted, multi-user job search automation platform — track, evaluate, and prioritize job opportunities with AI-assisted analysis.

## About

FirstIn was built to solve one core problem: **submitting quality applications as early as possible**. Being an early applicant dramatically increases your chances, but manually tracking hundreds of listings across Indeed, LinkedIn, and Glassdoor is unsustainable.

This tool helps you:

- **Aggregate** job listings from multiple platforms into one place
- **Filter** irrelevant positions automatically (wrong level, low salary, no visa sponsorship)
- **Evaluate** opportunities with AI to decide which are worth a tailored resume + cover letter
- **Track** your pipeline from discovery to offer
- **Collaborate** — multi-user support with per-user data isolation

All AI-powered features use a **prompt export/import** approach — you copy a prompt, paste it into any LLM you already subscribe to (ChatGPT, Gemini, Claude, etc.), and import the structured results back. This means **zero additional AI costs**.

> Built with [Claude Code](https://claude.ai/claude-code) (Opus 4.6).

## Features

| Feature | Description |
|---------|-------------|
| **Multi-User Auth** | Per-user accounts with scrypt password hashing, session management, invite-only registration |
| **Admin Panel** | User management — list users, disable/enable, delete, generate invite codes |
| **Chrome Extension** | Save jobs from LinkedIn directly to FirstIn with one click or batch save |
| **Cross-Source Dedup** | Source ID fast path + content hash + trigram JD similarity (>0.7 threshold) |
| **Dashboard** | Job pipeline overview with status counts and recent activity |
| **Import** | Parse job listings from email alerts via AI prompt, or paste JSON directly |
| **Rule Engine** | Configurable filters with exclude/include/flag/protect actions, regex, salary comparisons |
| **Company Research** | AI-assisted company evaluation — H1B history, size, application limits, cooldown periods |
| **Job Evaluation** | AI-assisted scoring with 4-tier recommendations: proceed, mass_apply, skip, flag |
| **Deep Analysis** | Detailed JD-resume matching with strengths, concerns, and recommendations |
| **Visa Tracking** | Company-level H1B filtering + job-level visa sponsorship detection |
| **Setup Wizard** | First-run configuration for visa preferences, resume, and filter rule templates |
| **Database Export** | Download a full copy of your SQLite database |

## User Edition Highlights

This edition adds multi-tenant capabilities on top of the core platform:

- **Per-user databases** — each user gets an isolated SQLite database (`data/user-{id}.db`), complete data separation
- **Invite-only registration** — first user becomes admin, subsequent users need an invite code
- **Admin dashboard** — manage users, generate invites, view per-user job counts
- **Chrome Extension auth** — extension connects via per-user API token (Bearer auth)
- **Security hardening** — rate limiting on auth endpoints, timing-safe login, extension token hashing, CORS enforcement in production
- **Change password** — in Settings page, invalidates all sessions

## Recommended Workflow

After deploying and completing the Setup Wizard:

1. **Install the Chrome Extension** — go to Settings, generate an extension token, download the extension, load it in Chrome
2. **Browse LinkedIn** — the extension marks jobs as "New" or "Saved", select and batch-save with one click
3. **Daily import** — alternatively, use the Import page with AI prompt templates for email-based job alerts
4. **Evaluate** — export company research and job evaluation prompts, run through your AI, import results
5. **Apply strategically** — "proceed" jobs get tailored resumes. "mass_apply" for volume practice. Lower scores skipped

## Deployment

### Requirements

- **Node.js** 20+ LTS
- **npm**
- **OS**: Ubuntu 22/24 LTS or macOS
- **Resources**: ~512 MB RAM, ~1 GB disk

### Quick Start

```bash
git clone https://github.com/your-username/FirstIn.git firstin
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
- **Auth**: scrypt password hashing, session tokens, extension API tokens (SHA-256 hashed)
- **Styling**: Tailwind CSS 4
- **Fonts**: Geist Sans + Geist Mono

## Project Structure

```
src/
  app/
    api/          # REST API routes
      admin/      # Admin user/invite management
      auth/       # Login, register, logout, change password
      extension/  # Chrome extension endpoints (save, check, batch)
      jobs/       # Job CRUD + re-evaluate + visa scan
      companies/  # Company CRUD
      rules/      # Filter rule CRUD + reorder + test
      settings/   # Settings CRUD + extension token
      import/     # JSON import + evaluation/company/deep-analysis import
      export/     # Evaluation, company, deep-analysis prompt export
    admin/        # Admin dashboard
    jobs/         # Job list + detail pages
    companies/    # Company list + detail pages
    evaluate/     # Export/import UI for AI evaluation
    import/       # Import page
    rules/        # Rule management UI
    settings/     # Settings + extension token + change password
    setup/        # Setup wizard
  lib/
    repositories/ # Database access layer
    migrations/   # Schema migrations (001-015)
    export/       # Prompt exporters + importers
    auth-db.ts    # Auth database (users, sessions, invites, extension tokens)
    admin.ts      # Admin auth helper
    rate-limit.ts # IP-based rate limiting
    dedup.ts      # Cross-source job deduplication
    rule-engine.ts
    db.ts         # Per-user database isolation via AsyncLocalStorage
  types/          # TypeScript type definitions
extension/        # Chrome MV3 extension (LinkedIn integration)
data/
  auth.db         # Shared auth database (created at runtime)
  user-{id}.db    # Per-user databases (created at runtime)
```

## Changelog

### User Edition (2026-04-03)

- **Multi-user authentication** — per-user accounts with scrypt hashing, 30-day sessions
- **Per-user database isolation** — each user gets separate SQLite database
- **Admin panel** — user management, invite code generation, per-user stats
- **Invite-only registration** — closed registration, admin generates invite links
- **Chrome Extension** — save jobs from LinkedIn (single + batch), status badges on search results
- **Cross-source dedup** — source ID + content hash + JD trigram similarity
- **Security hardening** — rate limiting, timing-safe login, token hashing, CORS enforcement
- **Change password** — with automatic session invalidation
- **Disabled user support** — admin can disable accounts (immediate session revocation)

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

Built with [Claude Code](https://claude.ai/claude-code) (Opus 4.6).
