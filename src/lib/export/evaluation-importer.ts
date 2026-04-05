import { getDb } from '@/lib/db';
import { findJobById, updateJob } from '@/lib/repositories/job-repository';
import { validateTransition } from '@/lib/status-machine';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import type { JobStatus, ParseResult } from '@/types';
import { SCORE_TAGS } from '@/types';

export interface EvaluationItem {
  id: number;
  score: number;
  score_success: number;
  score_reason: string;
  score_tags?: string[];
  recommendation: 'proceed' | 'mass_apply' | 'skip' | 'flag';
  h1b_sponsorship?: 'yes' | 'no' | 'unknown';
}

/**
 * Parse JSON text of evaluation results.
 */
export function parseEvaluationResults(jsonText: string): ParseResult<EvaluationItem> {
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { items: [], warnings: ['Invalid JSON format'] };
  }

  if (!Array.isArray(parsed)) {
    return { items: [], warnings: ['Expected a JSON array'] };
  }

  const items: EvaluationItem[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (typeof item.id !== 'number') {
      warnings.push(`Item ${i + 1}: missing or invalid "id" field`);
      continue;
    }
    if (typeof item.score !== 'number' || item.score < 1 || item.score > 10) {
      warnings.push(`Item ${i + 1} (id=${item.id}): score must be 1-10`);
      continue;
    }
    if (typeof item.score_success !== 'number' || item.score_success < 1 || item.score_success > 10) {
      warnings.push(`Item ${i + 1} (id=${item.id}): score_success must be 1-10`);
      continue;
    }
    if (!['proceed', 'mass_apply', 'skip', 'flag'].includes(item.recommendation)) {
      warnings.push(`Item ${i + 1} (id=${item.id}): recommendation must be proceed/mass_apply/skip/flag`);
      continue;
    }
    const rawH1b = ['yes', 'no', 'unknown'].includes(item.h1b_sponsorship) ? item.h1b_sponsorship : undefined;
    const h1b = rawH1b === 'unknown' ? undefined : rawH1b;
    const rawTags = Array.isArray(item.score_tags) ? item.score_tags : [];
    if (rawTags.includes('domain_gap')) {
      warnings.push(`Item ${i + 1} (id=${item.id}): bare "domain_gap" is deprecated — use domain_gap:minor, domain_gap:major, or domain_gap:blocker`);
    }
    const score_tags = rawTags.filter((t: unknown) => typeof t === 'string' && (SCORE_TAGS as readonly string[]).includes(t));

    // Warn if score_reason is missing
    const score_reason = item.score_reason && typeof item.score_reason === 'string' && item.score_reason.trim()
      ? item.score_reason.trim()
      : '(no reason provided)';
    if (score_reason === '(no reason provided)') {
      warnings.push(`Item ${i + 1} (id=${item.id}): missing score_reason`);
    }

    // Auto-derive recommendation from score_success (flag is preserved as-is)
    let recommendation: 'proceed' | 'mass_apply' | 'skip' | 'flag' = item.recommendation;
    if (item.recommendation !== 'flag') {
      const derived = item.score_success >= 7 ? 'proceed' : item.score_success >= 4 ? 'mass_apply' : 'skip';
      if (derived !== item.recommendation) {
        warnings.push(`Item ${i + 1} (id=${item.id}): recommendation auto-corrected from '${item.recommendation}' to '${derived}' based on score_success=${item.score_success}`);
        recommendation = derived;
      }
    }

    items.push({
      id: item.id,
      score: item.score,
      score_success: item.score_success,
      score_reason,
      score_tags: score_tags?.length ? score_tags : undefined,
      recommendation,
      h1b_sponsorship: h1b,
    });
  }

  return { items, warnings };
}

/**
 * Apply evaluation results to the database.
 * Wraps in a transaction.
 */
export function applyEvaluationResults(
  items: EvaluationItem[],
): { updated: number; errors: string[] } {
  const db = getDb();
  let updated = 0;
  const errors: string[] = [];

  const run = db.transaction(() => {
    for (const item of items) {
      const job = findJobById(item.id);
      if (!job) {
        errors.push(`Job #${item.id} not found`);
        continue;
      }

      // Determine target status
      let targetStatus: JobStatus;
      if (item.recommendation === 'skip') {
        targetStatus = 'archived_low_match';
      } else if (item.recommendation === 'mass_apply') {
        targetStatus = 'ready_to_apply';
      } else if (item.recommendation === 'proceed') {
        targetStatus = 'pending_deep_analysis';
      } else {
        // flag — keep current status, just update score
        const flagUpdate: Record<string, unknown> = {
          score: item.score,
          score_success: item.score_success,
          score_reason: item.score_reason,
          notes: job.notes ? `${job.notes}\n[Flagged] ${item.score_reason}` : `[Flagged] ${item.score_reason}`,
        };
        if (item.score_tags?.length) {
          flagUpdate.score_tags = item.score_tags;
        }
        if (item.h1b_sponsorship && item.h1b_sponsorship !== 'unknown') {
          flagUpdate.visa_sponsorship = item.h1b_sponsorship;
        }
        updateJob(item.id, flagUpdate);

        logOperation({
          operation: 'score_update',
          entity_type: 'job',
          entity_id: item.id,
          trigger: 'import',
          details: { score: item.score, score_success: item.score_success, recommendation: 'flag' },
        });

        updated++;
        continue;
      }

      // Validate state transition
      const validation = validateTransition(job.status as JobStatus, targetStatus);
      if (!validation.valid) {
        errors.push(`Job #${item.id}: ${validation.reason}`);
        continue;
      }

      const evalUpdate: Record<string, unknown> = {
        score: item.score,
        score_success: item.score_success,
        score_reason: item.score_reason,
        status: targetStatus,
      };
      if (item.score_tags?.length) {
        evalUpdate.score_tags = item.score_tags;
      }
      if (item.h1b_sponsorship && item.h1b_sponsorship !== 'unknown') {
        evalUpdate.visa_sponsorship = item.h1b_sponsorship;
      }
      updateJob(item.id, evalUpdate);

      logOperation({
        operation: 'score_update',
        entity_type: 'job',
        entity_id: item.id,
        trigger: 'import',
        details: { score: item.score, score_success: item.score_success, from: job.status, to: targetStatus, recommendation: item.recommendation, h1b_sponsorship: item.h1b_sponsorship },
      });

      updated++;
    }
  });

  run();
  return { updated, errors };
}
