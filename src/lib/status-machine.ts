import type { JobStatus } from '@/types';

const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  new:                    ['pending_eval', 'archived_filtered'],
  pending_eval:           ['pending_deep_analysis', 'ready_to_apply', 'archived_low_match', 'archived_filtered'],
  pending_deep_analysis:  ['ready_to_apply_tailored'],
  ready_to_apply_tailored: ['applied', 'archived_low_match'],
  ready_to_apply:         ['applied'],
  applied:                ['interviewing', 'rejected', 'archived_no_response'],
  interviewing:           ['offer', 'rejected'],
  offer:                  [],
  rejected:               [],
  archived_filtered:      ['pending_eval'],
  archived_low_match:     ['pending_eval'],
  archived_no_response:   [],
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
