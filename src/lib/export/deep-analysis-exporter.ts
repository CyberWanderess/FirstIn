import type { JobWithCompany } from '@/types';

export function exportJobsForDeepAnalysis(
  jobs: JobWithCompany[],
  format: 'markdown' | 'json',
  resumeText?: string,
): string {
  if (format === 'json') {
    return JSON.stringify(jobs.map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company_display_name,
      score: j.score,
      score_reason: j.score_reason,
      location: j.location,
      salary_min: j.salary_min,
      salary_max: j.salary_max,
      jd_full_text: j.jd_full_text,
    })), null, 2);
  }

  const date = new Date().toISOString().split('T')[0];
  const lines: string[] = [
    `# Deep Analysis Batch - ${date}`,
    '',
  ];

  if (resumeText) {
    lines.push('## Candidate Resume');
    lines.push('');
    lines.push(resumeText);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push(
    '## Instructions',
    'For each job below, perform a deep analysis comparing the candidate\'s resume against the JD.',
    'Return a JSON array:',
    '```json',
    '[{',
    '  "id": 42,',
    '  "strengths": ["Strength 1", "Strength 2"],',
    '  "concerns": ["Concern 1", "Concern 2"],',
    '  "jd_mapping": {"requirement from JD": "how candidate matches or gaps", ...},',
    '  "recommendation": "proceed|skip",',
    '  "analysis_summary": "1-2 sentence overall assessment"',
    '}]',
    '```',
    '',
    'Fields:',
    '- **strengths**: Key reasons the candidate is a good fit for this role',
    '- **concerns**: Gaps, risks, or areas where the candidate may fall short',
    '- **jd_mapping**: Map each key JD requirement to the candidate\'s relevant experience or gap',
    '- **recommendation**: "proceed" to move forward with tailored application, "mass_apply" for volume/practice applications, "skip" to archive',
    '- **analysis_summary**: Brief overall assessment of fit',
    '',
    '---',
    '',
  );

  for (const job of jobs) {
    lines.push(`### Job #${job.id}: ${job.title} @ ${job.company_display_name}`);
    lines.push('');
    lines.push(`**Initial Eval:** Score ${job.score ?? '--'}/10 — ${job.score_reason || 'No reason provided'}`);
    lines.push('');
    lines.push('**Company Context:**');
    lines.push(`- Industry: ${job.company_industry || 'Unknown'} | Size: ${job.company_size || 'Unknown'}`);
    if (job.company_description) {
      lines.push(`- Description: ${job.company_description}`);
    }
    lines.push(`- Application Limit: ${job.application_limit != null ? `${job.application_limit}/year` : 'Unknown'} | Cooldown: ${job.cooldown_months != null ? (job.cooldown_months === 0 ? 'None' : `${job.cooldown_months} months`) : 'Unknown'}`);
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
