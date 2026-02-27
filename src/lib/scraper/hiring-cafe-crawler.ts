import { execFile } from 'child_process';
import { join } from 'path';
import { checkDuplicate, hashContent } from '@/lib/dedup';
import { evaluateJob } from '@/lib/rule-engine';
import { findOrCreateCompany } from '@/lib/repositories/company-repository';
import { insertJob, listJobs, updateJob } from '@/lib/repositories/job-repository';
import { listRules } from '@/lib/repositories/rule-repository';
import { getSetting, getSettingNumber } from '@/lib/repositories/settings-repository';
import { listSearchConfigs, findSearchConfigById, updateSearchConfig } from '@/lib/repositories/search-config-repository';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import { scanVisaSponsorship } from '@/lib/visa-scan';
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

interface RawExtractedJob {
  title: string;
  company: string;
  location: string;
  salary: string;
  workMode: string;
  commitment: string;
  viewJobId: string;
  jdText: string | null;
}

function parseSalary(text: string): { min: number | null; max: number | null } {
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

function parseLocation(text: string): string[] {
  if (!text) return [];
  return text.split(/\s+or\s+|,\s*/).map((l) => l.trim()).filter(Boolean);
}

/**
 * Run the standalone crawl script via child_process.
 * This avoids Next.js runtime constraints for Playwright.
 */
function runCrawlScript(
  queryParams: Record<string, unknown>,
  delayMs: number,
  fetchJd: boolean,
): Promise<RawExtractedJob[]> {
  return new Promise((resolve, reject) => {
    const scriptPath = join(process.cwd(), 'scripts', 'crawl-extract.ts');
    const input = JSON.stringify({
      query_params: queryParams,
      fetch_jd: fetchJd,
      delay_ms: delayMs,
    });

    execFile('npx', ['tsx', scriptPath, input], {
      timeout: 3600000, // 60 min max
      maxBuffer: 50 * 1024 * 1024, // 50MB for JD text
      cwd: process.cwd(),
    }, (error, stdout, stderr) => {
      if (stderr) {
        for (const line of stderr.split('\n').filter(Boolean)) {
          console.log(`[crawl] ${line}`);
        }
      }

      if (error) {
        reject(new Error(`Crawl script failed: ${error.message}`));
        return;
      }

      try {
        const jobs = JSON.parse(stdout);
        resolve(jobs);
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
  const rules = listRules(true);
  const noH1bAction = getSetting('no_h1b_action', 'auto_exclude');
  const blockedAction = getSetting('blocked_action', 'auto_exclude');
  const jobNoVisaAction = getSetting('job_no_visa_action', 'auto_exclude');
  const delayMs = getSettingNumber('scrape_delay_ms', 5000);

  // Get all existing jobs for dedup
  const { jobs: existingJobs } = listJobs({ limit: 10000, offset: 0 });

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
      // Run standalone Playwright script (with JD fetch)
      const rawJobs = await runCrawlScript(config.query_params as Record<string, unknown>, delayMs, true);
      result.jobsFound = rawJobs.length;

      // Process each job through dedup + rules + insert
      const allExisting = [...existingJobs] as Job[];

      for (const raw of rawJobs) {
        try {
          if (!raw.title || !raw.viewJobId) continue;

          const salary = parseSalary(raw.salary);
          const location = parseLocation(raw.location);
          const company = findOrCreateCompany(raw.company || 'Unknown');

          // Check duplicate
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

          // Evaluate with rules (including JD text)
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
              source: 'hiring_cafe',
              source_id: raw.viewJobId,
              status: 'archived_filtered',
              notes: `Filtered: ${ruleResult.reason}`,
            });
            allExisting.push(inserted as unknown as Job);
            result.filtered++;
            continue;
          }

          // Insert job with JD
          const jdText = raw.jdText || null;
          const inserted = insertJob({
            company_id: company.id,
            title: raw.title,
            location,
            salary_min: salary.min,
            salary_max: salary.max,
            work_mode: raw.workMode?.toLowerCase() || null,
            commitment: raw.commitment || null,
            jd_url: `https://hiring.cafe/viewjob/${raw.viewJobId}`,
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
