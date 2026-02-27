import type { Company } from '@/types';
import { config } from '@/lib/config';

/**
 * Export companies needing research in markdown or JSON format.
 */
export function exportCompaniesForResearch(companies: Company[], format: 'markdown' | 'json'): string {
  if (format === 'json') {
    return JSON.stringify(companies.map((c) => c.display_name), null, 2);
  }

  const date = new Date().toISOString().split('T')[0];
  const jsonExample = config.enableChineseAffinity
    ? '[{"name": "CompanyName", "industry": "...", "size": "...", "description": "...", "sponsors_h1b": true/false/null, "chinese_affinity": true/null, "application_limit": 3, "cooldown_months": 6, "ai_summary": "..."}]'
    : '[{"name": "CompanyName", "industry": "...", "size": "...", "description": "...", "sponsors_h1b": true/false/null, "application_limit": 3, "cooldown_months": 6, "ai_summary": "..."}]';

  const lines: string[] = [
    `# Company Research Batch - ${date}`,
    '',
    '## Instructions',
    'For each company below, research and return a JSON array with these fields:',
    '```json',
    jsonExample,
    '```',
    '',
    'Fields:',
    '- **industry**: Primary industry (e.g., "Social Media", "Cloud Infrastructure", "Fintech")',
    '- **size**: Specific employee count range. Do NOT use vague "10,000+" for all large companies — differentiate clearly (e.g., "30,000+", "80,000+", "150,000+", "700,000+"). Use ranges like "50-200", "500-1,000", "2,000-3,000" for smaller companies.',
    '- **description**: 1-2 sentence description of main business/products',
    '- **sponsors_h1b**: H1B sponsorship status. IMPORTANT: Only mark `false` if there is strong concrete evidence the company does not sponsor (e.g., explicit policy statement, government entity that cannot sponsor). If you are unsure or cannot find clear evidence, use `null`. Err on the side of `null` over `false` — a false negative here means the candidate misses a real opportunity.',
  ];
  if (config.enableChineseAffinity) {
    lines.push('- **chinese_affinity**: true if the company is Chinese-owned/founded, has a predominantly Chinese-speaking workforce, or is widely known for a large Chinese employee community. Only mark `true` with clear evidence. Use `null` if unknown or not applicable.');
  }
  lines.push(
    '- **application_limit**: Maximum number of applications allowed per year across all positions. Search Glassdoor, Blind, and career forums for reports like "you can only apply to N roles per year" or "application cooldown". Use `null` if no limit is known or if the company allows unlimited applications.',
    '- **cooldown_months**: How many months you must wait after a failed interview before re-applying. Search for "reapply after rejection", "interview cooldown period" on Glassdoor/Blind. Use `0` if the company explicitly has no cooldown, `null` if unknown. Common values: 6, 12.',
    '- **ai_summary**: Balanced assessment of company culture, growth, reputation, and any risks or concerns. Include both positives and negatives where relevant.',
    '',
    '---',
    '',
  );

  companies.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.display_name}`);
  });

  return lines.join('\n');
}
