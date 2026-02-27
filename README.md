# JobHQ

A self-hosted job search automation platform — track, evaluate, and prioritize job opportunities with AI-assisted analysis.

## About

JobHQ was built to solve one core problem: **submitting quality applications as early as possible**. Being an early applicant dramatically increases your chances, but manually tracking hundreds of listings across Indeed, LinkedIn, and Glassdoor is unsustainable.

This tool helps you:

- **Aggregate** job listings from multiple platforms into one place
- **Filter** irrelevant positions automatically (wrong level, low salary, no visa sponsorship)
- **Evaluate** opportunities with AI to decide which are worth a tailored resume + cover letter, and which to skip entirely
- **Track** your pipeline from discovery to offer

All AI-powered features use a **prompt export/import** approach — you copy a prompt, paste it into any LLM you already subscribe to (ChatGPT, Gemini, Claude, etc.), and import the structured results back. This means **zero additional AI costs**.

> This project was built entirely with [Claude Code](https://claude.ai/claude-code) (Opus 4.6) as an agentic coding experiment — zero hand-written code. Full agent-driven automation has been tested and works, but this self-hosted version prioritizes zero cost over convenience.

## Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | Job pipeline overview with status counts and recent activity |
| **Import** | Parse job listings from email alerts via AI prompt (Gmail integration or manual paste) |
| **Rule Engine** | Configurable filters with exclude/include/flag/protect actions, regex, salary comparisons |
| **Company Research** | AI-assisted company evaluation — H1B history, size, application strategy |
| **Job Evaluation** | AI-assisted scoring — export prompt, get scores, import results |
| **Deep Analysis** | Detailed JD-resume matching with strengths, concerns, and recommendations |
| **Visa Tracking** | Company-level H1B filtering + job-level visa sponsorship detection |
| **Setup Wizard** | First-run configuration for visa preferences, resume, and filter rule templates |

## Recommended Workflow

After deploying and completing the Setup Wizard:

1. **Set up job alerts** on Indeed, LinkedIn, Glassdoor, etc. — have them delivered to your email
2. **Daily import** — Go to the Import page, copy the prompt template, paste it into your AI with your email content, then import the JSON output
3. **Evaluate** — On the Evaluate page, export company research and job evaluation prompts, run them through your AI, and import the results
4. **Apply strategically** — High-scoring jobs get tailored resumes and cover letters (use Deep Analysis for guidance). Lower-scoring jobs get quick applications or are skipped entirely

## Deployment

### Requirements

- **Node.js** 20+ LTS
- **npm**
- **OS**: Ubuntu 22/24 LTS or macOS
- **Resources**: ~512 MB RAM, ~1 GB disk

### Quick Start

```bash
git clone <repo-url> jobhq
cd jobhq
bash scripts/deploy.sh
```

The deploy script will:
- Check/install Node.js 20+ and build dependencies
- Run `npm install`
- Create `.env.local` from `.env.example`
- Build the production bundle

Then start the server:

```bash
npm start
```

Open http://localhost:3000 and complete the Setup Wizard.

### Manual Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local if needed (defaults work for most setups)

# 3. Build
npm run build

# 4. Start
npm start
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_PATH` | Yes | — | Path to SQLite database file (e.g., `./data/jobhq.db`) |
| `NODE_ENV` | No | `development` | Set to `production` for production builds |
| `PORT` | No | `3000` | Server port |

### Running as a Service

#### With pm2

```bash
npm install -g pm2
pm2 start npm --name jobhq -- start
pm2 save
pm2 startup   # auto-start on reboot
```

#### With systemd

Create `/etc/systemd/system/jobhq.service`:

```ini
[Unit]
Description=JobHQ
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/jobhq
ExecStart=/usr/bin/npm start
Restart=on-failure
Environment=NODE_ENV=production
Environment=DATABASE_PATH=/opt/jobhq/data/jobhq.db
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable jobhq
sudo systemctl start jobhq
```

### Reverse Proxy (nginx)

```nginx
server {
    listen 80;
    server_name jobhq.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Tech Stack

- **Framework**: Next.js 16 + React 19
- **Language**: TypeScript 5
- **Database**: SQLite via better-sqlite3
- **Styling**: Tailwind CSS 4
- **Fonts**: Geist Sans + Geist Mono

## Project Structure

```
src/
  app/
    api/          # REST API routes
      jobs/       # Job CRUD + re-evaluate + visa scan
      companies/  # Company CRUD
      rules/      # Filter rule CRUD + reorder + test
      settings/   # Settings CRUD
      setup/      # Setup wizard API
      import/     # JSON import + evaluation/company/deep-analysis import
      export/     # Evaluation, company, deep-analysis prompt export
    jobs/         # Job list + detail pages
    companies/    # Company list + detail pages
    evaluate/     # Export/import UI for AI evaluation
    import/       # Import page with prompt template
    rules/        # Rule management UI
    settings/     # Settings page
    setup/        # Setup wizard
  lib/
    repositories/ # Database access layer
    migrations/   # Schema migrations
    export/       # Prompt exporters
    import/       # Result parsers
    rule-engine.ts
    db.ts
    init.ts
  types/          # TypeScript type definitions
data/
  jobhq.db       # SQLite database (created at runtime)
```

## Credits

Built with [Claude Code](https://claude.ai/claude-code) (Opus 4.6).
