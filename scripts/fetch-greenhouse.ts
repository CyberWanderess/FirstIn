#!/usr/bin/env npx tsx
/**
 * Greenhouse Board API Job Fetcher
 *
 * Fetches job listings from Greenhouse's public Board API (no auth required).
 * Boards are configured in config/job-sources.json.
 *
 * Usage:
 *   npx tsx scripts/fetch-greenhouse.ts              # fetch and insert
 *   npx tsx scripts/fetch-greenhouse.ts --dry-run    # print jobs, no DB write
 *   npx tsx scripts/fetch-greenhouse.ts --board xai  # single board only
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
const boardArg = args.includes('--board') ? args[args.indexOf('--board') + 1] : null;

interface GreenhouseConfig {
  board_token: string;
  company: string;
}

interface GreenhouseJob {
  id: number;
  title: string;
  location: { name: string };
  content: string;
  absolute_url: string;
  updated_at: string;
  metadata?: { name: string; value: string | null }[];
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

function parseGreenhouseLocation(rawLocation: string): string[] {
  if (!rawLocation || rawLocation === 'Remote') return [rawLocation || 'Remote'];
  return rawLocation
    .split(/\s*[,;]\s*|\s+or\s+/i)
    .map((l) => l.trim())
    .filter(Boolean);
}

async function fetchGreenhouseBoard(token: string, company: string): Promise<JobCandidate[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; jobhq-fetcher/1.0)' },
  });

  if (!response.ok) {
    if (response.status === 404) {
      console.warn(`[greenhouse] Board not found: ${token} (${company}) — skipping`);
      return [];
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as GreenhouseResponse;
  const jobs = data.jobs ?? [];

  return jobs.map((job): JobCandidate => {
    const jdText = job.content ? cleanJdText(job.content) : null;
    const location = parseGreenhouseLocation(job.location?.name ?? '');

    return {
      company_name: company,
      title: job.title,
      location,
      jd_url: job.absolute_url,
      apply_url: job.absolute_url,
      jd_full_text: jdText,
      source: 'greenhouse',
      source_id: String(job.id),
      work_mode: detectWorkMode(job.title, jdText),
      commitment: 'full-time',
    };
  });
}

function detectWorkMode(title: string, jdText: string | null): string | null {
  const text = `${title} ${jdText ?? ''}`.toLowerCase();
  if (text.includes('remote')) return 'remote';
  if (text.includes('hybrid')) return 'hybrid';
  if (text.includes('on-site') || text.includes('onsite') || text.includes('in-office')) return 'on-site';
  return null;
}

async function main() {
  const configPath = join(process.cwd(), 'config', 'job-sources.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const boards: GreenhouseConfig[] = config.greenhouse ?? [];

  const targets = boardArg
    ? boards.filter((b) => b.board_token === boardArg)
    : boards;

  if (targets.length === 0) {
    console.error(`[greenhouse] No boards to fetch${boardArg ? ` (board "${boardArg}" not found in config)` : ''}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('[greenhouse] DRY RUN — no DB writes');
  } else {
    const db = getDb();
    runMigrations(db);
  }

  let totalCandidates: JobCandidate[] = [];

  for (const board of targets) {
    console.log(`[greenhouse] Fetching ${board.company} (${board.board_token})...`);
    try {
      const jobs = await fetchGreenhouseBoard(board.board_token, board.company);
      console.log(`[greenhouse]   → ${jobs.length} jobs`);
      totalCandidates = totalCandidates.concat(jobs);
    } catch (e) {
      console.error(`[greenhouse] ERROR fetching ${board.company}: ${(e as Error).message}`);
    }
  }

  console.log(`\n[greenhouse] Total fetched: ${totalCandidates.length} jobs across ${targets.length} boards`);

  if (dryRun) {
    for (const job of totalCandidates) {
      console.log(`  [${job.company_name}] ${job.title} — ${job.location.join(', ')}`);
    }
    return;
  }

  const result = processJobs(totalCandidates, 'greenhouse', true, true);
  printResult('greenhouse', result);

  closeDb();
}

main().catch((e) => {
  console.error('[greenhouse] Fatal error:', e);
  process.exit(1);
});
