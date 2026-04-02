import type { JobWithCompany } from '@/types';

/**
 * Get the fixed prompt for AI to scan email for rejection letters.
 */
export function getRejectionScanPrompt(days: number): string {
  return [
    `Scan my inbox for all rejection emails received in the last ${days} days.`,
    '',
    'Common rejection indicators:',
    '- "We regret to inform you..."',
    '- "After careful consideration..."',
    '- "We have decided to move forward with other candidates..."',
    '- "Unfortunately, we will not be proceeding..."',
    '- "Thank you for your interest, but..."',
    '- "We appreciate your application, however..."',
    '',
    '**Return a JSON array**, one object per rejection:',
    '```json',
    '[',
    '  {',
    '    "company": "Example Corp",',
    '    "title": "Software Engineer",',
    '    "rejection_reason": "简历拒"',
    '  }',
    ']',
    '```',
    '',
    '**Fields:**',
    '- `company`: Company name from the rejection email (required)',
    '- `title`: Job title rejected for (required, extract from email if possible, otherwise "Unknown")',
    '- `rejection_reason`: Stage at which the rejection happened. Pick one:',
    '  - `"resume"` — Resume screening rejection (most common, use if unsure)',
    '  - `"hr_screen"` — Rejected after HR phone screen',
    '  - `"hm_interview"` — Rejected after Hiring Manager interview',
    '  - `"final_round"` — Rejected after final/onsite round',
    '  - `"other"` — Other reason',
    '',
    'If no rejections found, return an empty array: `[]`',
  ].join('\n');
}

/**
 * Normalize company name for matching: lowercase, trim, remove common suffixes.
 */
function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/,?\s*(inc\.?|corp\.?|corporation|ltd\.?|llc|co\.?|company|technologies|technology|tech|group|holdings|services|solutions)$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two strings are a fuzzy match (one contains the other, or high overlap).
 */
function fuzzyMatch(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return false;
  // Exact match after normalization
  if (na === nb) return true;
  // One contains the other
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

export interface RejectionInput {
  company: string;
  title: string;
  rejection_reason: string;
}

export interface MatchedRejection extends RejectionInput {
  job_id: number;
  job_title: string;
  job_company: string;
  job_status: string;
}

export interface UnmatchedRejection extends RejectionInput {}

/**
 * Match rejection items against existing jobs in the database.
 * Uses fuzzy matching on company name + title.
 */
export function matchRejectionsToJobs(
  rejections: RejectionInput[],
  jobs: JobWithCompany[],
): { matched: MatchedRejection[]; unmatched: UnmatchedRejection[] } {
  const matched: MatchedRejection[] = [];
  const unmatched: UnmatchedRejection[] = [];

  for (const rej of rejections) {
    // Find candidate jobs by company name
    const companyMatches = jobs.filter((j) => fuzzyMatch(rej.company, j.company_display_name));

    if (companyMatches.length === 0) {
      unmatched.push(rej);
      continue;
    }

    // Among company matches, try to match title
    const titleMatches = companyMatches.filter((j) => fuzzyMatch(rej.title, j.title));

    if (titleMatches.length > 0) {
      // Pick the most recent one (by status_changed_at)
      const best = titleMatches.sort((a, b) =>
        (b.status_changed_at || b.updated_at).localeCompare(a.status_changed_at || a.updated_at)
      )[0];
      matched.push({
        ...rej,
        job_id: best.id,
        job_title: best.title,
        job_company: best.company_display_name,
        job_status: best.status,
      });
    } else if (companyMatches.length === 1) {
      // Only one job at this company, likely a match even if title differs
      const best = companyMatches[0];
      matched.push({
        ...rej,
        job_id: best.id,
        job_title: best.title,
        job_company: best.company_display_name,
        job_status: best.status,
      });
    } else {
      // Multiple jobs at same company but no title match — ambiguous
      unmatched.push(rej);
    }
  }

  return { matched, unmatched };
}
