import { withAuth } from '@/lib/route-handler';
import { userContext } from '@/lib/db';
import { checkFeature } from '@/lib/permissions';
import { listJobs, findJobById } from '@/lib/repositories/job-repository';
import { getSetting } from '@/lib/repositories/settings-repository';
import { exportJobsForDeepAnalysis } from '@/lib/export/deep-analysis-exporter';
import { resolvePrompt } from '@/lib/export/prompt-registry';
import { jsonResponse, errorResponse } from '@/lib/api-utils';
import type { JobWithCompany } from '@/types';

export const GET = withAuth(async (req) => {
  const userId = userContext.getStore()!.userId;
  if (!checkFeature(userId, 'can_eval')) return errorResponse('AI evaluation not available for your plan', 403);
  const url = req.nextUrl;
  const format = (url.searchParams.get('format') || 'markdown') as 'markdown' | 'json';
  const idsParam = url.searchParams.get('ids');
  const limit = parseInt(url.searchParams.get('limit') || '10', 10);

  let jobs: JobWithCompany[];

  if (idsParam) {
    const ids = idsParam.split(',').map((id) => parseInt(id.trim(), 10)).filter(Boolean);
    jobs = ids.map((id) => findJobById(id)).filter(Boolean) as JobWithCompany[];
  } else {
    const result = listJobs({ status: 'pending_deep_analysis', limit, offset: 0, sort: 'score', order: 'DESC' });
    jobs = result.jobs;
  }

  const resumeText = getSetting('resume_text', '');
  const text = exportJobsForDeepAnalysis(jobs, format, resumeText || undefined, {
    instructions: resolvePrompt('deep_analysis.instructions'),
  });
  return jsonResponse({ text, jobCount: jobs.length });
});
