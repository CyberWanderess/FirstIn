import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { parseHiringCafeText } from '@/lib/parsers/hiring-cafe-parser';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  ensureInitialized();
  try {
    const body = await parseJsonBody<{ text: string; defaultCompany?: string }>(req);
    if (!body.text) return errorResponse('text is required');
    const result = parseHiringCafeText(body.text, body.defaultCompany);
    return jsonResponse(result);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
