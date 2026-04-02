#!/usr/bin/env npx tsx
/**
 * Ashby Board API Job Fetcher
 *
 * Fetches job listings from Ashby's public Posting API (no auth required).
 * Companies are configured in config/job-sources.json.
 *
 * Usage:
 *   npx tsx scripts/fetch-ashby.ts              # fetch and insert
 *   npx tsx scripts/fetch-ashby.ts --dry-run    # print jobs, no DB write
 *   npx tsx scripts/fetch-ashby.ts --company openai  # single company only
 */

import './lib/load-env'; // must be first — sets DATABASE_PATH before config.ts loads
import { join } from 'path';
import { readFileSync } from 'fs';
import { getDb, closeDb } from '../src/lib/db';
import { runMigrations } from '../src/lib/migrations/runner';
import { cleanJdText } from '../src/lib/jd-cleaner';
import { processJobs, printResult, type JobCandidate } from './lib/process-jobs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const companyArg = args.includes('--company') ? args[args.indexOf('--company') + 1] : null;

interface AshbyConfig {
  company_slug: string;
  company: string;
}

interface AshbyJob {
  id: string;
  title: string;
  locationName?: string;
  location?: string;
  employmentType?: string;
  isRemote?: boolean;
  descriptionHtml?: string;
  descriptionPlain?: string;
  jobUrl?: string;
  externalLink?: string;
}

interface AshbyResponse {
  jobs: AshbyJob[];
  jobBoard?: { name?: string };
}

function normalizeAshbyCommitment(raw: string | undefined): string {
  if (!raw) return 'full-time';
  const lower = raw.toLowerCase();
  if (lower.includes('full_time') || lower.includes('fulltime') || lower.includes('full-time')) return 'full-time';
  if (lower.includes('part_time') || lower.includes('parttime') || lower.includes('part-time')) return 'part-time';
  if (lower.includes('contract') || lower.includes('temporary')) return 'contract';
  if (lower.includes('intern')) return 'internship';
  return 'full-time';
}

async function fetchAshbyBoard(slug: string, company: string): Promise<JobCandidate[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; jobhq-fetcher/1.0)' },
  });

  if (!response.ok) {
    if (response.status === 404) {
      console.warn(`[ashby] Board not found: ${slug} (${company}) — skipping`);
      return [];
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as AshbyResponse;
  const jobs = data.jobs ?? [];

  return jobs.map((job): JobCandidate => {
    const rawJd = job.descriptionPlain || job.descriptionHtml || '';
    const jdText = job.descriptionPlain ? rawJd : (job.descriptionHtml ? cleanJdText(job.descriptionHtml) : null);

    const rawLocation = job.locationName || job.location || '';
    const location = rawLocation ? [rawLocation] : [];

    const workMode = job.isRemote ? 'remote' : detectWorkMode(jdText);

    const jobUrl = job.jobUrl || job.externalLink || null;

    return {
      company_name: company,
      title: job.title,
      location,
      jd_url: jobUrl,
      apply_url: jobUrl,
      jd_full_text: jdText || null,
      source: 'ashby',
      source_id: job.id,
      work_mode: workMode,
      commitment: normalizeAshbyCommitment(job.employmentType),
    };
  });
}

function detectWorkMode(jdText: string | null | undefined): string | null {
  if (!jdText) return null;
  const lower = jdText.toLowerCase();
  if (lower.includes('remote')) return 'remote';
  if (lower.includes('hybrid')) return 'hybrid';
  if (lower.includes('on-site') || lower.includes('onsite') || lower.includes('in-office')) return 'on-site';
  return null;
}

async function main() {
  const configPath = join(process.cwd(), 'config', 'job-sources.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const companies: AshbyConfig[] = config.ashby ?? [];

  const targets = companyArg
    ? companies.filter((c) => c.company_slug === companyArg)
    : companies;

  if (targets.length === 0) {
    console.error(`[ashby] No companies to fetch${companyArg ? ` (slug "${companyArg}" not found in config)` : ''}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('[ashby] DRY RUN — no DB writes');
  } else {
    const db = getDb();
    runMigrations(db);
  }

  let totalCandidates: JobCandidate[] = [];

  for (const target of targets) {
    console.log(`[ashby] Fetching ${target.company} (${target.company_slug})...`);
    try {
      const jobs = await fetchAshbyBoard(target.company_slug, target.company);
      console.log(`[ashby]   → ${jobs.length} jobs`);
      totalCandidates = totalCandidates.concat(jobs);
    } catch (e) {
      console.error(`[ashby] ERROR fetching ${target.company}: ${(e as Error).message}`);
    }
  }

  console.log(`\n[ashby] Total fetched: ${totalCandidates.length} jobs across ${targets.length} companies`);

  if (dryRun) {
    for (const job of totalCandidates) {
      console.log(`  [${job.company_name}] ${job.title} — ${job.location.join(', ')}`);
    }
    return;
  }

  const result = processJobs(totalCandidates, 'ashby', true, true);
  printResult('ashby', result);

  closeDb();
}

main().catch((e) => {
  console.error('[ashby] Fatal error:', e);
  process.exit(1);
});
