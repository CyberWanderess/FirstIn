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
    '- **proceed**: Good match, worth pursuing (typically score >= 7)',
    '- **skip**: Poor match, archive (typically score < 7)',
    '- **flag**: Uncertain, needs manual review',
    '',
    'H1B Sponsorship: Based on the JD text, assess whether this role offers visa/H1B sponsorship.',
    '- **"yes"**: JD explicitly mentions sponsorship is available',
    '- **"no"**: JD explicitly says no sponsorship, or requires US citizenship/authorization without sponsorship',
    '- **"unknown"**: JD does not mention visa/sponsorship (most common)',
    '',
    '---',
    '',
  ];

  for (const job of jobs) {
    lines.push(`### Job #${job.id}: ${job.title} @ ${job.company_display_name}`);
    lines.push('');
    lines.push('**Company Context:**');
    lines.push(`- Industry: ${job.application_strategy !== undefined ? '' : ''}${getCompanyInfo(job)}`);
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

function getCompanyInfo(job: JobWithCompany): string {
  // Company info comes from the company join, but we only have strategy fields in JobWithCompany
  return `Strategy: ${job.application_strategy}`;
}

function formatSalary(min: number | null, max: number | null): string {
  if (min && max) return `$${min.toLocaleString()} - $${max.toLocaleString()}`;
  if (min) return `$${min.toLocaleString()}+`;
  if (max) return `Up to $${max.toLocaleString()}`;
  return 'Not specified';
}
