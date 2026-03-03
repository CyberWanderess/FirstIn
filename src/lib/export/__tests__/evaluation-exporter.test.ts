import { describe, it, expect } from 'vitest';
import { exportJobsForEvaluation } from '@/lib/export/evaluation-exporter';
import type { JobWithCompany } from '@/types';

function makeJob(overrides: Partial<JobWithCompany> = {}): JobWithCompany {
  return {
    id: 1,
    company_id: 1,
    title: 'Senior TPM',
    location: ['San Francisco, CA'],
    salary_min: 150000,
    salary_max: 200000,
    work_mode: 'hybrid',
    commitment: 'full-time',
    jd_url: 'https://example.com/jd',
    apply_url: 'https://example.com/apply',
    jd_full_text: 'Full job description here',
    jd_fetch_status: 'success',
    jd_content_hash: null,
    source: 'general',
    source_id: null,
    status: 'pending_eval',
    score: null,
    score_reason: null,
    deep_analysis: null,
    visa_sponsorship: null,
    score_tags: null,
    notes: null,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    status_changed_at: '2025-01-01',
    company_name: 'acme',
    company_display_name: 'Acme Corp',
    company_industry: 'Tech',
    company_size: '1000+',
    company_description: 'A tech company',
    company_ai_summary: 'Leading tech firm',
    application_strategy: 'open',
    strategy_reason: null,
    application_limit: 3,
    cooldown_months: 6,
    chinese_affinity: null,
    ...overrides,
  };
}

describe('exportJobsForEvaluation', () => {
  describe('JSON format', () => {
    it('exports basic fields', () => {
      const job = makeJob();
      const result = JSON.parse(exportJobsForEvaluation([job], 'json'));
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 1,
        title: 'Senior TPM',
        company: 'Acme Corp',
        location: ['San Francisco, CA'],
        salary_min: 150000,
        salary_max: 200000,
      });
    });

    it('handles empty array', () => {
      expect(JSON.parse(exportJobsForEvaluation([], 'json'))).toEqual([]);
    });
  });

  describe('markdown format', () => {
    it('includes job header', () => {
      const md = exportJobsForEvaluation([makeJob()], 'markdown');
      expect(md).toContain('### Job #1: Senior TPM @ Acme Corp');
    });

    it('includes company context', () => {
      const md = exportJobsForEvaluation([makeJob()], 'markdown');
      expect(md).toContain('Industry: Tech');
      expect(md).toContain('Size: 1000+');
      expect(md).toContain('AI Summary: Leading tech firm');
      expect(md).toContain('Cooldown: 6 months');
      expect(md).toContain('Application Limit: 3/year');
    });

    it('handles missing company fields', () => {
      const job = makeJob({ company_industry: null, company_size: null, company_description: null, company_ai_summary: null });
      const md = exportJobsForEvaluation([job], 'markdown');
      expect(md).toContain('Industry: Unknown');
      expect(md).toContain('Size: Unknown');
      expect(md).not.toContain('- Description:');
      expect(md).not.toContain('- AI Summary:');
    });

    it('formats salary with both min and max', () => {
      const md = exportJobsForEvaluation([makeJob({ salary_min: 100000, salary_max: 200000 })], 'markdown');
      expect(md).toContain('$100,000 - $200,000');
    });

    it('formats salary with only min', () => {
      const md = exportJobsForEvaluation([makeJob({ salary_min: 100000, salary_max: null })], 'markdown');
      expect(md).toContain('$100,000+');
    });

    it('formats salary with only max', () => {
      const md = exportJobsForEvaluation([makeJob({ salary_min: null, salary_max: 200000 })], 'markdown');
      expect(md).toContain('Up to $200,000');
    });

    it('shows Not specified when no salary', () => {
      const md = exportJobsForEvaluation([makeJob({ salary_min: null, salary_max: null })], 'markdown');
      expect(md).toContain('Salary: Not specified');
    });

    it('shows cooldown None when 0', () => {
      const md = exportJobsForEvaluation([makeJob({ cooldown_months: 0 })], 'markdown');
      expect(md).toContain('Cooldown: None');
    });

    it('shows cooldown Unknown when null', () => {
      const md = exportJobsForEvaluation([makeJob({ cooldown_months: null })], 'markdown');
      expect(md).toContain('Cooldown: Unknown');
    });

    it('includes JD text when available', () => {
      const md = exportJobsForEvaluation([makeJob()], 'markdown');
      expect(md).toContain('Full job description here');
    });

    it('shows JD URL fallback when no text', () => {
      const job = makeJob({ jd_full_text: null });
      const md = exportJobsForEvaluation([job], 'markdown');
      expect(md).toContain('Not available');
      expect(md).toContain('JD URL: https://example.com/jd');
    });

    it('includes score tag taxonomy', () => {
      const md = exportJobsForEvaluation([makeJob()], 'markdown');
      expect(md).toContain('## Score Tags');
      expect(md).toContain('downpay');
      expect(md).toContain('strong_match');
      expect(md).toContain('cooldown_risk');
    });

    it('includes instructions header', () => {
      const md = exportJobsForEvaluation([makeJob()], 'markdown');
      expect(md).toContain('## Instructions');
      expect(md).toContain('proceed');
      expect(md).toContain('mass_apply');
    });
  });
});
