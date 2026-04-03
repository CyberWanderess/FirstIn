import { describe, it, expect } from 'vitest';
import { validateTransition, getAllowedTransitions } from '@/lib/status-machine';

describe('validateTransition', () => {
  const validCases: [string, string][] = [
    ['pending_eval', 'pending_deep_analysis'],
    ['pending_eval', 'ready_to_apply'],
    ['pending_eval', 'archived_low_match'],
    ['pending_eval', 'archived_filtered'],
    ['pending_eval', 'archived_manual'],
    ['pending_deep_analysis', 'ready_to_apply_tailored'],
    ['pending_deep_analysis', 'applied'],
    ['pending_deep_analysis', 'archived_manual'],
    ['ready_to_apply_tailored', 'applied'],
    ['ready_to_apply_tailored', 'archived_low_match'],
    ['ready_to_apply_tailored', 'archived_manual'],
    ['ready_to_apply', 'applied'],
    ['ready_to_apply', 'archived_manual'],
    ['applied', 'interviewing'],
    ['applied', 'rejected'],
    ['applied', 'archived_no_response'],
    ['applied', 'archived_manual'],
    ['interviewing', 'offer'],
    ['interviewing', 'rejected'],
    ['archived_filtered', 'pending_eval'],
    ['archived_low_match', 'pending_eval'],
    ['archived_manual', 'pending_eval'],
  ];

  it.each(validCases)('%s → %s is valid', (from, to) => {
    const result = validateTransition(from as any, to as any);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  const invalidCases: [string, string][] = [
    ['pending_eval', 'applied'],
    ['interviewing', 'applied'],
    ['ready_to_apply', 'pending_eval'],
  ];

  it.each(invalidCases)('%s → %s is invalid', (from, to) => {
    const result = validateTransition(from as any, to as any);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('terminal states have no outgoing transitions', () => {
    for (const status of ['offer', 'rejected', 'archived_no_response']) {
      const result = validateTransition(status as any, 'pending_eval' as any);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('none');
    }
  });

  it('unknown status returns invalid', () => {
    const result = validateTransition('nonexistent' as any, 'pending_eval' as any);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unknown status');
  });
});

describe('getAllowedTransitions', () => {
  it('returns correct transitions for pending_eval', () => {
    expect(getAllowedTransitions('pending_eval')).toEqual([
      'pending_deep_analysis', 'ready_to_apply', 'flagged', 'archived_low_match', 'archived_filtered', 'archived_manual',
    ]);
  });

  it('returns empty for terminal states', () => {
    expect(getAllowedTransitions('offer')).toEqual([]);
    expect(getAllowedTransitions('rejected')).toEqual([]);
    expect(getAllowedTransitions('archived_no_response')).toEqual([]);
  });

  it('returns empty for unknown status', () => {
    expect(getAllowedTransitions('bogus' as any)).toEqual([]);
  });
});
