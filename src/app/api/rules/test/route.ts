import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { listRules } from '@/lib/repositories/rule-repository';
import { getSetting } from '@/lib/repositories/settings-repository';
import { findCompanyById } from '@/lib/repositories/company-repository';
import { evaluateJob } from '@/lib/rule-engine';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';
import type { JobInsert } from '@/types';

export async function POST(req: NextRequest) {
  ensureInitialized();
  try {
    const raw = await parseJsonBody<{ job?: JobInsert & { company?: string } } & JobInsert & { company?: string }>(req);
    const body = raw.job ?? raw;
    if (!body.title) return errorResponse('title is required for testing');

    const rules = listRules(true);
    const company = body.company_id ? findCompanyById(body.company_id) : null;

    const result = evaluateJob(body, rules, company, {
      noH1bAction: getSetting('no_h1b_action', 'auto_exclude'),
      blockedAction: getSetting('blocked_action', 'auto_exclude'),
      jobNoVisaAction: getSetting('job_no_visa_action', 'auto_exclude'),
    });

    return jsonResponse(result);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
