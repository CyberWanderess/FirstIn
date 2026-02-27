import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { findCompanyById, updateCompany, deleteCompany, countActiveApplications } from '@/lib/repositories/company-repository';
import { listJobs } from '@/lib/repositories/job-repository';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';
import type { CompanyUpdate } from '@/types';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  ensureInitialized();
  const { id } = await params;
  const companyId = parseInt(id);
  const company = findCompanyById(companyId);
  if (!company) return errorResponse('Company not found', 404);

  const { jobs } = listJobs({ companyId, limit: 100, offset: 0 });
  const activeApplications = countActiveApplications(companyId);

  return jsonResponse({ ...company, jobs, active_applications: activeApplications });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  ensureInitialized();
  const { id } = await params;
  const companyId = parseInt(id);
  const existing = findCompanyById(companyId);
  if (!existing) return errorResponse('Company not found', 404);

  try {
    const body = await parseJsonBody<CompanyUpdate>(req);

    // Log strategy changes
    if (body.application_strategy && body.application_strategy !== existing.application_strategy) {
      logOperation({
        operation: 'company_update',
        entity_type: 'company',
        entity_id: companyId,
        trigger: 'user',
        details: {
          field: 'application_strategy',
          from: existing.application_strategy,
          to: body.application_strategy,
          reason: body.strategy_reason || null,
        },
      });
    }

    const updated = updateCompany(companyId, body);
    return jsonResponse(updated);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  ensureInitialized();
  const { id } = await params;
  const deleted = deleteCompany(parseInt(id));
  if (!deleted) return errorResponse('Cannot delete company with associated jobs', 400);
  return jsonResponse({ deleted: true });
}
