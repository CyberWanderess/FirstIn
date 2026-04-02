import { withAuth } from '@/lib/route-handler';
import { parseHiringCafeText } from '@/lib/parsers/hiring-cafe-parser';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';

export const POST = withAuth(async (req) => {
  try {
    const body = await parseJsonBody<{ text: string; defaultCompany?: string }>(req);
    if (!body.text) return errorResponse('text is required');
    const result = parseHiringCafeText(body.text, body.defaultCompany);
    return jsonResponse(result);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});
