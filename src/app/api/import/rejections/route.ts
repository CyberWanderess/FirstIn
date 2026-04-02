import { withAuth } from '@/lib/route-handler';
import { listJobs } from '@/lib/repositories/job-repository';
import { parseRejectionResults } from '@/lib/export/rejection-importer';
import { matchRejectionsToJobs } from '@/lib/export/rejection-exporter';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';
import type { JobStatus } from '@/types';

const NON_TERMINAL_STATUSES: JobStatus[] = [
  'pending_eval', 'flagged', 'pending_deep_analysis',
  'ready_to_apply_tailored', 'ready_to_apply', 'applied',
  'interviewing', 'archived_filtered', 'archived_low_match', 'archived_manual',
];

export const POST = withAuth(async (req) => {
  try {
    const body = await parseJsonBody<{ text: string }>(req);
    if (!body.text?.trim()) {
      return errorResponse('text is required');
    }

    // Parse AI response
    const { items, warnings } = parseRejectionResults(body.text.trim());

    if (items.length === 0) {
      return jsonResponse({ matched: [], unmatched: [], warnings });
    }

    // Get all non-terminal jobs for matching
    const allJobs = [];
    for (const status of NON_TERMINAL_STATUSES) {
      const result = listJobs({ status, limit: 1000, offset: 0 });
      allJobs.push(...result.jobs);
    }

    // Match rejections to jobs
    const { matched, unmatched } = matchRejectionsToJobs(items, allJobs);

    return jsonResponse({ matched, unmatched, warnings });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});
