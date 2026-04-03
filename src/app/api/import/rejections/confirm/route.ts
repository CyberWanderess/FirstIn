import { withAuth } from '@/lib/route-handler';
import { applyRejectionResults, createRejectedJobs } from '@/lib/export/rejection-importer';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';
import type { MatchedRejection, UnmatchedRejection } from '@/lib/export/rejection-exporter';

export const POST = withAuth(async (req) => {
  try {
    const body = await parseJsonBody<{
      matched: MatchedRejection[];
      unmatched: UnmatchedRejection[];
    }>(req);

    const matchedItems = body.matched || [];
    const unmatchedItems = body.unmatched || [];

    const matchedResult = matchedItems.length > 0
      ? applyRejectionResults(matchedItems)
      : { updated: 0, skipped: 0, errors: [] };

    const unmatchedResult = unmatchedItems.length > 0
      ? createRejectedJobs(unmatchedItems)
      : { created: 0, errors: [] };

    logOperation({
      operation: 'status_change',
      entity_type: 'batch',
      trigger: 'import',
      details: {
        source: 'rejection_email_scan',
        matched_total: matchedItems.length,
        matched_updated: matchedResult.updated,
        matched_skipped: matchedResult.skipped,
        unmatched_total: unmatchedItems.length,
        unmatched_created: unmatchedResult.created,
      },
    });

    return jsonResponse({
      updated: matchedResult.updated,
      skipped: matchedResult.skipped,
      created: unmatchedResult.created,
      errors: [...matchedResult.errors, ...unmatchedResult.errors],
    });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});
