import type { JobWithCompany } from '@/types';
import { cleanJdText } from '@/lib/jd-cleaner';

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
    '[{"id": 42, "score": 7, "score_success": 8, "score_reason": "PMO governance + AI/ML portfolio alignment. Company has strong H1B track record. Salary competitive.", "score_tags": ["strong_match"], "recommendation": "proceed", "h1b_sponsorship": "unknown"}]',
    '```',
    '',
    '**IMPORTANT: score_reason is REQUIRED.** Write 1-2 sentences explaining why you gave this score. Include key match/mismatch factors. Do NOT leave it empty.',
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
    '**score_success calibration — avoid systematic underscoring:**',
    '- TPM/PM is a transferable skill. Domain gap alone should NOT drop score_success below 4. Domain can be learned; cross-functional orchestration ability cannot.',
    '- If JD emphasizes cross-functional coordination, stakeholder management, delivery under ambiguity → candidate\'s CORE strengths, add +1-2 to score_success.',
    '- H1B: only penalize if JD explicitly says no sponsorship. If unknown (most cases), treat as neutral.',
    '- score_success 8-9: Direct skill + domain + level match',
    '- score_success 6-7: Good skill match, minor gap (domain or level)',
    '- score_success 4-5: Transferable skills, notable gap but realistic shot',
    '- score_success 1-3: Hard blockers (no visa, citizenship, physical construction) or fundamental mismatch',
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
    'Negative (indicate weaknesses):',
    '- **downpay**: Salary significantly below market/expectations',
    '- **down_level**: Role TITLE/LEVEL is clearly below candidate (e.g., Associate, Junior, Coordinator, L4/TPM II). Do NOT use for domain mismatch — use domain_gap instead.',
    '- **skill_gap**: Missing key required technical skills',
    '- **domain_gap**: No experience in the required industry/domain',
    '- **exp_gap**: Significantly under the years-of-experience requirement',
    '',
    'Positive (indicate strengths):',
    '- **strong_match**: Excellent alignment across skills, experience, and domain',
    '- **rare_opportunity**: Unusual/niche role worth pursuing even if not perfect match',
    '',
    'Risk (indicate caution):',
    '- **cooldown_risk**: Company has significant cooldown period; failure would block future applications',
    '- **overqualified**: Candidate clearly exceeds requirements',
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
    '## Calibration (score / score_success)',
    '- NVIDIA TPM AI Portfolio = 9/8 (direct AI/ML match)',
    '- OpenAI Security/Compliance TPM = 9/7 (compliance depth + frontier AI company)',
    '- Netflix TPM5 Cross-functional = 9/7 (top comp, cross-functional TPM)',
    '- Google AI PM = 8/6 (good brand but broad role, moderate domain gap)',
    '- HP Ads Monetization = 7/7 (candidate built the same pipeline at OPPO)',
    '- Crusoe Cloud Product TPM = 6/5 (good company, different TPM specialty)',
    '- NVIDIA Principal Infra = 3/1 (physical DC builds, hard blocker)',
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
      lines.push(cleanJdText(job.jd_full_text));
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
