import { execFile } from 'child_process';
import { join } from 'path';
import { statSync, existsSync } from 'fs';
import { checkDuplicate, hashContent } from '@/lib/dedup';
import { evaluateJob } from '@/lib/rule-engine';
import { findOrCreateCompany } from '@/lib/repositories/company-repository';
import { insertJob, listJobs, updateJob } from '@/lib/repositories/job-repository';
import { listRules } from '@/lib/repositories/rule-repository';
import { getSetting, getSettingNumber } from '@/lib/repositories/settings-repository';
import { listSearchConfigs, findSearchConfigById, updateSearchConfig } from '@/lib/repositories/search-config-repository';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import { scanVisaSponsorship } from '@/lib/visa-scan';
import { cleanJdText } from '@/lib/jd-cleaner';
import type { Job } from '@/types';

export interface CrawlResult {
  configId: number;
  configName: string;
  jobsFound: number;
  newAfterDedup: number;
  filtered: number;
  imported: number;
  failed: number;
  durationSec: number;
  errors: string[];
}

export interface RawExtractedJob {
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

export function parseSalary(text: string): { min: number | null; max: number | null } {
  if (!text || text === 'Undisclosed') return { min: null, max: null };
  const numbers: number[] = [];
  const matches = text.matchAll(/\$?([\d,]+)k?/gi);
  for (const match of matches) {
    let num = parseInt(match[1].replace(/,/g, ''), 10);
    if (text.toLowerCase().includes('k') && num < 1000) num *= 1000;
    numbers.push(num);
  }
  if (numbers.length >= 2) return { min: numbers[0], max: numbers[1] };
  if (numbers.length === 1) return { min: numbers[0], max: numbers[0] };
  return { min: null, max: null };
}

export function parseLocation(text: string): string[] {
  if (!text) return [];
  return text.split(/\s+or\s+|,\s*/).map((l) => l.trim()).filter(Boolean);
}

const COOKIE_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Ensure Cloudflare cookies are fresh. Uses Playwright to pass challenge if needed.
 */
function ensureFreshCookies(force?: boolean): Promise<{ refreshed: boolean; error?: string }> {
  return new Promise((resolve) => {
    const cookieFile = join(process.cwd(), '.cf-cookies');

    // Skip refresh if cookies are recent (unless forced)
    if (!force && existsSync(cookieFile)) {
      try {
        const stat = statSync(cookieFile);
        const age = Date.now() - stat.mtimeMs;
        if (age < COOKIE_MAX_AGE_MS) {
          console.log(`[cookie] Cookies are fresh (${Math.round(age / 60000)}min old), skipping refresh`);
          resolve({ refreshed: false });
          return;
        }
      } catch { /* stat failed, proceed with refresh */ }
    }

    console.log(`[cookie] Refreshing Cloudflare cookies via Playwright...`);
    const scriptPath = join(process.cwd(), 'scripts', 'refresh-cf-cookies.ts');

    execFile('npx', ['tsx', scriptPath], {
      timeout: 120000, // 120s max for cookie refresh (Cloudflare challenge can be slow)
      maxBuffer: 1024 * 1024,
      cwd: process.cwd(),
    }, (error, stdout, stderr) => {
      if (stderr) {
        for (const line of stderr.split('\n').filter(Boolean)) {
          console.log(`[cookie] ${line}`);
        }
      }

      if (error) {
        console.log(`[cookie] WARNING: Cookie refresh failed: ${error.message}`);
        resolve({ refreshed: false, error: error.message });
        return;
      }

      try {
        const result = JSON.parse(stdout);
        if (result.success) {
          console.log(`[cookie] Cookies refreshed successfully`);
          resolve({ refreshed: true });
        } else {
          console.log(`[cookie] WARNING: Cookie refresh returned error: ${result.error}`);
          resolve({ refreshed: false, error: result.error });
        }
      } catch {
        console.log(`[cookie] WARNING: Could not parse cookie refresh output`);
        resolve({ refreshed: false, error: 'Parse error' });
      }
    });
  });
}

interface CrawlScriptResult {
  cloudflare_blocked: boolean;
  jobs: RawExtractedJob[];
}

/**
 * Run the API crawl script via child_process.
 * Returns jobs and whether Cloudflare blocked the request.
 */
function runCrawlScript(
  queryParams: Record<string, unknown>,
): Promise<CrawlScriptResult> {
  return new Promise((resolve, reject) => {
    const scriptPath = join(process.cwd(), 'scripts', 'crawl-extract.ts');
    const input = JSON.stringify({
      query_params: queryParams,
    });

    execFile('npx', ['tsx', scriptPath, input], {
      timeout: 300000, // 5 min max (API calls are fast)
      maxBuffer: 50 * 1024 * 1024, // 50MB for JD text
      cwd: process.cwd(),
    }, (error, stdout, stderr) => {
      if (stderr) {
        for (const line of stderr.split('\n').filter(Boolean)) {
          console.log(`[crawl] ${line}`);
        }
      }

      if (error) {
        // Exit code 2 = Cloudflare blocked
        if ((error as any).code === 2) {
          resolve({ cloudflare_blocked: true, jobs: [] });
          return;
        }
        reject(new Error(`Crawl script failed: ${error.message}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        // Handle structured response with cloudflare_blocked flag
        if (parsed.cloudflare_blocked) {
          resolve({ cloudflare_blocked: true, jobs: [] });
        } else if (Array.isArray(parsed)) {
          resolve({ cloudflare_blocked: false, jobs: parsed });
        } else {
          resolve({ cloudflare_blocked: false, jobs: parsed.results || [] });
        }
      } catch {
        reject(new Error(`Failed to parse crawl output: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

/**
 * Run standalone script to fetch JDs for specific job IDs.
 */
function runJdFetchScript(
  jobIds: string[],
  delayMs: number,
): Promise<Array<{ viewJobId: string; jdText: string | null }>> {
  return new Promise((resolve, reject) => {
    const scriptPath = join(process.cwd(), 'scripts', 'fetch-jd.ts');
    const input = JSON.stringify({
      job_ids: jobIds,
      delay_ms: delayMs,
    });

    execFile('npx', ['tsx', scriptPath, input], {
      timeout: 3600000,
      maxBuffer: 50 * 1024 * 1024,
      cwd: process.cwd(),
    }, (error, stdout, stderr) => {
      if (stderr) {
        for (const line of stderr.split('\n').filter(Boolean)) {
          console.log(`[jd-fetch] ${line}`);
        }
      }

      if (error) {
        reject(new Error(`JD fetch script failed: ${error.message}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Failed to parse JD fetch output: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

/**
 * Process raw extracted jobs through dedup + rules + insert.
 * Shared by both automated crawl and manual bookmarklet import.
 */
export function processRawJobs(rawJobs: RawExtractedJob[]): Omit<CrawlResult, 'configId' | 'configName' | 'durationSec'> {
  const rules = listRules(true);
  const noH1bAction = getSetting('no_h1b_action', 'auto_exclude');
  const blockedAction = getSetting('blocked_action', 'auto_exclude');
  const jobNoVisaAction = getSetting('job_no_visa_action', 'auto_exclude');

  const { jobs: existingJobs } = listJobs({ limit: 10000, offset: 0 });
  const allExisting = [...existingJobs] as Job[];

  const result = {
    jobsFound: rawJobs.length,
    newAfterDedup: 0,
    filtered: 0,
    imported: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const raw of rawJobs) {
    try {
      if (!raw.title || !raw.viewJobId) continue;

      const salary = parseSalary(raw.salary);
      const location = parseLocation(raw.location);
      const company = findOrCreateCompany(raw.company || 'Unknown');

      const dedupResult = checkDuplicate(
        {
          company_id: company.id,
          title: raw.title,
          source: 'hiring_cafe',
          location,
          jd_full_text: raw.jdText,
        },
        allExisting,
      );

      if (dedupResult.isDuplicate) continue;
      result.newAfterDedup++;

      const ruleResult = evaluateJob(
        {
          company_id: company.id,
          company_name: company.display_name,
          title: raw.title,
          source: 'hiring_cafe',
          location,
          salary_min: salary.min,
          salary_max: salary.max,
          work_mode: raw.workMode?.toLowerCase() || null,
          commitment: raw.commitment || null,
          jd_full_text: raw.jdText || null,
          visa_sponsorship: raw.jdText ? scanVisaSponsorship(raw.jdText) : null,
        },
        rules,
        company,
        { noH1bAction, blockedAction, jobNoVisaAction },
      );

      if (ruleResult.action === 'exclude') {
        const inserted = insertJob({
          company_id: company.id,
          title: raw.title,
          location,
          salary_min: salary.min,
          salary_max: salary.max,
          work_mode: raw.workMode?.toLowerCase() || null,
          commitment: raw.commitment || null,
          jd_url: `https://hiring.cafe/viewjob/${raw.viewJobId}`,
          apply_url: raw.applyUrl || null,
          source: 'hiring_cafe',
          source_id: raw.viewJobId,
          status: 'archived_filtered',
          notes: `Filtered: ${ruleResult.reason}`,
        });
        allExisting.push(inserted as unknown as Job);
        result.filtered++;
        continue;
      }

      const jdText = raw.jdText ? cleanJdText(raw.jdText) : null;
      const inserted = insertJob({
        company_id: company.id,
        title: raw.title,
        location,
        salary_min: salary.min,
        salary_max: salary.max,
        work_mode: raw.workMode?.toLowerCase() || null,
        commitment: raw.commitment || null,
        jd_url: `https://hiring.cafe/viewjob/${raw.viewJobId}`,
        apply_url: raw.applyUrl || null,
        jd_full_text: jdText,
        jd_fetch_status: jdText ? 'success' : 'failed',
        jd_content_hash: jdText ? hashContent(jdText) : null,
        source: 'hiring_cafe',
        source_id: raw.viewJobId,
        status: 'pending_eval',
      });

      allExisting.push(inserted as unknown as Job);
      result.imported++;
    } catch (e) {
      result.failed++;
      result.errors.push(`${raw.title}: ${(e as Error).message}`);
    }
  }

  return result;
}

export async function crawlHiringCafe(configId?: number): Promise<CrawlResult[]> {
  const configs = configId
    ? [findSearchConfigById(configId)].filter(Boolean)
    : listSearchConfigs(true);

  if (configs.length === 0) {
    return [{
      configId: 0, configName: 'none', jobsFound: 0, newAfterDedup: 0,
      filtered: 0, imported: 0, failed: 0, durationSec: 0,
      errors: ['No enabled search configs found'],
    }];
  }

  const results: CrawlResult[] = [];

  // Ensure Cloudflare cookies are fresh before crawling
  await ensureFreshCookies();

  for (const config of configs) {
    if (!config) continue;
    const startTime = Date.now();
    const result: CrawlResult = {
      configId: config.id,
      configName: config.name,
      jobsFound: 0,
      newAfterDedup: 0,
      filtered: 0,
      imported: 0,
      failed: 0,
      durationSec: 0,
      errors: [],
    };

    try {
      // Run API crawl script, with Cloudflare retry
      let crawlResult = await runCrawlScript(config.query_params as Record<string, unknown>);

      if (crawlResult.cloudflare_blocked) {
        console.log(`[crawl] Cloudflare blocked — force-refreshing cookies and retrying...`);
        const refresh = await ensureFreshCookies(true);
        if (refresh.error) {
          result.errors.push(`Cookie refresh failed: ${refresh.error}`);
        }
        crawlResult = await runCrawlScript(config.query_params as Record<string, unknown>);
        if (crawlResult.cloudflare_blocked) {
          result.errors.push('Cloudflare blocked after cookie refresh — manual intervention may be needed');
        }
      }

      const processed = processRawJobs(crawlResult.jobs);
      result.jobsFound = processed.jobsFound;
      result.newAfterDedup = processed.newAfterDedup;
      result.filtered = processed.filtered;
      result.imported = processed.imported;
      result.failed = processed.failed;
      result.errors.push(...processed.errors);
    } catch (e) {
      result.errors.push((e as Error).message);
    }

    result.durationSec = Math.round((Date.now() - startTime) / 1000);
    results.push(result);

    // Update search config
    updateSearchConfig(config.id, {
      last_run_at: new Date().toISOString(),
      last_run_result: {
        jobs_found: result.jobsFound,
        new_after_dedup: result.newAfterDedup,
        filtered: result.filtered,
        imported: result.imported,
        failed: result.failed,
        errors: result.errors,
      },
    });

    // Log operation
    logOperation({
      operation: 'crawl',
      entity_type: 'batch',
      trigger: 'system',
      details: {
        config_id: config.id,
        jobs_found: result.jobsFound,
        new_after_dedup: result.newAfterDedup,
        filtered: result.filtered,
        imported: result.imported,
        duration_sec: result.durationSec,
      },
    });
  }

  return results;
}

/**
 * Fetch JDs for jobs that have jd_fetch_status='pending'.
 * Runs as a separate step after crawl, only for jobs that passed filtering.
 */
export async function fetchJobDescriptions(): Promise<{
  total: number;
  success: number;
  failed: number;
  durationSec: number;
}> {
  const startTime = Date.now();
  const delayMs = getSettingNumber('scrape_delay_ms', 5000);

  // Find jobs needing JD fetch
  const { jobs } = listJobs({ limit: 10000, offset: 0, status: 'pending_eval' });
  const pending = (jobs as Job[]).filter(
    (j) => j.jd_fetch_status === 'pending' && j.source_id,
  );

  if (pending.length === 0) {
    return { total: 0, success: 0, failed: 0, durationSec: 0 };
  }

  const jobIds = pending.map((j) => j.source_id!);

  try {
    const results = await runJdFetchScript(jobIds, delayMs);
    const resultMap = new Map(results.map((r) => [r.viewJobId, r.jdText]));

    let success = 0;
    let failed = 0;

    for (const job of pending) {
      const jdText = resultMap.get(job.source_id!) ?? null;
      if (jdText) {
        updateJob(job.id, {
          jd_full_text: jdText,
          jd_fetch_status: 'success',
          jd_content_hash: hashContent(jdText),
          visa_sponsorship: scanVisaSponsorship(jdText),
        });
        success++;
      } else {
        updateJob(job.id, { jd_fetch_status: 'failed' });
        failed++;
      }
    }

    logOperation({
      operation: 'jd_fetch',
      entity_type: 'batch',
      trigger: 'system',
      details: { total: pending.length, success, failed },
    });

    return {
      total: pending.length,
      success,
      failed,
      durationSec: Math.round((Date.now() - startTime) / 1000),
    };
  } catch (e) {
    return {
      total: pending.length,
      success: 0,
      failed: pending.length,
      durationSec: Math.round((Date.now() - startTime) / 1000),
    };
  }
}
