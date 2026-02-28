import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { applyDeepAnalysis, type DeepAnalysisItem } from '@/lib/export/deep-analysis-importer';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  ensureInitialized();
  try {
    const body = await parseJsonBody<{ items: DeepAnalysisItem[] }>(req);
    const items = body.items;
    if (!Array.isArray(items)) {
      return errorResponse('Missing "items" array', 400);
    }

    const result = applyDeepAnalysis(items);

    logOperation({
      operation: 'status_change',
      entity_type: 'batch',
      trigger: 'import',
      details: { type: 'deep_analysis', updated: result.updated, errors: result.errors.length },
    });

    return jsonResponse({ imported: result.updated, errors: result.errors });
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
}
