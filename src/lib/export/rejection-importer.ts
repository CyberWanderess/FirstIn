import { getDb } from '@/lib/db';
import { findJobById, updateJob, insertJob } from '@/lib/repositories/job-repository';
import { findOrCreateCompany } from '@/lib/repositories/company-repository';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import type { ParseResult } from '@/types';
import type { MatchedRejection, UnmatchedRejection } from './rejection-exporter';

export interface RejectionParseItem {
  company: string;
  title: string;
  rejection_reason: string;
}

const VALID_REASONS = ['resume', 'hr_screen', 'hm_interview', 'final_round', 'other'];

/**
 * Parse JSON text of rejection scan results from AI.
 */
export function parseRejectionResults(jsonText: string): ParseResult<RejectionParseItem> {
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

  const items: RejectionParseItem[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];

    if (!item.company || typeof item.company !== 'string') {
      warnings.push(`Item ${i + 1}: missing or invalid "company" field`);
      continue;
    }

    const reason = VALID_REASONS.includes(item.rejection_reason) ? item.rejection_reason : 'resume';

    items.push({
      company: item.company.trim(),
      title: (item.title || 'Unknown').trim(),
      rejection_reason: reason,
    });
  }

  return { items, warnings };
}

/**
 * Apply matched rejection results to the database.
 * Bypasses state machine validation — a rejection email is a fact.
 */
export function applyRejectionResults(
  items: MatchedRejection[],
): { updated: number; skipped: number; errors: string[] } {
  const db = getDb();
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  const run = db.transaction(() => {
    for (const item of items) {
      const job = findJobById(item.job_id);
      if (!job) {
        errors.push(`Job #${item.job_id} not found`);
        continue;
      }

      // Already rejected — skip
      if (job.status === 'rejected_resume') {
        skipped++;
        continue;
      }

      // Update notes with rejection reason
      const rejectionNote = `[${item.rejection_reason}] ${new Date().toISOString().split('T')[0]}`;
      const newNotes = job.notes ? `${job.notes}\n${rejectionNote}` : rejectionNote;

      updateJob(item.job_id, {
        status: 'rejected_resume',
        notes: newNotes,
      });

      logOperation({
        operation: 'status_change',
        entity_type: 'job',
        entity_id: item.job_id,
        trigger: 'import',
        details: {
          from: job.status,
          to: 'rejected_resume',
          reason: item.rejection_reason,
          source: 'rejection_email_scan',
        },
      });

      updated++;
    }
  });

  run();
  return { updated, skipped, errors };
}

/**
 * Create new jobs for unmatched rejections (jobs not in the system).
 */
export function createRejectedJobs(
  items: UnmatchedRejection[],
): { created: number; errors: string[] } {
  const db = getDb();
  let created = 0;
  const errors: string[] = [];

  const run = db.transaction(() => {
    for (const item of items) {
      try {
        const company = findOrCreateCompany(item.company);

        const rejectionNote = `[${item.rejection_reason}] ${new Date().toISOString().split('T')[0]}`;

        insertJob({
          company_id: company.id,
          title: item.title,
          location: [],
          source: 'rejection_email',
          status: 'rejected_resume',
          notes: rejectionNote,
        });

        created++;
      } catch (e) {
        errors.push(`Failed to create job "${item.title}" @ "${item.company}": ${(e as Error).message}`);
      }
    }
  });

  run();
  return { created, errors };
}
