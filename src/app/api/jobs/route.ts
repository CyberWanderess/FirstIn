import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { listJobs, insertJob } from '@/lib/repositories/job-repository';
import { findOrCreateCompany } from '@/lib/repositories/company-repository';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import { jsonResponse, errorResponse, paginatedResponse, parseSearchParams, parseJsonBody } from '@/lib/api-utils';
import type { JobInsert } from '@/types';

export async function GET(req: NextRequest) {
  ensureInitialized();
  const { page, limit, offset, sort, order, q } = parseSearchParams(req);
  const url = req.nextUrl;

  const { jobs, total } = listJobs({
    status: url.searchParams.get('status') || undefined,
    companyId: url.searchParams.get('company_id') ? parseInt(url.searchParams.get('company_id')!) : undefined,
    workMode: url.searchParams.get('work_mode') || undefined,
    commitment: url.searchParams.get('commitment') || undefined,
    jdFetchStatus: url.searchParams.get('jd_fetch_status') || undefined,
    q: q || undefined,
    sort,
    order,
    limit,
    offset,
  });

  return paginatedResponse(jobs, total, page, limit);
}

export async function POST(req: NextRequest) {
  ensureInitialized();
  try {
    const body = await parseJsonBody<JobInsert>(req);

    if (!body.title) return errorResponse('title is required');
    if (!body.company_name && !body.company_id) return errorResponse('company_name or company_id is required');

    let companyId = body.company_id;
    if (!companyId && body.company_name) {
      const company = findOrCreateCompany(body.company_name);
      companyId = company.id;
    }

    const job = insertJob({ ...body, company_id: companyId! });

    logOperation({
      operation: 'status_change',
      entity_type: 'job',
      entity_id: job.id,
      trigger: 'user',
      details: { from: null, to: job.status, reason: 'created' },
    });

    return jsonResponse(job, 201);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
