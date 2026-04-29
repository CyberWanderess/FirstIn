import type { JobStatus } from '@/types';

const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  pending_eval:           ['pending_deep_analysis', 'ready_to_apply', 'flagged', 'archived_low_match', 'archived_filtered', 'archived_manual'],
  flagged:                ['pending_deep_analysis', 'ready_to_apply', 'archived_low_match', 'archived_manual'],
  pending_deep_analysis:  ['ready_to_apply_tailored', 'applied', 'archived_manual'],
  ready_to_apply_tailored: ['applied', 'archived_low_match', 'archived_manual'],
  ready_to_apply:         ['pending_deep_analysis', 'applied', 'archived_low_match', 'archived_manual'],
  applied:                ['interviewing', 'rejected_resume', 'archived_no_response', 'archived_manual'],
  interviewing:           ['offer', 'rejected_resume'],
  offer:                  [],
  rejected_resume:        [],
  archived_filtered:      ['pending_eval'],
  archived_low_match:     ['pending_eval'],
  archived_no_response:   [],
  archived_manual:        ['pending_eval'],
};

export function validateTransition(
  from: JobStatus,
  to: JobStatus,
): { valid: boolean; reason?: string } {
  const allowed = TRANSITIONS[from];
  if (!allowed) {
    return { valid: false, reason: `Unknown status: ${from}` };
  }
  if (!allowed.includes(to)) {
    return { valid: false, reason: `Cannot transition from '${from}' to '${to}'. Allowed: ${allowed.join(', ') || 'none'}` };
  }
  return { valid: true };
}

export function getAllowedTransitions(status: JobStatus): JobStatus[] {
  return TRANSITIONS[status] || [];
}
