#!/usr/bin/env npx tsx
/**
 * Lever Board API Job Fetcher
 *
 * Fetches job listings from Lever's public Posting API (no auth required).
 * Companies are configured in config/job-sources.json.
 *
 * Usage:
 *   npx tsx scripts/fetch-lever.ts              # fetch and insert
 *   npx tsx scripts/fetch-lever.ts --dry-run    # print jobs, no DB write
 *   npx tsx scripts/fetch-lever.ts --company spotify  # single company only
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

interface LeverConfig {
  company_slug: string;
  company: string;
}

interface LeverPosting {
  id: string;
  text: string;
  categories: {
    location?: string;
    team?: string;
    commitment?: string;
    department?: string;
  };
  description: string;
  descriptionPlain?: string;
  hostedUrl: string;
  applyUrl: string;
  workplaceType?: string;
}

function normalizeLeverCommitment(raw: string | undefined): string {
  if (!raw) return 'full-time';
  const lower = raw.toLowerCase();
  if (lower.includes('full')) return 'full-time';
  if (lower.includes('part')) return 'part-time';
  if (lower.includes('contract') || lower.includes('temp')) return 'contract';
  if (lower.includes('intern')) return 'internship';
  return lower;
}

function normalizeLeverWorkMode(workplaceType: string | undefined, jdText: string | null): string | null {
  if (workplaceType) {
    const lower = workplaceType.toLowerCase();
    if (lower === 'remote') return 'remote';
    if (lower === 'hybrid') return 'hybrid';
    if (lower === 'onsite' || lower === 'on-site') return 'on-site';
  }
  if (jdText) {
    const text = jdText.toLowerCase();
    if (text.includes('remote')) return 'remote';
    if (text.includes('hybrid')) return 'hybrid';
  }
  return null;
}

async function fetchLeverBoard(slug: string, company: string): Promise<JobCandidate[]> {
  const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; jobhq-fetcher/1.0)' },
  });

  if (!response.ok) {
    if (response.status === 404) {
      console.warn(`[lever] Board not found: ${slug} (${company}) — skipping`);
      return [];
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const postings = (await response.json()) as LeverPosting[];

  return postings.map((posting): JobCandidate => {
    const rawJd = posting.descriptionPlain || posting.description || '';
    const jdText = posting.descriptionPlain ? rawJd : cleanJdText(rawJd);
    const location = posting.categories?.location
      ? [posting.categories.location]
      : [];

    return {
      company_name: company,
      title: posting.text,
      location,
      jd_url: posting.hostedUrl,
      apply_url: posting.applyUrl,
      jd_full_text: jdText || null,
      source: 'lever',
      source_id: posting.id,
      work_mode: normalizeLeverWorkMode(posting.workplaceType, jdText || null),
      commitment: normalizeLeverCommitment(posting.categories?.commitment),
    };
  });
}

async function main() {
  const configPath = join(process.cwd(), 'config', 'job-sources.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const companies: LeverConfig[] = config.lever ?? [];

  const targets = companyArg
    ? companies.filter((c) => c.company_slug === companyArg)
    : companies;

  if (targets.length === 0) {
    console.error(`[lever] No companies to fetch${companyArg ? ` (slug "${companyArg}" not found in config)` : ''}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('[lever] DRY RUN — no DB writes');
  } else {
    const db = getDb();
    runMigrations(db);
  }

  let totalCandidates: JobCandidate[] = [];

  for (const target of targets) {
    console.log(`[lever] Fetching ${target.company} (${target.company_slug})...`);
    try {
      const jobs = await fetchLeverBoard(target.company_slug, target.company);
      console.log(`[lever]   → ${jobs.length} jobs`);
      totalCandidates = totalCandidates.concat(jobs);
    } catch (e) {
      console.error(`[lever] ERROR fetching ${target.company}: ${(e as Error).message}`);
    }
  }

  console.log(`\n[lever] Total fetched: ${totalCandidates.length} jobs across ${targets.length} companies`);

  if (dryRun) {
    for (const job of totalCandidates) {
      console.log(`  [${job.company_name}] ${job.title} — ${job.location.join(', ')}`);
    }
    return;
  }

  const result = processJobs(totalCandidates, 'lever', true, true);
  printResult('lever', result);

  closeDb();
}

main().catch((e) => {
  console.error('[lever] Fatal error:', e);
  process.exit(1);
});
