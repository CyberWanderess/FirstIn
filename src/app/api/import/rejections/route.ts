import { withAuth } from '@/lib/route-handler';
import { userContext } from '@/lib/db';
import { checkFeature } from '@/lib/permissions';
import { listJobs } from '@/lib/repositories/job-repository';
import { parseRejectionResults } from '@/lib/export/rejection-importer';
import { matchRejectionsToJobs } from '@/lib/export/rejection-exporter';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';
import type { JobStatus } from '@/types';

// Rejections can only match jobs the user has actually applied to
const APPLIED_STATUSES: JobStatus[] = ['applied', 'interviewing'];

export const POST = withAuth(async (req) => {
  try {
    const userId = userContext.getStore()!.userId;
    if (!checkFeature(userId, 'can_import_rejections')) return errorResponse('Rejection import not available for your plan', 403);

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
    for (const status of APPLIED_STATUSES) {
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
