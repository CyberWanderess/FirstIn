import { withAuth } from '@/lib/route-handler';
import { getDb } from '@/lib/db';
import { findJobById, updateJob } from '@/lib/repositories/job-repository';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import { parseRecheckResult, computeDecision, type RecheckResult } from '@/lib/export/evaluation-recheck';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';

/** Import item: model outputs score_success, system computes decision */
interface RecheckImportItem {
  id: number;
  score_success: number;
  daily_work_summary: string;
  must_haves_match: string[];
  must_haves_gap: string[];
  reason: string;
  // Legacy fields (accepted but ignored — system computes these)
  original_score_success?: number;
  revised_score_success?: number;
  decision?: string;
}

function normalizeItem(raw: Record<string, unknown>): RecheckImportItem | null {
  const id = raw.id as number;
  if (typeof id !== 'number') return null;
  // Accept both new (score_success) and old (revised_score_success) format
  const score = (raw.score_success ?? raw.revised_score_success) as number;
  if (typeof score !== 'number') return null;
  return {
    id,
    score_success: Math.round(Math.max(1, Math.min(10, score)) * 10) / 10,
    daily_work_summary: (raw.daily_work_summary as string) || '',
    must_haves_match: Array.isArray(raw.must_haves_match) ? raw.must_haves_match : [],
    must_haves_gap: Array.isArray(raw.must_haves_gap) ? raw.must_haves_gap : [],
    reason: (raw.reason as string) || '',
  };
}

// POST with { text } → parse and preview
export const POST = withAuth(async (req) => {
  try {
    const body = await parseJsonBody<{ text: string }>(req);
    if (!body.text) return errorResponse('text is required');

    const cleaned = body.text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

    // Try array first
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const rawItems = JSON.parse(arrayMatch[0]) as Record<string, unknown>[];
        const items = rawItems.map(normalizeItem).filter(Boolean) as RecheckImportItem[];
        if (items.length > 0) {
          return jsonResponse({ items, warnings: [] });
        }
      } catch { /* fall through */ }
    }

    // Try multiple standalone JSON objects
    const objectMatches = [...cleaned.matchAll(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*[^{}]*\}/g)];
    if (objectMatches.length > 1) {
      const items: RecheckImportItem[] = [];
      for (const m of objectMatches) {
        try {
          const obj = JSON.parse(m[0]);
          const item = normalizeItem(obj);
          if (item) items.push(item);
        } catch { /* skip unparseable */ }
      }
      if (items.length > 0) {
        return jsonResponse({ items, warnings: [] });
      }
    }

    // Try single object
    const result = parseRecheckResult(cleaned);
    if (result) {
      return jsonResponse({ items: [result], warnings: [] });
    }

    return errorResponse('Could not parse recheck results. Expected JSON with id and score_success fields.');
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});

// PUT with { items } → apply results
export const PUT = withAuth(async (req) => {
  try {
    const body = await parseJsonBody<{ items: RecheckImportItem[] }>(req);
    if (!body.items || !Array.isArray(body.items)) {
      return errorResponse('items array is required');
    }

    const db = getDb();
    let updated = 0;
    let upgraded = 0;
    let downgraded = 0;
    const errors: string[] = [];

    const run = db.transaction(() => {
      for (const item of body.items) {
        const job = findJobById(item.id);
        if (!job) {
          errors.push(`Job #${item.id} not found`);
          continue;
        }

        const originalScore = job.score_success ?? 5;
        const decision = computeDecision(originalScore, item.score_success);

        const updates: Record<string, unknown> = {
          score_success: item.score_success,
          score_reason: `[Recheck] ${item.reason} (was ${originalScore}, ${job.score_reason || ''})`,
        };

        if (decision === 'upgrade') {
          updates.status = 'pending_deep_analysis';
          upgraded++;
        } else if (decision === 'downgrade') {
          updates.status = 'archived_low_match';
          downgraded++;
        }

        updateJob(item.id, updates);

        logOperation({
          operation: 'score_update',
          entity_type: 'job',
          entity_id: item.id,
          trigger: 'import',
          details: {
            recheck: true,
            decision,
            original_score_success: originalScore,
            new_score_success: item.score_success,
            daily_work: item.daily_work_summary,
          },
        });

        // Track in auto_eval_log so rechecked jobs are excluded from future recheck lists
        const summary = `${originalScore}→${item.score_success} ${decision} | ${item.daily_work_summary}`;
        db.prepare(`
          INSERT INTO auto_eval_log (run_type, entity_type, entity_id, entity_name, status, result_summary)
          VALUES ('job_recheck', 'job', ?, ?, 'success', ?)
        `).run(item.id, `${job.title} @ ${job.company_display_name}`, summary);

        updated++;
      }
    });

    run();
    return jsonResponse({ updated, upgraded, downgraded, errors });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});
