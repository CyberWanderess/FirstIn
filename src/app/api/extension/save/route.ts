import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { verifyExtensionToken, extJsonResponse, extErrorResponse, extOptionsResponse } from '@/lib/extension-auth';
import { findOrCreateCompany } from '@/lib/repositories/company-repository';
import { insertJob, listJobs, updateJob, findJobBySourceId, addJobSourceId } from '@/lib/repositories/job-repository';
import { listRules } from '@/lib/repositories/rule-repository';
import { getSetting } from '@/lib/repositories/settings-repository';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import { checkDuplicate, hashContent } from '@/lib/dedup';
import { evaluateJob } from '@/lib/rule-engine';
import { scanVisaSponsorship } from '@/lib/visa-scan';
import { cleanJdText } from '@/lib/jd-cleaner';
import type { JobInsert } from '@/types';

interface SaveRequest {
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

export async function POST(req: NextRequest) {
  ensureInitialized();
  const auth = verifyExtensionToken(req);
  if (!auth.valid) return auth.response;

  try {
    const body = await req.json() as SaveRequest;
    if (!body.title || !body.company_name) {
      return extErrorResponse('title and company_name are required');
    }

    const company = findOrCreateCompany(body.company_name);
    const source = body.source || 'manual';

    // Fast path: source_id lookup via association table
    if (body.source_id && source) {
      const existingJobId = findJobBySourceId(source, body.source_id);
      if (existingJobId) {
        const { jobs: allJobs } = listJobs({ limit: 10000, offset: 0 });
        const matchedJob = allJobs.find(j => j.id === existingJobId);
        return extJsonResponse({
          saved: false,
          duplicate: true,
          matchType: 'source_id',
          matchedJobId: existingJobId,
          status: matchedJob?.status,
        });
      }
    }

    // Slow path: content hash dedup
    const { jobs: existingJobs } = listJobs({ limit: 10000, offset: 0 });
    const candidate: JobInsert & { company_id: number } = {
      company_id: company.id,
      title: body.title,
      location: body.location || [],
      source,
      source_id: body.source_id,
      jd_full_text: body.jd_full_text,
    };
    const dedupResult = checkDuplicate(candidate, existingJobs);

    if (dedupResult.isDuplicate) {
      // Merge locations if the same job was posted in multiple locations
      if (dedupResult.mergeLocations && dedupResult.matchedJobId) {
        updateJob(dedupResult.matchedJobId, { location: dedupResult.mergeLocations });
      }
      // Add this source_id to the association table (for future lookups)
      if (body.source_id && dedupResult.matchedJobId) {
        addJobSourceId(dedupResult.matchedJobId, source, body.source_id);
      }
      const matchedJob = existingJobs.find(j => j.id === dedupResult.matchedJobId);
      return extJsonResponse({
        saved: false,
        duplicate: true,
        matchType: dedupResult.matchType,
        matchedJobId: dedupResult.matchedJobId,
        status: matchedJob?.status,
        locationsAdded: dedupResult.mergeLocations ? true : undefined,
      });
    }

    // Evaluate with rules
    const rules = listRules(true);
    const noH1bAction = getSetting('no_h1b_action', 'auto_exclude');
    const blockedAction = getSetting('blocked_action', 'auto_exclude');
    const jobNoVisaAction = getSetting('job_no_visa_action', 'auto_exclude');

    const visaScan = body.jd_full_text ? scanVisaSponsorship(body.jd_full_text) : null;
    const ruleResult = evaluateJob(
      { ...candidate, company_name: company.display_name, visa_sponsorship: visaScan },
      rules,
      company,
      { noH1bAction, blockedAction, jobNoVisaAction },
    );

    let status: string;
    if (ruleResult.action === 'exclude') {
      status = 'archived_filtered';
    } else {
      status = 'pending_eval';
    }

    const cleanedJd = body.jd_full_text ? cleanJdText(body.jd_full_text) : null;

    const job = insertJob({
      company_id: company.id,
      title: body.title,
      location: body.location || [],
      salary_min: body.salary_min ?? null,
      salary_max: body.salary_max ?? null,
      salary_currency: body.salary_currency,
      work_mode: body.work_mode ?? null,
      jd_url: body.jd_url ?? null,
      apply_url: body.apply_url ?? null,
      jd_full_text: cleanedJd,
      jd_fetch_status: cleanedJd ? 'success' : 'pending',
      jd_content_hash: cleanedJd ? hashContent(cleanedJd) : null,
      visa_sponsorship: body.jd_full_text ? scanVisaSponsorship(body.jd_full_text) : null,
      source,
      source_id: body.source_id ?? null,
      posted_at: body.posted_at ?? null,
      status: status as 'pending_eval' | 'archived_filtered',
      notes: ruleResult.action === 'flag'
        ? `[Flagged] ${ruleResult.matchedRules.map((r) => r.name).join(', ')}`
        : null,
    });

    logOperation({
      operation: 'import',
      entity_type: 'job',
      entity_id: job.id,
      trigger: 'import',
      details: { source: 'extension', platform: body.source },
    });

    return extJsonResponse({
      saved: true,
      duplicate: false,
      jobId: job.id,
      status: job.status,
    }, 201);
  } catch (e) {
    return extErrorResponse((e as Error).message);
  }
}
