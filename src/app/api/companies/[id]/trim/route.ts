import { withAuth } from '@/lib/route-handler';
import { findCompanyById } from '@/lib/repositories/company-repository';
import { updateJob } from '@/lib/repositories/job-repository';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';
import { getDb } from '@/lib/db';
import type { JobStatus } from '@/types';

const TRIMMABLE_STATUSES: JobStatus[] = [
  'pending_eval',
  'flagged',
  'pending_deep_analysis',
  'ready_to_apply_tailored',
  'ready_to_apply',
];

type Params = { params: Promise<{ id: string }> };

export const POST = withAuth(async (req, context) => {
  const { id } = await (context as Params).params;
  const companyId = parseInt(id);
  const company = findCompanyById(companyId);
  if (!company) return errorResponse('Company not found', 404);

  const body = await parseJsonBody<{ keep: number }>(req);
  const keep = body.keep;
  if (!keep || keep < 1) return errorResponse('Invalid keep count', 400);

  const db = getDb();
  const placeholders = TRIMMABLE_STATUSES.map(() => '?').join(',');

  // Get all trimmable jobs sorted by score_success DESC, score DESC
  const jobs = db.prepare(`
    SELECT id, title, score_success, score, status
    FROM jobs
    WHERE company_id = ? AND status IN (${placeholders})
    ORDER BY
      COALESCE(score_success, -1) DESC,
      COALESCE(score, -1) DESC
  `).all(companyId, ...TRIMMABLE_STATUSES) as { id: number; title: string; score_success: number | null; score: number | null; status: string }[];

  if (jobs.length <= keep) {
    return jsonResponse({ archived: 0, kept: jobs.length, archivedJobs: [] });
  }

  const toArchive = jobs.slice(keep);
  const archivedJobs: { id: number; title: string }[] = [];

  for (const job of toArchive) {
    updateJob(job.id, {
      status: 'archived_manual' as JobStatus,
      notes: `[Auto Trim] Exceeded application limit (kept top ${keep})`,
    });
    logOperation({
      entity_type: 'job',
      entity_id: job.id,
      operation: 'status_change',
      trigger: 'user',
      details: { from: job.status, to: 'archived_manual', reason: 'company_trim' },
    });
    archivedJobs.push({ id: job.id, title: job.title });
  }

  return jsonResponse({
    archived: archivedJobs.length,
    kept: keep,
    archivedJobs,
  });
});
