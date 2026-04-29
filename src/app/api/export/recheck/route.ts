import { withAuth } from '@/lib/route-handler';
import { findJobById } from '@/lib/repositories/job-repository';
import { buildRecheckPrompt } from '@/lib/export/evaluation-recheck';
import { resolvePrompt } from '@/lib/export/prompt-registry';
import { jsonResponse, errorResponse } from '@/lib/api-utils';
import type { JobWithCompany } from '@/types';

export const GET = withAuth(async (req) => {
  const url = req.nextUrl;
  const idsParam = url.searchParams.get('ids') || url.searchParams.get('id');

  if (!idsParam) {
    return errorResponse('Missing required parameter: id or ids', 400);
  }

  const ids = idsParam.split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean);
  if (ids.length === 0) {
    return errorResponse('No valid job ids provided', 400);
  }

  // Resolve once per request; same config for every job in the batch.
  const recheckConfig = {
    taskFraming: resolvePrompt('recheck.task_framing'),
    signalStrengthMap: resolvePrompt('recheck.signal_strength'),
    sharedScoringRules: resolvePrompt('shared.scoring_rules'),
    outputFormat: resolvePrompt('recheck.output_format'),
  };

  const prompts: string[] = [];
  for (const id of ids) {
    const job = findJobById(id) as JobWithCompany | null;
    if (!job) {
      prompts.push(`# Job #${id}: NOT FOUND\n`);
      continue;
    }

    prompts.push(buildRecheckPrompt(job, recheckConfig));
  }

  const text = prompts.join('\n---\n\n');
  return jsonResponse({ text, jobCount: ids.length });
});
