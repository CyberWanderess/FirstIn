import { withAuth } from '@/lib/route-handler';
import { userContext } from '@/lib/db';
import { checkFeature, checkQuota, incrementUsage } from '@/lib/permissions';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';
import type { JobInsert } from '@/types';

interface RawJob {
  title?: string;
  company_name?: string;
  location?: string | string[];
  salary_min?: number | null;
  salary_max?: number | null;
  work_mode?: string | null;
  commitment?: string | null;
  apply_url?: string | null;
  jd_url?: string | null;
  source?: string;
  jd_full_text?: string | null;
  notes?: string | null;
}

export const POST = withAuth(async (req) => {
  try {
    const userId = userContext.getStore()!.userId;
    if (!checkFeature(userId, 'can_import')) return errorResponse('Import not available for your plan', 403);
    const quota = checkQuota(userId, 'max_import_per_day');
    if (!quota.allowed) return errorResponse(`Daily import limit reached (${quota.limit})`, 429);

    const body = await parseJsonBody<{ jobs: RawJob[] }>(req);
    if (!body.jobs || !Array.isArray(body.jobs)) {
      return errorResponse('Expected { "jobs": [...] } format');
    }

    const items: JobInsert[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < body.jobs.length; i++) {
      const raw = body.jobs[i];

      if (!raw.title?.trim()) {
        warnings.push(`Job ${i + 1}: missing title, skipped`);
        continue;
      }
      if (!raw.company_name?.trim()) {
        warnings.push(`Job ${i + 1}: missing company_name, skipped`);
        continue;
      }

      // Normalize location to string[]
      let location: string[] = [];
      if (Array.isArray(raw.location)) {
        location = raw.location.filter(Boolean);
      } else if (typeof raw.location === 'string' && raw.location.trim()) {
        location = [raw.location.trim()];
      }

      items.push({
        title: raw.title.trim(),
        company_name: raw.company_name.trim(),
        location,
        salary_min: raw.salary_min ?? null,
        salary_max: raw.salary_max ?? null,
        work_mode: raw.work_mode ?? null,
        commitment: raw.commitment ?? null,
        apply_url: raw.apply_url ?? null,
        jd_url: raw.jd_url ?? null,
        source: raw.source || 'email_alert',
        jd_full_text: raw.jd_full_text ?? null,
        notes: raw.notes ?? null,
      });
    }

    incrementUsage(userId, 'max_import_per_day');
    return jsonResponse({ items, warnings });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});
