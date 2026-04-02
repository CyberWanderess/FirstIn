#!/usr/bin/env npx tsx
/**
 * JSearch API Job Fetcher (via RapidAPI)
 *
 * Fetches job listings from JSearch (Google Jobs aggregator) for large companies
 * with self-built ATS (Microsoft, Meta, Google, Amazon, Apple, NVIDIA, Tesla).
 *
 * Prerequisites:
 *   1. Register on RapidAPI: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
 *   2. Subscribe to the free plan (500 req/month)
 *   3. Set env var: RAPIDAPI_KEY=your_key
 *
 * Usage:
 *   RAPIDAPI_KEY=xxx npx tsx scripts/fetch-jsearch.ts              # fetch and insert
 *   RAPIDAPI_KEY=xxx npx tsx scripts/fetch-jsearch.ts --dry-run    # print jobs, no DB write
 *   RAPIDAPI_KEY=xxx npx tsx scripts/fetch-jsearch.ts --query "TPM Microsoft"  # single query
 */

import './lib/load-env'; // must be first — sets DATABASE_PATH before config.ts loads
import { join } from 'path';
import { readFileSync } from 'fs';
import { getDb, closeDb } from '../src/lib/db';
import { runMigrations } from '../src/lib/migrations/runner';
import { processJobs, printResult, type JobCandidate } from './lib/process-jobs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const queryArg = args.includes('--query') ? args[args.indexOf('--query') + 1] : null;

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

interface JSearchConfig {
  queries: string[];
  location: string;
  date_posted: string;
  num_pages: number;
}

interface JSearchJob {
  job_id: string;
  job_title: string;
  employer_name: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_description?: string;
  job_apply_link?: string;
  job_apply_is_direct?: boolean;
  job_google_link?: string;
  job_employment_type?: string;
  job_is_remote?: boolean;
  job_min_salary?: number;
  job_max_salary?: number;
  job_salary_period?: string;
}

interface JSearchResponse {
  data: JSearchJob[];
  status: string;
}

function normalizeCommitment(raw: string | undefined): string {
  if (!raw) return 'full-time';
  const lower = raw.toLowerCase();
  if (lower.includes('fulltime') || lower.includes('full_time') || lower.includes('full-time')) return 'full-time';
  if (lower.includes('parttime') || lower.includes('part_time') || lower.includes('part-time')) return 'part-time';
  if (lower.includes('contractor') || lower.includes('contract') || lower.includes('temp')) return 'contract';
  if (lower.includes('intern')) return 'internship';
  return 'full-time';
}

function buildLocation(job: JSearchJob): string[] {
  if (job.job_is_remote) return ['Remote'];
  const parts = [job.job_city, job.job_state, job.job_country].filter(Boolean);
  return parts.length > 0 ? [parts.join(', ')] : [];
}

function normalizeSalary(value: number | undefined, period: string | undefined): number | null {
  if (!value) return null;
  // JSearch returns hourly/weekly/monthly/yearly — normalize to yearly
  const p = (period || '').toLowerCase();
  if (p === 'hour' || p === 'hourly') return Math.round(value * 2080);
  if (p === 'week' || p === 'weekly') return Math.round(value * 52);
  if (p === 'month' || p === 'monthly') return Math.round(value * 12);
  return Math.round(value); // assume yearly
}

async function fetchJSearchQuery(
  query: string,
  location: string,
  datePosted: string,
  numPages: number,
): Promise<JobCandidate[]> {
  if (!RAPIDAPI_KEY) throw new Error('RAPIDAPI_KEY env var is not set');

  const candidates: JobCandidate[] = [];

  for (let page = 1; page <= numPages; page++) {
    const url = new URL('https://jsearch.p.rapidapi.com/search');
    url.searchParams.set('query', `${query} in ${location}`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('num_pages', '1');
    url.searchParams.set('date_posted', datePosted);

    const response = await fetch(url.toString(), {
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as JSearchResponse;
    const jobs = data.data ?? [];

    for (const job of jobs) {
      candidates.push({
        company_name: job.employer_name,
        title: job.job_title,
        location: buildLocation(job),
        jd_url: job.job_google_link || job.job_apply_link || null,
        apply_url: job.job_apply_is_direct !== false ? (job.job_apply_link || null) : null,
        jd_full_text: job.job_description || null,
        source: 'jsearch',
        source_id: job.job_id,
        work_mode: job.job_is_remote ? 'remote' : null,
        commitment: normalizeCommitment(job.job_employment_type),
        salary_min: normalizeSalary(job.job_min_salary, job.job_salary_period),
        salary_max: normalizeSalary(job.job_max_salary, job.job_salary_period),
      });
    }

    if (jobs.length === 0) break;
  }

  return candidates;
}

async function main() {
  if (!RAPIDAPI_KEY) {
    console.error('[jsearch] Error: RAPIDAPI_KEY env var is not set');
    console.error('  Get a key at: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch');
    process.exit(1);
  }

  const configPath = join(process.cwd(), 'config', 'job-sources.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const jsearchConfig: JSearchConfig = config.jsearch ?? {};

  const queries: string[] = queryArg
    ? [queryArg]
    : (jsearchConfig.queries ?? []);
  const location = jsearchConfig.location || 'United States';
  const datePosted = jsearchConfig.date_posted || 'week';
  const numPages = jsearchConfig.num_pages || 1;

  if (queries.length === 0) {
    console.error('[jsearch] No queries configured in config/job-sources.json');
    process.exit(1);
  }

  if (dryRun) {
    console.log('[jsearch] DRY RUN — no DB writes');
  } else {
    const db = getDb();
    runMigrations(db);
  }

  let totalCandidates: JobCandidate[] = [];

  for (const query of queries) {
    console.log(`[jsearch] Query: "${query}"...`);
    try {
      const jobs = await fetchJSearchQuery(query, location, datePosted, numPages);
      console.log(`[jsearch]   → ${jobs.length} jobs`);
      totalCandidates = totalCandidates.concat(jobs);

      // Small delay to avoid rate limiting (500 req/month free tier)
      if (queries.indexOf(query) < queries.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (e) {
      console.error(`[jsearch] ERROR on query "${query}": ${(e as Error).message}`);
    }
  }

  console.log(`\n[jsearch] Total fetched: ${totalCandidates.length} jobs across ${queries.length} queries`);

  if (dryRun) {
    for (const job of totalCandidates) {
      console.log(`  [${job.company_name}] ${job.title} — ${job.location.join(', ')}`);
    }
    return;
  }

  const result = processJobs(totalCandidates, 'jsearch');
  printResult('jsearch', result);

  closeDb();
}

main().catch((e) => {
  console.error('[jsearch] Fatal error:', e);
  process.exit(1);
});
