import { withAuth } from '@/lib/route-handler';
import { userContext } from '@/lib/db';
import { checkFeature } from '@/lib/permissions';
import { listJobs, findJobById } from '@/lib/repositories/job-repository';
import { exportJobsForEvaluation } from '@/lib/export/evaluation-exporter';
import { resolvePrompt } from '@/lib/export/prompt-registry';
import { jsonResponse, errorResponse } from '@/lib/api-utils';
import type { JobWithCompany } from '@/types';

export const GET = withAuth(async (req) => {
  const userId = userContext.getStore()!.userId;
  if (!checkFeature(userId, 'can_eval')) return errorResponse('AI evaluation not available for your plan', 403);
  const url = req.nextUrl;
  const status = url.searchParams.get('status') || 'pending_eval';
  const format = (url.searchParams.get('format') || 'markdown') as 'markdown' | 'json';
  const idsParam = url.searchParams.get('ids');
  const limit = parseInt(url.searchParams.get('limit') || '10', 10);

  let jobs: JobWithCompany[];

  if (idsParam) {
    const ids = idsParam.split(',').map((id) => parseInt(id.trim(), 10)).filter(Boolean);
    jobs = ids.map((id) => findJobById(id)).filter(Boolean) as JobWithCompany[];
  } else {
    const result = listJobs({ status, limit, offset: 0, sort: 'created_at', order: 'ASC' });
    jobs = result.jobs;
  }

  const config = {
    scoringGuidance: resolvePrompt('eval.scoring_guidance'),
    calibrationExamples: resolvePrompt('eval.calibration'),
    scoreTags: resolvePrompt('eval.score_tags'),
  };
  const text = exportJobsForEvaluation(jobs, format, config);
  return jsonResponse({ text, jobCount: jobs.length });
});
