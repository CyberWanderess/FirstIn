import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { applyEvaluationResults, type EvaluationItem } from '@/lib/export/evaluation-importer';
import { getSettingNumber } from '@/lib/repositories/settings-repository';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  ensureInitialized();
  try {
    const body = await parseJsonBody<{ items: EvaluationItem[] }>(req);
    if (!body.items || !Array.isArray(body.items)) {
      return errorResponse('items array is required');
    }

    const threshold = getSettingNumber('eval_score_threshold', 7);
    const result = applyEvaluationResults(body.items, threshold);

    logOperation({
      operation: 'evaluate',
      entity_type: 'batch',
      trigger: 'user',
      details: {
        total: body.items.length,
        updated: result.updated,
        proceed: body.items.filter((i) => i.recommendation === 'proceed').length,
        skip: body.items.filter((i) => i.recommendation === 'skip').length,
        flag: body.items.filter((i) => i.recommendation === 'flag').length,
      },
    });

    return jsonResponse(result);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
