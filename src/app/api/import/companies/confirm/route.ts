import { withAuth } from '@/lib/route-handler';
import { applyCompanyResearch, type CompanyResearchItem } from '@/lib/export/company-importer';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';

export const POST = withAuth(async (req) => {
  try {
    const body = await parseJsonBody<{ items: CompanyResearchItem[] }>(req);
    if (!body.items || !Array.isArray(body.items)) {
      return errorResponse('items array is required');
    }
    const result = applyCompanyResearch(body.items);

    logOperation({
      operation: 'import',
      entity_type: 'batch',
      trigger: 'user',
      details: { type: 'company_research', total: body.items.length, updated: result.updated, errors: result.errors.length },
    });

    return jsonResponse(result);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});
