import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { withAuth } from '@/lib/route-handler';
import { userContext } from '@/lib/db';
import { listJobs } from '@/lib/repositories/job-repository';
import { parseMbox } from '@/lib/mbox/parser';
import { classifyEmails } from '@/lib/mbox/classifier';
import { extractRejections, extractConfirmations } from '@/lib/mbox/extractor';
import { matchRejections } from '@/lib/mbox/matcher';
import { checkFeature } from '@/lib/permissions';
import { jsonResponse, errorResponse } from '@/lib/api-utils';
import type { JobStatus } from '@/types';

// Rejections can only match jobs the user has actually applied to
const APPLIED_STATUSES: JobStatus[] = ['applied', 'interviewing'];

export const POST = withAuth(async (req) => {
  try {
    const ctx = userContext.getStore();
    const userId = ctx!.userId;
    if (!checkFeature(userId, 'can_import')) return errorResponse('Import not available for your plan', 403);
    if (!checkFeature(userId, 'can_import_rejections')) return errorResponse('Rejection import not available for your plan', 403);

    const content = await req.text();
    if (!content.trim()) {
      return errorResponse('Empty mbox content');
    }

    // Save mbox for debugging (one file per user, overwrite on re-upload)
    if (ctx) {
      const mboxDir = path.join(process.cwd(), 'data', 'mbox');
      mkdirSync(mboxDir, { recursive: true });
      writeFileSync(path.join(mboxDir, `${ctx.userId}.mbox`), content);
    }

    // Parse → Classify → Extract → Match
    const emails = parseMbox(content);
    const classified = classifyEmails(emails);
    const rejections = classified.filter(e => e.category === 'rejection');
    const confirmationEmails = classified.filter(e => e.category === 'confirmation');
    const extracted = extractRejections(rejections);
    const confirmations = extractConfirmations(confirmationEmails);

    // Only match against jobs the user has actually applied to
    const allJobs = [];
    for (const status of APPLIED_STATUSES) {
      const result = listJobs({ status, limit: 1000, offset: 0 });
      allJobs.push(...result.jobs);
    }

    const matchResult = matchRejections(extracted, allJobs, confirmations);

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
