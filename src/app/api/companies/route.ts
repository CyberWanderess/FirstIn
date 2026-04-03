import { withAuth } from '@/lib/route-handler';
import { listCompanies, insertCompany } from '@/lib/repositories/company-repository';
import { jsonResponse, errorResponse, paginatedResponse, parseSearchParams, parseJsonBody } from '@/lib/api-utils';
import type { CompanyInsert } from '@/types';

export const GET = withAuth(async (req) => {
  const { page, limit, offset, q } = parseSearchParams(req);
  const url = req.nextUrl;

  const { companies, total } = listCompanies({
    strategy: url.searchParams.get('application_strategy') || undefined,
    infoStatus: url.searchParams.get('info_status') || undefined,
    q: q || undefined,
    limit,
    offset,
  });

  return paginatedResponse(companies, total, page, limit);
});

export const POST = withAuth(async (req) => {
  try {
    const body = await parseJsonBody<CompanyInsert>(req);
    if (!body.name || !body.display_name) {
      return errorResponse('name and display_name are required');
    }
    const company = insertCompany(body);
    return jsonResponse(company, 201);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});
