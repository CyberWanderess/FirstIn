#!/usr/bin/env npx tsx
/**
 * Standalone crawl script — calls hiring.cafe API directly using Cloudflare cookies.
 *
 * Usage:
 *   npx tsx scripts/crawl-extract.ts '{"query_params": {...}}'
 *
 * Requires: Cloudflare cookies in .cf-cookies file or HIRING_CAFE_COOKIES env var.
 * To get cookies: open hiring.cafe in browser, DevTools > Application > Cookies,
 * copy cf_clearance value and save to .cf-cookies file.
 *
 * Input: JSON string as first CLI argument with query_params
 * Output: JSON array of extracted jobs to stdout
 * Logs go to stderr so they don't interfere with JSON output
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface ExtractedJob {
  title: string;
  company: string;
  location: string;
  salary: string;
  workMode: string;
  commitment: string;
  viewJobId: string;
  jdText: string | null;
  applyUrl: string | null;
}

function log(msg: string) {
  process.stderr.write(`[${new Date().toISOString()}] ${msg}\n`);
}

function loadCookies(): string {
  // Try env var first
  if (process.env.HIRING_CAFE_COOKIES) {
    return process.env.HIRING_CAFE_COOKIES;
  }

  // Try .cf-cookies file
  const cookieFile = join(process.cwd(), '.cf-cookies');
  if (existsSync(cookieFile)) {
    const content = readFileSync(cookieFile, 'utf-8').trim();
    if (content) return content;
  }

  return '';
}

function buildCookieHeader(cookieInput: string): string {
  // If the input already looks like a full cookie header (key=value pairs), use as-is
  if (cookieInput.includes('=')) {
    return cookieInput;
  }
  // Otherwise treat it as just the cf_clearance value
  return `cf_clearance=${cookieInput}`;
}

interface ApiJob {
  id?: string;
  objectID?: string;
  apply_url?: string;
  job_information?: {
    title?: string;
    description?: string;
  };
  v5_processed_job_data?: {
    core_job_title?: string;
    salary_range_min?: number;
    salary_range_max?: number;
    workplace_type?: string;
    location?: string | string[];
    commitment_level?: string;
    employment_type?: string;
  };
  enriched_company_data?: {
    company_name?: string;
    name?: string;
  };
  company_name?: string;
}

function mapApiJobToExtracted(apiJob: ApiJob): ExtractedJob | null {
  const viewJobId = apiJob.objectID || apiJob.id || '';
  if (!viewJobId) return null;

  const proc = apiJob.v5_processed_job_data;
  const info = apiJob.job_information;
  const company = apiJob.enriched_company_data;

  const title = proc?.core_job_title || info?.title || '';
  if (!title) return null;

  const companyName = company?.company_name || company?.name || apiJob.company_name || '';

  // Location
  let location = '';
  if (proc?.location) {
    location = Array.isArray(proc.location) ? proc.location.join(', ') : proc.location;
  }

  // Salary
  let salary = '';
  if (proc?.salary_range_min || proc?.salary_range_max) {
    const min = proc.salary_range_min;
    const max = proc.salary_range_max;
    if (min && max) salary = `$${min.toLocaleString()} - $${max.toLocaleString()}`;
    else if (min) salary = `$${min.toLocaleString()}`;
    else if (max) salary = `$${max.toLocaleString()}`;
  }

  // Work mode
  let workMode = '';
  if (proc?.workplace_type) {
    const wt = proc.workplace_type.toLowerCase();
    if (wt.includes('remote')) workMode = 'Remote';
    else if (wt.includes('hybrid')) workMode = 'Hybrid';
    else if (wt.includes('onsite') || wt.includes('on-site') || wt.includes('in-office')) workMode = 'Onsite';
    else workMode = proc.workplace_type;
  }

  // Commitment
  let commitment = '';
  const empType = proc?.commitment_level || proc?.employment_type || '';
  if (empType) {
    const et = empType.toLowerCase();
    if (et.includes('full')) commitment = 'Full Time';
    else if (et.includes('part')) commitment = 'Part Time';
    else if (et.includes('contract')) commitment = 'Contract';
    else commitment = empType;
  }

  // JD text from API
  const jdText = info?.description || null;

  return {
    viewJobId,
    title,
    company: companyName,
    location,
    salary,
    workMode,
    commitment,
    jdText,
    applyUrl: apiJob.apply_url || null,
  };
}

async function fetchApiPage(
  searchStateB64: string,
  page: number,
  size: number,
  cookieHeader: string,
): Promise<{ results: ApiJob[]; total: number; error: string | null }> {
  const url = `https://hiring.cafe/api/search-jobs?s=${encodeURIComponent(searchStateB64)}&size=${size}&page=${page}`;

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://hiring.cafe/',
    'Origin': 'https://hiring.cafe',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };

  if (cookieHeader) {
    headers['Cookie'] = cookieHeader;
  }

  const resp = await fetch(url, { headers });

  if (!resp.ok) {
    const body = await resp.text();
    if (resp.status === 403 && body.includes('Just a moment')) {
      return { results: [], total: 0, error: 'Cloudflare blocked — cookies expired or missing. Update .cf-cookies file.' };
    }
    return { results: [], total: 0, error: `HTTP ${resp.status}: ${body.substring(0, 200)}` };
  }

  const data = await resp.json();
  return {
    results: data.results || data.hits || [],
    total: data.totalResults ?? data.nbHits ?? data.total ?? 0,
    error: null,
  };
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    log('Usage: npx tsx scripts/crawl-extract.ts \'{"query_params": {...}}\'');
    process.exit(1);
  }

  let config: { query_params: Record<string, any>; fetch_jd?: boolean; delay_ms?: number };
  try {
    config = JSON.parse(input);
  } catch {
    log('Invalid JSON input');
    process.exit(1);
  }

  const queryParams = config.query_params;
  const PAGE_SIZE = 40;

  // Load Cloudflare cookies
  const rawCookies = loadCookies();
  if (!rawCookies) {
    log('WARNING: No Cloudflare cookies found. API calls will likely be blocked.');
    log('To fix: open hiring.cafe in browser, DevTools > Application > Cookies,');
    log('copy the full cookie string and save to .cf-cookies file in project root.');
  }
  const cookieHeader = rawCookies ? buildCookieHeader(rawCookies) : '';

  // Encode search state as base64
  const searchStateB64 = Buffer.from(JSON.stringify(queryParams)).toString('base64');

  const allJobs = new Map<string, ExtractedJob>();
  let pageNum = 0;
  let totalPages = 1;

  while (pageNum < totalPages && pageNum < 50) {
    log(`Fetching API page ${pageNum}...`);

    const result = await fetchApiPage(searchStateB64, pageNum, PAGE_SIZE, cookieHeader);

    if (result.error) {
      log(`API error: ${result.error}`);
      if (result.error.includes('Cloudflare blocked') && pageNum === 0) {
        // Signal Cloudflare block to orchestrator
        console.log(JSON.stringify({ cloudflare_blocked: true, results: [] }));
        process.exit(2);
      }
      break;
    }

    log(`  Page ${pageNum}: ${result.results.length} results (total: ${result.total})`);

    if (result.results.length === 0) break;

    for (const apiJob of result.results) {
      const job = mapApiJobToExtracted(apiJob);
      if (job && !allJobs.has(job.viewJobId)) {
        allJobs.set(job.viewJobId, job);
      }
    }

    // Calculate total pages on first request
    if (pageNum === 0 && result.total > 0) {
      totalPages = Math.ceil(result.total / PAGE_SIZE);
      log(`  Total results: ${result.total}, pages: ${totalPages}`);
    }

    pageNum++;

    // Small delay between pages
    if (pageNum < totalPages) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const jobs = Array.from(allJobs.values());
  log(`Total unique jobs extracted: ${jobs.length}`);

  // Output JSON to stdout
  console.log(JSON.stringify(jobs));
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  console.log(JSON.stringify([]));
  process.exit(1);
});
