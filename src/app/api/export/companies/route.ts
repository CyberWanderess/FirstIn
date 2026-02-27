import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { listCompanies } from '@/lib/repositories/company-repository';
import { exportCompaniesForResearch } from '@/lib/export/company-exporter';
import { jsonResponse } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  ensureInitialized();
  const url = req.nextUrl;
  const infoStatus = url.searchParams.get('status') || 'pending';
  const format = (url.searchParams.get('format') || 'markdown') as 'markdown' | 'json';
  const idsParam = url.searchParams.get('ids');

  const { companies } = listCompanies({ infoStatus, limit: 200, offset: 0 });

  const filtered = idsParam
    ? companies.filter((c) => idsParam.split(',').map(Number).includes(c.id))
    : companies;

  const text = exportCompaniesForResearch(filtered, format);

  return jsonResponse({ text, companyCount: filtered.length });
}
