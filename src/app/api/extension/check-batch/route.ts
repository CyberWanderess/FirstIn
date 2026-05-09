import { NextRequest } from 'next/server';
import { extJsonResponse, extErrorResponse, extOptionsResponse } from '@/lib/extension-auth';
import { withExtensionAuth } from '@/lib/route-handler';
import { findCompanyByNameFuzzy } from '@/lib/repositories/company-repository';
import { findJobById, findJobBySourceId, listJobsByCompanyId } from '@/lib/repositories/job-repository';
import { checkDuplicate } from '@/lib/dedup';
import { STATUS_LABELS } from '@/types/job';
import type { Job } from '@/types';

interface CheckItem {
  title: string;
  company_name: string;
  source_id?: string;
  source?: string;
}

export async function OPTIONS() { return extOptionsResponse(); }

export const POST = withExtensionAuth(async (req) => {
  try {
    const body = await req.json() as { items: CheckItem[] };
    if (!body.items || !Array.isArray(body.items)) {
      return extErrorResponse('items array is required');
    }

    const jobsByCompany = new Map<number, Job[]>();

    const results = body.items.map((item, index) => {
      // Fast path: source_id lookup
      if (item.source_id && item.source) {
        const jobId = findJobBySourceId(item.source, item.source_id);
        if (jobId) {
          const job = findJobById(jobId);
          return {
            index,
            exists: true,
            jobId,
            status: job?.status,
            statusLabel: job ? (STATUS_LABELS[job.status] || job.status) : undefined,
          };
        }
      }

      // Slow path: company + dedup
      const company = findCompanyByNameFuzzy(item.company_name);
      if (!company) {
        return { index, exists: false };
      }

      let existingJobs = jobsByCompany.get(company.id);
      if (!existingJobs) {
        existingJobs = listJobsByCompanyId(company.id);
        jobsByCompany.set(company.id, existingJobs);
      }

      const dedupResult = checkDuplicate(
        {
          company_id: company.id,
          title: item.title,
          location: [],
          source: item.source || 'manual',
          source_id: item.source_id,
        },
        existingJobs,
      );

      if (dedupResult.isDuplicate) {
        const matchedJob = existingJobs.find(j => j.id === dedupResult.matchedJobId);
        return {
          index,
          exists: true,
          jobId: dedupResult.matchedJobId,
          status: matchedJob?.status,
          statusLabel: matchedJob ? (STATUS_LABELS[matchedJob.status] || matchedJob.status) : undefined,
        };
      }

      return { index, exists: false };
    });

    return extJsonResponse({ results });
  } catch (e) {
    return extErrorResponse((e as Error).message);
  }
});
