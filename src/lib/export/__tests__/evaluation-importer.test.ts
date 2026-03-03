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
      { id: 1, score: 8, score_reason: 'Good match', recommendation: 'proceed', h1b_sponsorship: 'yes' },
      { id: 2, score: 3, score_reason: 'Poor match', recommendation: 'skip' },
    ]);
    const { items, warnings } = parseEvaluationResults(json);
    expect(items).toHaveLength(2);
    expect(warnings).toHaveLength(0);
    expect(items[0]).toMatchObject({ id: 1, score: 8, recommendation: 'proceed', h1b_sponsorship: 'yes' });
    expect(items[1]).toMatchObject({ id: 2, score: 3, recommendation: 'skip' });
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
      { id: 1, score: 0, score_reason: '', recommendation: 'proceed' },
      { id: 2, score: 11, score_reason: '', recommendation: 'proceed' },
      { id: 3, score: 'high', score_reason: '', recommendation: 'proceed' },
    ];
    const { items, warnings } = parseEvaluationResults(JSON.stringify(cases));
    expect(items).toHaveLength(0);
    expect(warnings).toHaveLength(3);
  });

  it('skips items with invalid recommendation', () => {
    const json = JSON.stringify([{ id: 1, score: 5, recommendation: 'maybe' }]);
    const { items, warnings } = parseEvaluationResults(json);
    expect(items).toHaveLength(0);
    expect(warnings[0]).toContain('recommendation');
  });

  it('normalizes h1b_sponsorship unknown → undefined', () => {
    const json = JSON.stringify([
      { id: 1, score: 5, score_reason: '', recommendation: 'proceed', h1b_sponsorship: 'unknown' },
    ]);
    const { items } = parseEvaluationResults(json);
    expect(items[0].h1b_sponsorship).toBeUndefined();
  });

  it('preserves h1b_sponsorship yes/no', () => {
    const json = JSON.stringify([
      { id: 1, score: 5, score_reason: '', recommendation: 'proceed', h1b_sponsorship: 'yes' },
      { id: 2, score: 5, score_reason: '', recommendation: 'proceed', h1b_sponsorship: 'no' },
    ]);
    const { items } = parseEvaluationResults(json);
    expect(items[0].h1b_sponsorship).toBe('yes');
    expect(items[1].h1b_sponsorship).toBe('no');
  });

  it('filters invalid score_tags', () => {
    const json = JSON.stringify([
      { id: 1, score: 5, score_reason: '', recommendation: 'proceed', score_tags: ['strong_match', 'invalid_tag', 123] },
    ]);
    const { items } = parseEvaluationResults(json);
    expect(items[0].score_tags).toEqual(['strong_match']);
  });

  it('omits score_tags when all invalid', () => {
    const json = JSON.stringify([
      { id: 1, score: 5, score_reason: '', recommendation: 'proceed', score_tags: ['fake_tag'] },
    ]);
    const { items } = parseEvaluationResults(json);
    expect(items[0].score_tags).toBeUndefined();
  });

  it('omits score_tags when not an array', () => {
    const json = JSON.stringify([
      { id: 1, score: 5, score_reason: '', recommendation: 'proceed', score_tags: 'strong_match' },
    ]);
    const { items } = parseEvaluationResults(json);
    expect(items[0].score_tags).toBeUndefined();
  });

  it('defaults missing score_reason to empty string', () => {
    const json = JSON.stringify([
      { id: 1, score: 5, recommendation: 'proceed' },
    ]);
    const { items } = parseEvaluationResults(json);
    expect(items[0].score_reason).toBe('');
  });

  it('accepts all four recommendation values', () => {
    const recs = ['proceed', 'mass_apply', 'skip', 'flag'];
    const data = recs.map((r, i) => ({ id: i + 1, score: 5, score_reason: '', recommendation: r }));
    const { items, warnings } = parseEvaluationResults(JSON.stringify(data));
    expect(items).toHaveLength(4);
    expect(warnings).toHaveLength(0);
  });
});
