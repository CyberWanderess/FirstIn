import { ensureInitialized } from '@/lib/init';
import { evaluateJob } from '@/lib/rule-engine';
import { listJobs, updateJob } from '@/lib/repositories/job-repository';
import { findCompanyById } from '@/lib/repositories/company-repository';
import { listRules } from '@/lib/repositories/rule-repository';
import { getSetting } from '@/lib/repositories/settings-repository';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import { jsonResponse, errorResponse } from '@/lib/api-utils';
import type { Job } from '@/types';

export async function POST() {
  ensureInitialized();
  try {
    const rules = listRules(true);
    const noH1bAction = getSetting('no_h1b_action', 'auto_exclude');
    const blockedAction = getSetting('blocked_action', 'auto_exclude');
    const jobNoVisaAction = getSetting('job_no_visa_action', 'auto_exclude');

    const { jobs } = listJobs({ status: 'pending_eval', limit: 10000, offset: 0 });
    let excluded = 0;

    for (const job of jobs as Job[]) {
      const company = findCompanyById(job.company_id);
      const result = evaluateJob(
        {
          company_id: job.company_id,
          company_name: company?.display_name ?? '',
          title: job.title,
          source: job.source,
          location: job.location,
          salary_min: job.salary_min,
          salary_max: job.salary_max,
          work_mode: job.work_mode,
          commitment: job.commitment,
          jd_full_text: job.jd_full_text,
          visa_sponsorship: job.visa_sponsorship,
        },
        rules,
        company,
        { noH1bAction, blockedAction, jobNoVisaAction },
      );

      if (result.action === 'exclude') {
        updateJob(job.id, {
          status: 'archived_filtered',
          notes: `Filtered: ${result.reason}`,
        });
        excluded++;
      }
    }

    logOperation({
      operation: 'evaluate',
      entity_type: 'batch',
      trigger: 'user',
      details: { total: (jobs as Job[]).length, excluded, kept: (jobs as Job[]).length - excluded },
    });

    return jsonResponse({ total: (jobs as Job[]).length, excluded, kept: (jobs as Job[]).length - excluded });
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
}
