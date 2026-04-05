import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { withAuth } from '@/lib/route-handler';
import { userContext } from '@/lib/db';
import { listJobs } from '@/lib/repositories/job-repository';
import { parseMbox } from '@/lib/mbox/parser';
import { classifyEmails } from '@/lib/mbox/classifier';
import { extractRejections } from '@/lib/mbox/extractor';
import { matchRejections } from '@/lib/mbox/matcher';
import { jsonResponse, errorResponse } from '@/lib/api-utils';
import type { JobStatus } from '@/types';

const NON_TERMINAL_STATUSES: JobStatus[] = [
  'pending_eval', 'flagged', 'pending_deep_analysis',
  'ready_to_apply_tailored', 'ready_to_apply', 'applied',
  'interviewing', 'archived_filtered', 'archived_low_match', 'archived_manual',
];

export const POST = withAuth(async (req) => {
  try {
    const content = await req.text();
    if (!content.trim()) {
      return errorResponse('Empty mbox content');
    }

    // Save mbox for debugging (one file per user, overwrite on re-upload)
    const ctx = userContext.getStore();
    if (ctx) {
      const mboxDir = path.join(process.cwd(), 'data', 'mbox');
      mkdirSync(mboxDir, { recursive: true });
      writeFileSync(path.join(mboxDir, `${ctx.userId}.mbox`), content);
    }

    // Parse → Classify → Extract → Match
    const emails = parseMbox(content);
    const classified = classifyEmails(emails);
    const rejections = classified.filter(e => e.category === 'rejection');
    const extracted = extractRejections(rejections);

    // Get all non-terminal jobs for matching
    const allJobs = [];
    for (const status of NON_TERMINAL_STATUSES) {
      const result = listJobs({ status, limit: 1000, offset: 0 });
      allJobs.push(...result.jobs);
    }

    const matchResult = matchRejections(extracted, allJobs);

    return jsonResponse({
      emailStats: {
        total: emails.length,
        rejections: rejections.length,
        confirmations: classified.filter(e => e.category === 'confirmation').length,
        interviews: classified.filter(e => e.category === 'interview').length,
        noise: classified.filter(e => e.category === 'noise').length,
      },
      ...matchResult,
    });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});
