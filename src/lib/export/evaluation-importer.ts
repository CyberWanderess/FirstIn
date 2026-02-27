import { getDb } from '@/lib/db';
import { findJobById, updateJob } from '@/lib/repositories/job-repository';
import { validateTransition } from '@/lib/status-machine';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import type { JobStatus, ParseResult } from '@/types';

export interface EvaluationItem {
  id: number;
  score: number;
  score_reason: string;
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
    if (!['proceed', 'mass_apply', 'skip', 'flag'].includes(item.recommendation)) {
      warnings.push(`Item ${i + 1} (id=${item.id}): recommendation must be proceed/mass_apply/skip/flag`);
      continue;
    }
    const h1b = ['yes', 'no', 'unknown'].includes(item.h1b_sponsorship) ? item.h1b_sponsorship : undefined;
    items.push({
      id: item.id,
      score: item.score,
      score_reason: item.score_reason || '',
      recommendation: item.recommendation,
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
          score_reason: item.score_reason,
          notes: job.notes ? `${job.notes}\n[Flagged] ${item.score_reason}` : `[Flagged] ${item.score_reason}`,
        };
        if (item.h1b_sponsorship && item.h1b_sponsorship !== 'unknown') {
          flagUpdate.visa_sponsorship = item.h1b_sponsorship;
        }
        updateJob(item.id, flagUpdate);

        logOperation({
          operation: 'score_update',
          entity_type: 'job',
          entity_id: item.id,
          trigger: 'import',
          details: { score: item.score, recommendation: 'flag' },
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
        score_reason: item.score_reason,
        status: targetStatus,
      };
      if (item.h1b_sponsorship && item.h1b_sponsorship !== 'unknown') {
        evalUpdate.visa_sponsorship = item.h1b_sponsorship;
      }
      updateJob(item.id, evalUpdate);

      logOperation({
        operation: 'score_update',
        entity_type: 'job',
        entity_id: item.id,
        trigger: 'import',
        details: { score: item.score, from: job.status, to: targetStatus, recommendation: item.recommendation, h1b_sponsorship: item.h1b_sponsorship },
      });

      updated++;
    }
  });

  run();
  return { updated, errors };
}
