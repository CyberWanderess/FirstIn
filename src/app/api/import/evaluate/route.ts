import { withAuth } from '@/lib/route-handler';
import { parseEvaluationResults } from '@/lib/export/evaluation-importer';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';

export const POST = withAuth(async (req) => {
  try {
    const body = await parseJsonBody<{ text: string }>(req);
    if (!body.text) return errorResponse('text is required');
    const result = parseEvaluationResults(body.text);
    return jsonResponse(result);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});
