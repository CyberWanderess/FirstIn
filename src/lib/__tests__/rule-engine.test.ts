import { describe, it, expect, vi } from 'vitest';

// Mock config before importing the module
vi.mock('@/lib/config', () => ({
  config: { enableChineseAffinity: false },
}));

import { evaluateJob } from '@/lib/rule-engine';
import type { FilterRule } from '@/types';

function makeRule(overrides: Partial<FilterRule> & Pick<FilterRule, 'field' | 'operator' | 'value' | 'action'>): FilterRule {
  return {
    id: 1,
    name: 'test rule',
    priority: 10,
    enabled: 1,
    created_at: '2025-01-01',
    ...overrides,
  };
}

const baseJob = {
  title: 'Senior TPM',
  company_name: 'Acme Corp',
  location: ['San Francisco, CA'],
  salary_min: 150000,
  salary_max: 200000,
  work_mode: 'hybrid',
  commitment: 'full-time',
  source: 'general',
  jd_full_text: 'Looking for a senior technical program manager',
};

describe('operators', () => {
  it('contains: case-insensitive substring match', () => {
    const rule = makeRule({ field: 'title', operator: 'contains', value: 'senior', action: 'flag' });
    expect(evaluateJob(baseJob, [rule]).action).toBe('flag');
  });

  it('contains: no match', () => {
    const rule = makeRule({ field: 'title', operator: 'contains', value: 'junior', action: 'exclude' });
    expect(evaluateJob(baseJob, [rule]).action).toBe('pass');
  });

  it('not_contains: matches when value absent', () => {
    const rule = makeRule({ field: 'title', operator: 'not_contains', value: 'junior', action: 'flag' });
    expect(evaluateJob(baseJob, [rule]).action).toBe('flag');
  });

  it('not_contains: no match when value present', () => {
    const rule = makeRule({ field: 'title', operator: 'not_contains', value: 'senior', action: 'exclude' });
    expect(evaluateJob(baseJob, [rule]).action).toBe('pass');
  });

  it('regex: valid pattern matches', () => {
    const rule = makeRule({ field: 'title', operator: 'regex', value: '^Senior\\s+TPM$', action: 'flag' });
    expect(evaluateJob(baseJob, [rule]).action).toBe('flag');
  });

  it('regex: invalid pattern returns false gracefully', () => {
    const rule = makeRule({ field: 'title', operator: 'regex', value: '[invalid', action: 'exclude' });
    expect(evaluateJob(baseJob, [rule]).action).toBe('pass');
  });

  it('gt: numeric comparison', () => {
    const rule = makeRule({ field: 'salary_min', operator: 'gt', value: '100000', action: 'flag' });
    expect(evaluateJob(baseJob, [rule]).action).toBe('flag');
  });

  it('lt: numeric comparison', () => {
    const rule = makeRule({ field: 'salary_max', operator: 'lt', value: '300000', action: 'flag' });
    expect(evaluateJob(baseJob, [rule]).action).toBe('flag');
  });

  it('eq: exact string match', () => {
    const rule = makeRule({ field: 'work_mode', operator: 'eq', value: 'hybrid', action: 'flag' });
    expect(evaluateJob(baseJob, [rule]).action).toBe('flag');
  });

  it('in: value in comma-separated list', () => {
    const rule = makeRule({ field: 'work_mode', operator: 'in', value: 'remote, hybrid, onsite', action: 'flag' });
    expect(evaluateJob(baseJob, [rule]).action).toBe('flag');
  });

  it('not_in: value not in list', () => {
    const rule = makeRule({ field: 'work_mode', operator: 'not_in', value: 'remote, onsite', action: 'flag' });
    expect(evaluateJob(baseJob, [rule]).action).toBe('flag');
  });

  it('any_in: array field matches list', () => {
    // location is ['San Francisco, CA'] — any_in splits rule value by comma and checks overlap
    const job = { ...baseJob, location: ['Remote', 'NYC'] };
    const rule = makeRule({ field: 'location', operator: 'any_in', value: 'NYC, Austin', action: 'flag' });
    expect(evaluateJob(job, [rule]).action).toBe('flag');
  });

  it('any_in: no overlap', () => {
    const rule = makeRule({ field: 'location', operator: 'any_in', value: 'Austin, TX', action: 'exclude' });
    expect(evaluateJob(baseJob, [rule]).action).toBe('pass');
  });
});

describe('null/undefined field handling', () => {
  it('returns pass when field is null', () => {
    const job = { ...baseJob, salary_min: null as any };
    const rule = makeRule({ field: 'salary_min', operator: 'gt', value: '100000', action: 'exclude' });
    expect(evaluateJob(job, [rule]).action).toBe('pass');
  });

  it('returns pass for unknown field', () => {
    const rule = makeRule({ field: 'nonexistent', operator: 'contains', value: 'test', action: 'exclude' });
    expect(evaluateJob(baseJob, [rule]).action).toBe('pass');
  });
});

describe('disabled rules', () => {
  it('ignores disabled rules', () => {
    const rule = makeRule({ field: 'title', operator: 'contains', value: 'senior', action: 'exclude', enabled: 0 });
    expect(evaluateJob(baseJob, [rule]).action).toBe('pass');
  });
});

describe('action resolution', () => {
  it('exclude takes effect', () => {
    const rule = makeRule({ field: 'title', operator: 'contains', value: 'TPM', action: 'exclude' });
    expect(evaluateJob(baseJob, [rule]).action).toBe('exclude');
  });

  it('include action', () => {
    const rule = makeRule({ field: 'title', operator: 'contains', value: 'TPM', action: 'include' });
    expect(evaluateJob(baseJob, [rule]).action).toBe('include');
  });

  it('protect suppresses lower-priority exclude', () => {
    const excludeRule = makeRule({ id: 2, field: 'source', operator: 'eq', value: 'general', action: 'exclude', priority: 5 });
    const protectRule = makeRule({ id: 3, field: 'title', operator: 'contains', value: 'TPM', action: 'protect', priority: 10 });
    const result = evaluateJob(baseJob, [excludeRule, protectRule]);
    // exclude at priority 5 is suppressed by protect at priority 10
    expect(result.action).not.toBe('exclude');
  });

  it('protect does NOT suppress higher-priority exclude', () => {
    const excludeRule = makeRule({ id: 2, field: 'source', operator: 'eq', value: 'general', action: 'exclude', priority: 20 });
    const protectRule = makeRule({ id: 3, field: 'title', operator: 'contains', value: 'TPM', action: 'protect', priority: 10 });
    const result = evaluateJob(baseJob, [excludeRule, protectRule]);
    expect(result.action).toBe('exclude');
  });
});

describe('company strategy', () => {
  it('no_h1b with auto_exclude → exclude', () => {
    const company = { application_strategy: 'no_h1b' as const, strategy_reason: 'No H1B', display_name: 'Acme', chinese_affinity: null };
    const result = evaluateJob(baseJob, [], company);
    expect(result.action).toBe('exclude');
    expect(result.reason).toContain('H1B');
  });

  it('no_h1b with flag option → flag', () => {
    const company = { application_strategy: 'no_h1b' as const, strategy_reason: null, display_name: 'Acme', chinese_affinity: null };
    const result = evaluateJob(baseJob, [], company, { noH1bAction: 'flag' });
    expect(result.action).toBe('flag');
  });

  it('blocked with auto_exclude → exclude', () => {
    const company = { application_strategy: 'blocked' as const, strategy_reason: 'Blocked', display_name: 'Acme', chinese_affinity: null };
    const result = evaluateJob(baseJob, [], company);
    expect(result.action).toBe('exclude');
  });

  it('cautious → flag', () => {
    const company = { application_strategy: 'cautious' as const, strategy_reason: null, display_name: 'Acme', chinese_affinity: null };
    const result = evaluateJob(baseJob, [], company);
    expect(result.action).toBe('flag');
  });
});

describe('job visa_sponsorship', () => {
  it('visa_sponsorship=no with auto_exclude → exclude', () => {
    const job = { ...baseJob, visa_sponsorship: 'no' };
    const result = evaluateJob(job, []);
    expect(result.action).toBe('exclude');
    expect(result.reason).toContain('visa');
  });

  it('visa_sponsorship=no with flag option → flag', () => {
    const job = { ...baseJob, visa_sponsorship: 'no' };
    const result = evaluateJob(job, [], undefined, { jobNoVisaAction: 'flag' });
    expect(result.action).toBe('flag');
  });

  it('visa_sponsorship=yes → no effect', () => {
    const job = { ...baseJob, visa_sponsorship: 'yes' };
    const result = evaluateJob(job, []);
    expect(result.action).toBe('pass');
  });
});
