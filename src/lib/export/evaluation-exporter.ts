import type { JobWithCompany } from '@/types';
import { cleanJdText } from '@/lib/jd-cleaner';
import {
  DEFAULT_SCORING_GUIDANCE,
  DEFAULT_CALIBRATION_EXAMPLES,
  DEFAULT_SCORE_TAGS,
  DEFAULT_CANDIDATE_PROFILE,
} from './evaluation-defaults';

export interface EvalPromptConfig {
  scoringGuidance?: string;
  calibrationExamples?: string;
  scoreTags?: string;
}

/**
 * Export jobs for evaluation, including company context.
 */
export function exportJobsForEvaluation(jobs: JobWithCompany[], format: 'markdown' | 'json', config?: EvalPromptConfig): string {
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
    '[{"id": 42, "score": 7, "score_success": 8, "score_reason": "PMO governance + AI/ML portfolio alignment. Company has strong H1B track record. Salary competitive.", "score_tags": ["strong_match"], "recommendation": "proceed", "h1b_sponsorship": "unknown"}]',
    '```',
    '',
    '**IMPORTANT: score_reason is REQUIRED.** Write 1-2 sentences explaining why you gave this score. Include key match/mismatch factors. Do NOT leave it empty.',
    '',
    'Before scoring, identify each job\'s actual daily work and must-have skills (not nice-to-haves or boilerplate). Score based on daily work fit, not surface keywords.',
    '',
    '## Dual Scoring (1-10 scale)',
    '',
    '**score** (Attractiveness): How appealing the job is to the candidate.',
    '- Salary and total compensation',
    '- Company brand, reputation, and growth trajectory',
    '- Growth potential and career development',
    '- Tech stack interest and engineering culture',
    '',
    '**score_success** (Success Rate): Probability of getting hired.',
    '- Skill match: JD requirements vs candidate\'s actual skills',
    '- YoE match: JD years requirement vs actual experience',
    '- H1B/visa friendliness: company sponsor history, JD mentions',
    '',
    ...(config?.scoringGuidance || DEFAULT_SCORING_GUIDANCE).split('\n'),
    '',
    '## Recommendations (auto-derived from score_success)',
    'Recommendation is automatically determined by score_success. You may still provide it but it will be overridden:',
    '- **proceed**: score_success >= 7',
    '- **mass_apply**: score_success 4-6',
    '- **skip**: score_success < 4',
    '- **flag**: Use ONLY when genuinely uncertain and need manual review (will not be auto-overridden)',
    '',
    'H1B Sponsorship: Based on the JD text, assess whether this role offers visa/H1B sponsorship.',
    '- **"yes"**: JD explicitly mentions sponsorship is available',
    '- **"no"**: JD explicitly says no sponsorship, or requires US citizenship/authorization without sponsorship',
    '- **"unknown"**: JD does not mention visa/sponsorship (most common)',
    '',
    '## Score Tags',
    'Classify each job with 1-3 tags from the following taxonomy. Pick the most relevant.',
    '',
    ...(config?.scoreTags || DEFAULT_SCORE_TAGS).split('\n'),
    '',
    '## Years of Experience Guidance',
    '- YoE requirements are flexible guidelines, not hard cutoffs.',
    '- Being 1-3 years short of the stated requirement is usually fine — do NOT heavily penalize this.',
    '- Example: A role requiring 10+ years is worth considering with 7 years of strong experience.',
    '- Example: A role requiring 3 years is perfectly fine for someone with more experience (not "overqualified" — use mass_apply if the role is clearly down-level).',
    '- Consider the company\'s cooldown risk when borderline:',
    '  - If cooldown_months is 0 or unknown (null): low risk to try, be more lenient.',
    '  - If cooldown_months > 6: only recommend proceed if the match is genuinely strong.',
    '- Small companies and rare/niche positions: be more lenient, as these opportunities are harder to come by.',
    '',
    ...(config?.calibrationExamples || DEFAULT_CALIBRATION_EXAMPLES).split('\n'),
    '',
    ...(DEFAULT_CANDIDATE_PROFILE).split('\n'),
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
    lines.push(`- Funding Round: ${job.funding_round || 'Unknown'}`);
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
      // Use pre-cleaned JD if available (Haiku cleanup), otherwise fall back to HTML-cleaned version
      lines.push((job as any).jd_cleaned_text || cleanJdText(job.jd_full_text));
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
