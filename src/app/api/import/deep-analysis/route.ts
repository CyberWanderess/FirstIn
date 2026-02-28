import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { parseDeepAnalysis } from '@/lib/export/deep-analysis-importer';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  ensureInitialized();
  try {
    const body = await parseJsonBody<{ text: string }>(req);
    const text = body.text;
    if (!text || typeof text !== 'string') {
      return errorResponse('Missing "text" field', 400);
    }

    const result = parseDeepAnalysis(text);
    return jsonResponse(result);
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
}
