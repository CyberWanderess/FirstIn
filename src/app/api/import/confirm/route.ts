import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { getDb } from '@/lib/db';
import { findOrCreateCompany } from '@/lib/repositories/company-repository';
import { insertJob, listJobs } from '@/lib/repositories/job-repository';
import { listRules } from '@/lib/repositories/rule-repository';
import { getSetting } from '@/lib/repositories/settings-repository';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import { checkDuplicate, hashContent } from '@/lib/dedup';
import { evaluateJob } from '@/lib/rule-engine';
import { scanVisaSponsorship } from '@/lib/visa-scan';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';
import type { JobInsert, Job } from '@/types';

export async function POST(req: NextRequest) {
  ensureInitialized();
  try {
    const body = await parseJsonBody<{ items: JobInsert[] }>(req);
    if (!body.items || !Array.isArray(body.items)) {
      return errorResponse('items array is required');
    }

    const db = getDb();
    const rules = listRules(true);
    const noH1bAction = getSetting('no_h1b_action', 'auto_exclude');
    const blockedAction = getSetting('blocked_action', 'auto_exclude');
    const jobNoVisaAction = getSetting('job_no_visa_action', 'auto_exclude');
    const { jobs: existingJobs } = listJobs({ limit: 10000, offset: 0 });

    let imported = 0;
    let duplicates = 0;
    let filtered = 0;
    let flagged = 0;
    const errors: string[] = [];

    const run = db.transaction(() => {
      const allExisting = [...existingJobs] as Job[];

      for (const item of body.items) {
        try {
          if (!item.title) {
            errors.push(`Missing title`);
            continue;
          }

          // Resolve company
          const companyName = item.company_name || 'Unknown';
          const company = findOrCreateCompany(companyName);

          // Check duplicate
          const dedupResult = checkDuplicate(
            { ...item, company_id: company.id, source: item.source || 'manual' },
            allExisting,
          );
          if (dedupResult.isDuplicate) {
            duplicates++;
            continue;
          }

          // Evaluate with rules
          const visaScan = item.jd_full_text ? scanVisaSponsorship(item.jd_full_text) : null;
          const ruleResult = evaluateJob(
            { ...item, company_id: company.id, company_name: company.display_name, source: item.source || 'manual', visa_sponsorship: visaScan },
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

          const job = insertJob({
            company_id: company.id,
            title: item.title,
            location: item.location || [],
            salary_min: item.salary_min,
            salary_max: item.salary_max,
            work_mode: item.work_mode,
            commitment: item.commitment,
            jd_url: item.jd_url,
            jd_full_text: item.jd_full_text,
            jd_fetch_status: item.jd_full_text ? 'success' : 'pending',
            jd_content_hash: item.jd_full_text ? hashContent(item.jd_full_text) : null,
            visa_sponsorship: item.jd_full_text ? scanVisaSponsorship(item.jd_full_text) : null,
            source: item.source || 'manual',
            source_id: item.source_id,
            status: status as 'pending_eval' | 'archived_filtered',
            notes: ruleResult.action === 'flag' ? `[Flagged] ${ruleResult.matchedRules.map((r) => r.name).join(', ')}` : item.notes,
          });

          allExisting.push(job as unknown as Job);
          imported++;
        } catch (e) {
          errors.push(`"${item.title}": ${(e as Error).message}`);
        }
      }
    });

    run();

    logOperation({
      operation: 'import',
      entity_type: 'batch',
      trigger: 'user',
      details: { source: 'manual_paste', total: body.items.length, imported, duplicates, filtered, flagged },
    });

    return jsonResponse({ imported, duplicates, filtered, flagged, errors });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
