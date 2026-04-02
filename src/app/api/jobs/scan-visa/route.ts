import { withAuth } from '@/lib/route-handler';
import { getDb } from '@/lib/db';
import { updateJob } from '@/lib/repositories/job-repository';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import { scanVisaSponsorship } from '@/lib/visa-scan';
import { jsonResponse, errorResponse } from '@/lib/api-utils';

/**
 * POST /api/jobs/scan-visa
 * Batch scan all jobs with JD text but no visa_sponsorship result.
 */
export const POST = withAuth(async () => {
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT id, jd_full_text FROM jobs
       WHERE jd_full_text IS NOT NULL AND visa_sponsorship IS NULL`
    ).all() as Array<{ id: number; jd_full_text: string }>;

    let scanned = 0;
    let detected = 0;

    for (const row of rows) {
      const result = scanVisaSponsorship(row.jd_full_text);
      if (result !== null) {
        updateJob(row.id, { visa_sponsorship: result });
        detected++;
      }
      scanned++;
    }

    logOperation({
      operation: 'visa_scan',
      entity_type: 'batch',
      trigger: 'user',
      details: { scanned, detected },
    });

    return jsonResponse({ scanned, detected });
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
});
