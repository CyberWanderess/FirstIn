import { NextRequest } from 'next/server';
import { getDb, userContext } from '@/lib/db';
import { extJsonResponse, extErrorResponse, extOptionsResponse } from '@/lib/extension-auth';
import { withExtensionAuth } from '@/lib/route-handler';
import { checkFeature, checkQuota } from '@/lib/permissions';
import { findOrCreateCompany } from '@/lib/repositories/company-repository';
import { insertJob, listJobsByCompanyId, updateJob, findJobBySourceId, addJobSourceId } from '@/lib/repositories/job-repository';
import { listRules } from '@/lib/repositories/rule-repository';
import { getSetting } from '@/lib/repositories/settings-repository';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import { checkDuplicate, hashContent } from '@/lib/dedup';
import { evaluateJob } from '@/lib/rule-engine';
import { scanVisaSponsorship } from '@/lib/visa-scan';
import { cleanJdText } from '@/lib/jd-cleaner';
import type { JobInsert, Job } from '@/types';

interface BatchItem {
  title: string;
  company_name: string;
  location?: string[];
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  work_mode?: string;
  jd_url?: string;
  apply_url?: string;
  jd_full_text?: string;
  source: string;
  source_id?: string;
  posted_at?: string;
}

export async function OPTIONS() { return extOptionsResponse(); }

export const POST = withExtensionAuth(async (req) => {
  try {
    const userId = userContext.getStore()!.userId;
    if (!checkFeature(userId, 'can_use_extension')) return extErrorResponse('Extension access not available for your plan', 403);
    const jobQuota = checkQuota(userId, 'max_jobs');
    if (!jobQuota.allowed) return extErrorResponse(`Job limit reached (${jobQuota.limit})`, 429);

    const body = await req.json() as { items: BatchItem[] };
    if (!body.items || !Array.isArray(body.items)) {
      return extErrorResponse('items array is required');
    }

    const db = getDb();
    const rules = listRules(true);
    const noH1bAction = getSetting('no_h1b_action', 'auto_exclude');
    const blockedAction = getSetting('blocked_action', 'auto_exclude');
    const jobNoVisaAction = getSetting('job_no_visa_action', 'auto_exclude');

    let imported = 0;
    let duplicates = 0;
    let filtered = 0;
    let flagged = 0;
    const results: Array<{ title: string; saved: boolean; duplicate: boolean; jobId?: number }> = [];
    const errors: string[] = [];

    // Per-company cache of existing jobs for dedup fallback. Replaces the old
    // listJobs({ limit: 10000 }) full-table load. Each company's bucket is
    // loaded lazily on first encounter within the batch and mutated as we
    // insert new jobs so later items in the same batch see earlier inserts.
    const byCompany = new Map<number, Job[]>();
    const jobsForCompany = (companyId: number): Job[] => {
      let bucket = byCompany.get(companyId);
      if (!bucket) {
        bucket = listJobsByCompanyId(companyId);
        byCompany.set(companyId, bucket);
      }
      return bucket;
    };

    const run = db.transaction(() => {
      for (const item of body.items) {
        try {
          if (!item.title) {
            errors.push('Missing title');
            results.push({ title: '', saved: false, duplicate: false });
            continue;
          }

          const company = findOrCreateCompany(item.company_name || 'Unknown');
          const source = item.source || 'manual';

          const candidate: JobInsert & { company_id: number } = {
            company_id: company.id,
            title: item.title,
            location: item.location || [],
            source,
            source_id: item.source_id,
            jd_full_text: item.jd_full_text,
          };

          // Fast path: indexed source_id lookup
          if (item.source_id && source) {
            const existingJobId = findJobBySourceId(source, item.source_id);
            if (existingJobId) {
              duplicates++;
              results.push({ title: item.title, saved: false, duplicate: true, jobId: existingJobId });
              continue;
            }
          }

          // Fallback dedup: trigram/hash against same-company jobs only
          const sameCompanyJobs = jobsForCompany(company.id);
          const dedupResult = checkDuplicate(candidate, sameCompanyJobs);
          if (dedupResult.isDuplicate) {
            if (dedupResult.mergeLocations && dedupResult.matchedJobId) {
              updateJob(dedupResult.matchedJobId, { location: dedupResult.mergeLocations });
            }
            if (item.source_id && dedupResult.matchedJobId) {
              addJobSourceId(dedupResult.matchedJobId, source, item.source_id);
            }
            duplicates++;
            results.push({ title: item.title, saved: false, duplicate: true, jobId: dedupResult.matchedJobId });
            continue;
          }

          // visa scan and jd cleanup each traverse item.jd_full_text once.
          // See save/route.ts for rationale on keeping them separate.
          const visaScan = item.jd_full_text ? scanVisaSponsorship(item.jd_full_text) : null;
          const ruleResult = evaluateJob(
            { ...candidate, company_name: company.display_name, visa_sponsorship: visaScan },
            rules,
            company,
            { noH1bAction, blockedAction, jobNoVisaAction },
          );

          let status: string;
          if (ruleResult.action === 'exclude') {
            status = 'archived_filtered';
            filtered++;
          } else if (ruleResult.action === 'flag') {
            status = 'pending_eval';
            flagged++;
          } else {
            status = 'pending_eval';
          }

          const cleanedJd = item.jd_full_text ? cleanJdText(item.jd_full_text) : null;

          const job = insertJob({
            company_id: company.id,
            title: item.title,
            location: item.location || [],
            salary_min: item.salary_min ?? null,
            salary_max: item.salary_max ?? null,
            salary_currency: item.salary_currency,
            work_mode: item.work_mode ?? null,
            jd_url: item.jd_url ?? null,
            apply_url: item.apply_url ?? null,
            jd_full_text: cleanedJd,
            jd_fetch_status: cleanedJd ? 'success' : 'pending',
            jd_content_hash: cleanedJd ? hashContent(cleanedJd) : null,
            visa_sponsorship: visaScan,
            source,
            source_id: item.source_id ?? null,
            posted_at: item.posted_at ?? null,
            status: status as 'pending_eval' | 'archived_filtered',
            notes: ruleResult.action === 'flag'
              ? `[Flagged] ${ruleResult.matchedRules.map((r) => r.name).join(', ')}`
              : null,
          });

          sameCompanyJobs.push(job as unknown as Job);
          imported++;
          results.push({ title: item.title, saved: true, duplicate: false, jobId: job.id });
        } catch (e) {
          errors.push(`"${item.title}": ${(e as Error).message}`);
          results.push({ title: item.title, saved: false, duplicate: false });
        }
      }
    });

    run();

    logOperation({
      operation: 'import',
      entity_type: 'batch',
      trigger: 'import',
      details: { source: 'extension', total: body.items.length, imported, duplicates, filtered, flagged },
    });

    return extJsonResponse({ imported, duplicates, filtered, flagged, results, errors });
  } catch (e) {
    return extErrorResponse((e as Error).message);
  }
});
