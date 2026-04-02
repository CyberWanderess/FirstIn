import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { verifyExtensionToken, extJsonResponse, extErrorResponse, extOptionsResponse } from '@/lib/extension-auth';
import { findCompanyByNameFuzzy } from '@/lib/repositories/company-repository';
import { findJobById, findJobBySourceId, listJobs } from '@/lib/repositories/job-repository';
import { checkDuplicate } from '@/lib/dedup';
import { STATUS_LABELS } from '@/types/job';

interface CheckRequest {
  title: string;
  company_name: string;
  source_id?: string;
  source?: string;
}

export async function OPTIONS() { return extOptionsResponse(); }

export async function POST(req: NextRequest) {
  ensureInitialized();
  const auth = verifyExtensionToken(req);
  if (!auth.valid) return auth.response;

  try {
    const body = await req.json() as CheckRequest;
    if (!body.title || !body.company_name) {
      return extErrorResponse('title and company_name are required');
    }

    // Fast path: source_id lookup via association table
    if (body.source_id && body.source) {
      const jobId = findJobBySourceId(body.source, body.source_id);
      if (jobId) {
        const job = findJobById(jobId);
        return extJsonResponse({
          exists: true,
          jobId,
          status: job?.status,
          statusLabel: job ? (STATUS_LABELS[job.status] || job.status) : undefined,
          matchType: 'source_id',
        });
      }
    }

    // Slow path: company + content hash / title dedup
    const company = findCompanyByNameFuzzy(body.company_name);
    if (!company) {
      return extJsonResponse({ exists: false });
    }

    const { jobs: existingJobs } = listJobs({ limit: 10000, offset: 0 });
    const dedupResult = checkDuplicate(
      {
        company_id: company.id,
        title: body.title,
        location: [],
        source: body.source || 'manual',
        source_id: body.source_id,
      },
      existingJobs,
    );

    if (dedupResult.isDuplicate) {
      const matchedJob = existingJobs.find(j => j.id === dedupResult.matchedJobId);
      return extJsonResponse({
        exists: true,
        jobId: dedupResult.matchedJobId,
        status: matchedJob?.status,
        statusLabel: matchedJob ? (STATUS_LABELS[matchedJob.status] || matchedJob.status) : undefined,
        matchType: dedupResult.matchType,
      });
    }

    return extJsonResponse({ exists: false });
  } catch (e) {
    return extErrorResponse((e as Error).message);
  }
}
