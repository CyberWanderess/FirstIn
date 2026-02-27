import type { JobInsert, ParseResult } from '@/types';

/**
 * Parse text copied from hiring.cafe into JobInsert items.
 * Pure function, no database access.
 */
export function parseHiringCafeText(text: string, defaultCompany?: string): ParseResult<JobInsert> {
  const items: JobInsert[] = [];
  const warnings: string[] = [];

  // Split by double newlines or clear separators
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim());

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;

    try {
      const parsed = parseBlock(block, defaultCompany);
      if (parsed) {
        items.push(parsed);
      } else {
        warnings.push(`Block ${i + 1}: Could not parse — "${block.slice(0, 80)}..."`);
      }
    } catch (e) {
      warnings.push(`Block ${i + 1}: ${(e as Error).message}`);
    }
  }

  return { items, warnings };
}

function parseBlock(block: string, defaultCompany?: string): JobInsert | null {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  let title = '';
  let company = defaultCompany || '';
  let location: string[] = [];
  let salaryMin: number | null = null;
  let salaryMax: number | null = null;
  let workMode: string | null = null;
  let commitment: string | null = null;

  for (const line of lines) {
    // Try to detect company @ title or title @ company pattern
    const atMatch = line.match(/^(.+?)\s+[@|at]\s+(.+)$/i);
    if (atMatch && !title) {
      title = atMatch[1].trim();
      company = atMatch[2].trim();
      continue;
    }

    // Salary pattern: $X - $Y or $Xk-$Yk
    const salaryMatch = line.match(/\$?([\d,]+)\s*k?\s*[-–]\s*\$?([\d,]+)\s*k?/i);
    if (salaryMatch) {
      let min = parseInt(salaryMatch[1].replace(/,/g, ''), 10);
      let max = parseInt(salaryMatch[2].replace(/,/g, ''), 10);
      if (min < 1000) min *= 1000;
      if (max < 1000) max *= 1000;
      salaryMin = min;
      salaryMax = max;
      continue;
    }

    // Work mode
    if (/\bremote\b/i.test(line) && line.length < 40) {
      workMode = 'remote';
      // Also treat as location hint
      if (location.length === 0) location.push('Remote');
      continue;
    }
    if (/\bhybrid\b/i.test(line) && line.length < 40) { workMode = 'hybrid'; continue; }
    if (/\bon.?site\b/i.test(line) && line.length < 40) { workMode = 'onsite'; continue; }

    // Commitment
    if (/\bfull.?time\b/i.test(line) && line.length < 30) { commitment = 'Full Time'; continue; }
    if (/\bpart.?time\b/i.test(line) && line.length < 30) { commitment = 'Part Time'; continue; }
    if (/\bcontract\b/i.test(line) && line.length < 30) { commitment = 'Contract'; continue; }
    if (/\btemporary\b/i.test(line) && line.length < 30) { commitment = 'Temporary'; continue; }

    // Location: typically a line with city names
    if (/,/.test(line) && line.length < 100 && !title) {
      // Could be "City, State" or "City, State or City, State"
      location = parseLocationText(line);
      continue;
    }

    // If we don't have a title yet, first non-matched line is the title
    if (!title) {
      title = line;
      continue;
    }

    // If we have title but no company, next line might be company
    if (!company && line.length < 60) {
      company = line;
      continue;
    }

    // Remaining lines — try location
    if (location.length === 0 && line.length < 100) {
      location = parseLocationText(line);
    }
  }

  if (!title) return null;

  return {
    title,
    company_name: company || undefined,
    location: location.length > 0 ? location : ['Unknown'],
    salary_min: salaryMin,
    salary_max: salaryMax,
    work_mode: workMode,
    commitment: commitment,
    source: 'hiring_cafe_manual',
  };
}

function parseLocationText(text: string): string[] {
  return text
    .split(/\s+or\s+|;\s*/)
    .flatMap((part) => {
      // Keep "City, State" together but split on standalone commas between locations
      const trimmed = part.trim();
      if (!trimmed) return [];
      return [trimmed];
    })
    .filter(Boolean);
}
