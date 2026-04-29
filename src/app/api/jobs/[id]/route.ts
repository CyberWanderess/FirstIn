import { withAuth } from '@/lib/route-handler';
import { findJobById, updateJob, deleteJob } from '@/lib/repositories/job-repository';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import { validateTransition } from '@/lib/status-machine';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';
import type { JobUpdate, JobStatus } from '@/types';

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_req, context) => {
  const { id } = await (context as Params).params;
  const job = findJobById(parseInt(id));
  if (!job) return errorResponse('Job not found', 404);
  return jsonResponse(job);
});

export const PATCH = withAuth(async (req, context) => {
  const { id } = await (context as Params).params;
  const jobId = parseInt(id);
  const existing = findJobById(jobId);
  if (!existing) return errorResponse('Job not found', 404);

  try {
    const body = await parseJsonBody<JobUpdate>(req);

    // Validate status transition if status is being changed
    if (body.status && body.status !== existing.status) {
      const result = validateTransition(existing.status as JobStatus, body.status);
      if (!result.valid) {
        return errorResponse(`Invalid status transition: ${result.reason}`, 422);
      }

      logOperation({
        operation: 'status_change',
        entity_type: 'job',
        entity_id: jobId,
        trigger: 'user',
        details: { from: existing.status, to: body.status },
      });
    }

    if (body.score !== undefined && body.score !== existing.score) {
      logOperation({
        operation: 'score_update',
        entity_type: 'job',
        entity_id: jobId,
        trigger: 'user',
        details: { score: body.score, score_reason: body.score_reason },
      });
    }

    if (body.qa_flagged !== undefined && body.qa_flagged !== existing.qa_flagged) {
      logOperation({
        operation: 'clear_qa_flag',
        entity_type: 'job',
        entity_id: jobId,
        trigger: 'user',
        details: { from: existing.qa_flagged, to: body.qa_flagged, prior_notes: existing.qa_notes },
      });
    }

    const updated = updateJob(jobId, body);
    return jsonResponse(updated);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});

export const DELETE = withAuth(async (_req, context) => {
  const { id } = await (context as Params).params;
  const deleted = deleteJob(parseInt(id));
  if (!deleted) return errorResponse('Job not found', 404);
  return jsonResponse({ deleted: true });
});
