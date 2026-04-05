import { withAuth } from '@/lib/route-handler';
import { findJobById, updateJob } from '@/lib/repositories/job-repository';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';

interface ConfirmItem {
  jobId: number;
  rejectionDate: string;
  company: string;
  role: string;
}

export const POST = withAuth(async (req) => {
  try {
    const body = await parseJsonBody<{ items: ConfirmItem[] }>(req);
    const items = body.items || [];

    if (items.length === 0) {
      return errorResponse('No items to import');
    }

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const item of items) {
      const job = findJobById(item.jobId);
      if (!job) {
        errors.push(`Job #${item.jobId} not found`);
        continue;
      }

      if (job.status === 'rejected_resume') {
        skipped++;
        continue;
      }

      const rejectionNote = `[mbox] Rejected ${item.rejectionDate || 'unknown date'} - ${item.role}`;
      const newNotes = job.notes ? `${job.notes}\n${rejectionNote}` : rejectionNote;

      updateJob(item.jobId, {
        status: 'rejected_resume',
        notes: newNotes,
      });

      logOperation({
        operation: 'status_change',
        entity_type: 'job',
        entity_id: item.jobId,
        trigger: 'import',
        details: {
          from: job.status,
          to: 'rejected_resume',
          reason: 'resume',
          source: 'mbox_import',
          rejection_date: item.rejectionDate,
          email_company: item.company,
          email_role: item.role,
        },
      });

      updated++;
    }

    return jsonResponse({ updated, skipped, errors });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});
