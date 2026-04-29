import { withAuth } from '@/lib/route-handler';
import { listCompanies } from '@/lib/repositories/company-repository';
import { exportCompaniesForResearch } from '@/lib/export/company-exporter';
import { resolvePrompt } from '@/lib/export/prompt-registry';
import { jsonResponse } from '@/lib/api-utils';

export const GET = withAuth(async (req) => {
  const url = req.nextUrl;
  const infoStatus = url.searchParams.get('status') || 'pending';
  const format = (url.searchParams.get('format') || 'markdown') as 'markdown' | 'json';
  const idsParam = url.searchParams.get('ids');

  const { companies } = listCompanies({ infoStatus, limit: 200, offset: 0 });

  const filtered = idsParam
    ? companies.filter((c) => idsParam.split(',').map(Number).includes(c.id))
    : companies;

  const text = exportCompaniesForResearch(filtered, format, {
    instructions: resolvePrompt('company.instructions'),
  });

  return jsonResponse({ text, companyCount: filtered.length });
});
