import type { JobWithCompany } from '@/types';

/**
 * Export jobs for evaluation, including company context.
 */
export function exportJobsForEvaluation(jobs: JobWithCompany[], format: 'markdown' | 'json'): string {
  if (format === 'json') {
    return JSON.stringify(jobs.map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company_display_name,
      location: j.location,
      salary_min: j.salary_min,
      salary_max: j.salary_max,
    })), null, 2);
  }

  const date = new Date().toISOString().split('T')[0];
  const lines: string[] = [
    `# Job Evaluation Batch - ${date}`,
    '',
    '## Instructions',
    'For each job, evaluate fit and return a JSON array:',
    '```json',
    '[{"id": 42, "score": 8, "score_reason": "Strong match because...", "recommendation": "proceed", "h1b_sponsorship": "unknown"}]',
    '```',
    '',
    'Scoring: 1-10 scale. Recommendations:',
    '- **proceed**: Good match, worth pursuing with a tailored application (typically score >= 7)',
    '- **mass_apply**: Worth applying for practice or volume. Use when: the role is clearly down-level but the company has no cooldown risk (cooldown_months = 0 or unknown), OR it\'s a small company where applying carries little risk, OR the position is rare/interesting enough to try even without a perfect match. Typical score: 4-6.',
    '- **skip**: Poor match, archive (typically score < 4)',
    '- **flag**: Uncertain, needs manual review',
    '',
    'H1B Sponsorship: Based on the JD text, assess whether this role offers visa/H1B sponsorship.',
    '- **"yes"**: JD explicitly mentions sponsorship is available',
    '- **"no"**: JD explicitly says no sponsorship, or requires US citizenship/authorization without sponsorship',
    '- **"unknown"**: JD does not mention visa/sponsorship (most common)',
    '',
    '## Years of Experience Guidance',
    '- YoE requirements are flexible guidelines, not hard cutoffs.',
    '- Being 1-3 years short of the stated requirement is usually fine — do NOT heavily penalize this.',
    '- Example: A role requiring 12 years is worth considering with 9 years of strong experience.',
    '- Example: A role requiring 3 years is perfectly fine for someone with 9 years (not "overqualified" — use mass_apply if the role is clearly down-level).',
    '- Consider the company\'s cooldown risk when borderline:',
    '  - If cooldown_months is 0 or unknown (null): low risk to try, be more lenient.',
    '  - If cooldown_months > 6: only recommend proceed if the match is genuinely strong.',
    '- Small companies and rare/niche positions: be more lenient, as these opportunities are harder to come by.',
    '',
    '---',
    '',
  ];

  for (const job of jobs) {
    lines.push(`### Job #${job.id}: ${job.title} @ ${job.company_display_name}`);
    lines.push('');
    lines.push('**Company Context:**');
    lines.push(`- Industry: ${job.company_industry || 'Unknown'}`);
    lines.push(`- Size: ${job.company_size || 'Unknown'}`);
    if (job.company_description) {
      lines.push(`- Description: ${job.company_description}`);
    }
    if (job.company_ai_summary) {
      lines.push(`- AI Summary: ${job.company_ai_summary}`);
    }
    lines.push(`- Application Limit: ${job.application_limit != null ? `${job.application_limit}/year` : 'Unknown'}`);
    lines.push(`- Cooldown: ${job.cooldown_months != null ? (job.cooldown_months === 0 ? 'None' : `${job.cooldown_months} months`) : 'Unknown'}`);
    lines.push(`- Strategy: ${job.application_strategy}${job.strategy_reason ? ` (${job.strategy_reason})` : ''}`);
    lines.push('');
    lines.push('**Job Details:**');
    lines.push(`- Location: ${job.location.join(', ') || 'Not specified'}`);
    lines.push(`- Salary: ${formatSalary(job.salary_min, job.salary_max)}`);
    lines.push(`- Work Mode: ${job.work_mode || 'Not specified'} | Commitment: ${job.commitment || 'Not specified'}`);
    lines.push('');

    if (job.apply_url) {
      lines.push(`**Apply URL:** ${job.apply_url}`);
    }

    if (job.jd_full_text) {
      lines.push('**Full Job Description:**');
      lines.push(job.jd_full_text);
    } else {
      lines.push('**Full Job Description:** Not available');
      if (job.jd_url) lines.push(`JD URL: ${job.jd_url}`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function formatSalary(min: number | null, max: number | null): string {
  if (min && max) return `$${min.toLocaleString()} - $${max.toLocaleString()}`;
  if (min) return `$${min.toLocaleString()}+`;
  if (max) return `Up to $${max.toLocaleString()}`;
  return 'Not specified';
}
