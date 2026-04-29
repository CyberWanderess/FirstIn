import type { Company } from '@/types';
import { config } from '@/lib/config';

/**
 * Default company-research instructions. The `{{json_example}}` and
 * `{{chinese_affinity_field}}` placeholders are substituted at render time
 * based on feature flags.
 */
export const DEFAULT_COMPANY_RESEARCH_INSTRUCTIONS = `## Instructions
For each company below, **use web search** to find the most up-to-date information and return a JSON array with these fields.
H1B sponsorship, company size, funding round, and application policies change frequently — prioritize recent sources (within the last 6 months) over older data.

JSON schema:
\`\`\`json
{{json_example}}
\`\`\`

Fields:
- **industry**: Primary industry (e.g., "Social Media", "Cloud Infrastructure", "Fintech")
- **size**: Specific employee count range. Do NOT use vague "10,000+" for all large companies — differentiate clearly (e.g., "30,000+", "80,000+", "150,000+", "700,000+"). Use ranges like "50-200", "500-1,000", "2,000-3,000" for smaller companies.
- **description**: 1-2 sentence description of main business/products
- **sponsors_h1b**: H1B sponsorship status. **Search the web** for "[company name] H1B sponsorship" and check h1bdata.info or similar databases. ONLY mark \`false\` when there is an explicit, current policy declaration ("we do not sponsor H1B / visas") OR the employer is structurally barred (US federal/state government entity, defense contractor with clearance-only roles). **Absence of H1B filing history is NOT evidence of \`false\`** — small/young/private companies often have legitimate sponsorship capacity but no public filings yet, especially funded Series A-D startups. In that case use \`null\`. Mark \`true\` whenever there is any positive evidence (recent H1B filings, public sponsorship statement, or a careers page that mentions visa support). Err strongly on the side of \`null\` over \`false\` — a false negative auto-locks the candidate out of real opportunities.{{chinese_affinity_field}}
- **name**: Use the exact company name as listed below — do not canonicalize or rename.
- **application_limit**: Maximum number of applications allowed within the rolling window. Search Glassdoor, Blind, and career forums for reports like "you can only apply to N roles". Use \`null\` if no limit is known.
- **limit_period_months**: The rolling window (in months) for the application_limit. E.g., Google is 3 per 1 month → limit=3, period=1. OpenAI is 5 per 6 months → limit=5, period=6. Default 12 (yearly) if limit exists but period is unknown. Use \`null\` if no application_limit.
- **cooldown_months**: How many months you must wait after a failed interview before re-applying. Search for "reapply after rejection", "interview cooldown period" on Glassdoor/Blind. Use \`0\` if the company explicitly has no cooldown, \`null\` if unknown. Common values: 6, 12.
- **funding_round**: For startups/private companies, the latest funding round (e.g., "Seed", "Series A", "Series B", ..., "Late Stage"). Use "Public" for publicly traded companies, "Subsidiary" for wholly-owned subsidiaries, "Acquired" if recently acquired. Use \`null\` for large established public companies where this is not relevant.
- **ai_summary**: Balanced assessment of company culture, growth, reputation, and any risks or concerns. Include both positives and negatives where relevant.`;

export interface CompanyResearchPromptConfig {
  instructions?: string;
}

/**
 * Export companies needing research in markdown or JSON format.
 */
export function exportCompaniesForResearch(
  companies: Company[],
  format: 'markdown' | 'json',
  cfg?: CompanyResearchPromptConfig,
): string {
  if (format === 'json') {
    return JSON.stringify(companies.map((c) => c.display_name), null, 2);
  }

  const date = new Date().toISOString().split('T')[0];
  const jsonExample = config.enableChineseAffinity
    ? '[{"name": "CompanyName", "industry": "...", "size": "...", "description": "...", "sponsors_h1b": true/false/null, "chinese_affinity": true/null, "application_limit": 3, "limit_period_months": 12, "cooldown_months": 6, "funding_round": "Series B", "ai_summary": "..."}]'
    : '[{"name": "CompanyName", "industry": "...", "size": "...", "description": "...", "sponsors_h1b": true/false/null, "application_limit": 3, "limit_period_months": 12, "cooldown_months": 6, "funding_round": "Series B", "ai_summary": "..."}]';

  const chineseAffinityField = config.enableChineseAffinity
    ? '\n- **chinese_affinity**: true if the company is Chinese-owned/founded, has a predominantly Chinese-speaking workforce, or is widely known for a large Chinese employee community. Only mark `true` with clear evidence. Use `null` if unknown or not applicable.'
    : '';

  const instructions = (cfg?.instructions || DEFAULT_COMPANY_RESEARCH_INSTRUCTIONS)
    .replace(/\{\{json_example\}\}/g, jsonExample)
    .replace(/\{\{chinese_affinity_field\}\}/g, chineseAffinityField);

  const lines: string[] = [
    `# Company Research Batch - ${date}`,
    '',
    ...instructions.split('\n'),
    '',
    '---',
    '',
  ];

  companies.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.display_name}`);
  });

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('IMPORTANT: Return ONLY the JSON array. No explanation, no markdown code fences, no other text.');

  return lines.join('\n');
}
