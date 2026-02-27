import type { Company } from '@/types';

/**
 * Export companies needing research in markdown or JSON format.
 */
export function exportCompaniesForResearch(companies: Company[], format: 'markdown' | 'json'): string {
  if (format === 'json') {
    return JSON.stringify(companies.map((c) => c.display_name), null, 2);
  }

  const date = new Date().toISOString().split('T')[0];
  const lines: string[] = [
    `# Company Research Batch - ${date}`,
    '',
    '## Instructions',
    'For each company below, research and return a JSON array with these fields:',
    '```json',
    '[{"name": "CompanyName", "industry": "...", "size": "...", "description": "...", "sponsors_h1b": true/false/null, "chinese_affinity": true/null, "ai_summary": "..."}]',
    '```',
    '',
    'Fields:',
    '- **industry**: Primary industry (e.g., "Social Media", "Cloud Infrastructure", "Fintech")',
    '- **size**: Specific employee count range. Do NOT use vague "10,000+" for all large companies — differentiate clearly (e.g., "30,000+", "80,000+", "150,000+", "700,000+"). Use ranges like "50-200", "500-1,000", "2,000-3,000" for smaller companies.',
    '- **description**: 1-2 sentence description of main business/products',
    '- **sponsors_h1b**: H1B sponsorship status. IMPORTANT: Only mark `false` if there is strong concrete evidence the company does not sponsor (e.g., explicit policy statement, government entity that cannot sponsor). If you are unsure or cannot find clear evidence, use `null`. Err on the side of `null` over `false` — a false negative here means the candidate misses a real opportunity.',
    '- **chinese_affinity**: true if the company is Chinese-owned/founded, has a predominantly Chinese-speaking workforce, or is widely known for a large Chinese employee community. Only mark `true` with clear evidence. Use `null` if unknown or not applicable.',
    '- **ai_summary**: Balanced assessment of company culture, growth, reputation, and any risks or concerns. Include both positives and negatives where relevant.',
    '',
    '---',
    '',
  ];

  companies.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.display_name}`);
  });

  return lines.join('\n');
}
