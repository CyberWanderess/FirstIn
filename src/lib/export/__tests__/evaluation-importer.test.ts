import { describe, it, expect, vi } from 'vitest';

// Mock DB-dependent modules to avoid DATABASE_PATH requirement
vi.mock('@/lib/db', () => ({ getDb: vi.fn() }));
vi.mock('@/lib/repositories/job-repository', () => ({ findJobById: vi.fn(), updateJob: vi.fn() }));
vi.mock('@/lib/repositories/operation-log-repository', () => ({ logOperation: vi.fn() }));
vi.mock('@/lib/status-machine', () => ({ validateTransition: vi.fn() }));

import { parseEvaluationResults } from '@/lib/export/evaluation-importer';

describe('parseEvaluationResults', () => {
  it('parses valid items', () => {
    const json = JSON.stringify([
      { id: 1, score: 8, score_success: 8, score_reason: 'Good match', recommendation: 'proceed', h1b_sponsorship: 'yes' },
      { id: 2, score: 3, score_success: 2, score_reason: 'Poor match', recommendation: 'skip' },
    ]);
    const { items, warnings } = parseEvaluationResults(json);
    expect(items).toHaveLength(2);
    expect(warnings).toHaveLength(0);
    expect(items[0]).toMatchObject({ id: 1, score: 8, score_success: 8, recommendation: 'proceed', h1b_sponsorship: 'yes' });
    expect(items[1]).toMatchObject({ id: 2, score: 3, score_success: 2, recommendation: 'skip' });
  });

  it('returns warning for invalid JSON', () => {
    const { items, warnings } = parseEvaluationResults('not json');
    expect(items).toHaveLength(0);
    expect(warnings).toContain('Invalid JSON format');
  });

  it('returns warning for non-array', () => {
    const { items, warnings } = parseEvaluationResults('{"id": 1}');
    expect(items).toHaveLength(0);
    expect(warnings).toContain('Expected a JSON array');
  });

  it('skips items with missing id', () => {
    const json = JSON.stringify([{ score: 5, recommendation: 'proceed' }]);
    const { items, warnings } = parseEvaluationResults(json);
    expect(items).toHaveLength(0);
    expect(warnings[0]).toContain('missing or invalid "id"');
  });

  it('skips items with invalid score', () => {
    const cases = [
      { id: 1, score: 0, score_success: 5, score_reason: '', recommendation: 'proceed' },
      { id: 2, score: 11, score_success: 5, score_reason: '', recommendation: 'proceed' },
      { id: 3, score: 'high', score_success: 5, score_reason: '', recommendation: 'proceed' },
    ];
    const { items, warnings } = parseEvaluationResults(JSON.stringify(cases));
    expect(items).toHaveLength(0);
    expect(warnings).toHaveLength(3);
  });

  it('skips items with invalid score_success', () => {
    const cases = [
      { id: 1, score: 5, score_success: 0, score_reason: '', recommendation: 'proceed' },
      { id: 2, score: 5, score_success: 11, score_reason: '', recommendation: 'proceed' },
      { id: 3, score: 5, score_success: 'high', score_reason: '', recommendation: 'proceed' },
    ];
    const { items, warnings } = parseEvaluationResults(JSON.stringify(cases));
    expect(items).toHaveLength(0);
    expect(warnings).toHaveLength(3);
  });

  it('skips items with invalid recommendation', () => {
    const json = JSON.stringify([{ id: 1, score: 5, score_success: 5, recommendation: 'maybe' }]);
    const { items, warnings } = parseEvaluationResults(json);
    expect(items).toHaveLength(0);
    expect(warnings[0]).toContain('recommendation');
  });

  it('normalizes h1b_sponsorship unknown → undefined', () => {
    const json = JSON.stringify([
      { id: 1, score: 5, score_success: 5, score_reason: '', recommendation: 'proceed', h1b_sponsorship: 'unknown' },
    ]);
    const { items } = parseEvaluationResults(json);
    expect(items[0].h1b_sponsorship).toBeUndefined();
  });

  it('preserves h1b_sponsorship yes/no', () => {
    const json = JSON.stringify([
      { id: 1, score: 5, score_success: 5, score_reason: '', recommendation: 'proceed', h1b_sponsorship: 'yes' },
      { id: 2, score: 5, score_success: 5, score_reason: '', recommendation: 'proceed', h1b_sponsorship: 'no' },
    ]);
    const { items } = parseEvaluationResults(json);
    expect(items[0].h1b_sponsorship).toBe('yes');
    expect(items[1].h1b_sponsorship).toBe('no');
  });

  it('filters invalid score_tags', () => {
    const json = JSON.stringify([
      { id: 1, score: 5, score_success: 5, score_reason: '', recommendation: 'proceed', score_tags: ['strong_match', 'invalid_tag', 123] },
    ]);
    const { items } = parseEvaluationResults(json);
    expect(items[0].score_tags).toEqual(['strong_match']);
  });

  it('omits score_tags when all invalid', () => {
    const json = JSON.stringify([
      { id: 1, score: 5, score_success: 5, score_reason: '', recommendation: 'proceed', score_tags: ['fake_tag'] },
    ]);
    const { items } = parseEvaluationResults(json);
    expect(items[0].score_tags).toBeUndefined();
  });

  it('omits score_tags when not an array', () => {
    const json = JSON.stringify([
      { id: 1, score: 5, score_success: 5, score_reason: '', recommendation: 'proceed', score_tags: 'strong_match' },
    ]);
    const { items } = parseEvaluationResults(json);
    expect(items[0].score_tags).toBeUndefined();
  });

  it('uses fallback and warns when score_reason is missing', () => {
    const json = JSON.stringify([
      { id: 1, score: 5, score_success: 5, recommendation: 'mass_apply' },
    ]);
    const { items, warnings } = parseEvaluationResults(json);
    expect(items[0].score_reason).toBe('(no reason provided)');
    expect(warnings.some(w => w.includes('missing score_reason'))).toBe(true);
  });

  it('accepts all four recommendation values', () => {
    const data = [
      { id: 1, score: 5, score_success: 8, score_reason: 'r1', recommendation: 'proceed' },
      { id: 2, score: 5, score_success: 5, score_reason: 'r2', recommendation: 'mass_apply' },
      { id: 3, score: 5, score_success: 2, score_reason: 'r3', recommendation: 'skip' },
      { id: 4, score: 5, score_success: 5, score_reason: 'r4', recommendation: 'flag' },
    ];
    const { items, warnings } = parseEvaluationResults(JSON.stringify(data));
    expect(items).toHaveLength(4);
    expect(warnings).toHaveLength(0);
  });

  it('auto-corrects recommendation based on score_success', () => {
    const json = JSON.stringify([
      { id: 1, score: 7, score_success: 8, score_reason: 'Good', recommendation: 'skip' },
      { id: 2, score: 3, score_success: 2, score_reason: 'Bad', recommendation: 'proceed' },
      { id: 3, score: 5, score_success: 5, score_reason: 'Mid', recommendation: 'skip' },
    ]);
    const { items, warnings } = parseEvaluationResults(json);
    expect(items[0].recommendation).toBe('proceed');
    expect(items[1].recommendation).toBe('skip');
    expect(items[2].recommendation).toBe('mass_apply');
    expect(warnings.filter(w => w.includes('auto-corrected'))).toHaveLength(3);
  });

  it('preserves flag recommendation regardless of score_success', () => {
    const json = JSON.stringify([
      { id: 1, score: 8, score_success: 9, score_reason: 'Uncertain', recommendation: 'flag' },
    ]);
    const { items, warnings } = parseEvaluationResults(json);
    expect(items[0].recommendation).toBe('flag');
    expect(warnings.filter(w => w.includes('auto-corrected'))).toHaveLength(0);
  });
});
