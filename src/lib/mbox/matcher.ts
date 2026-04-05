/**
 * Match extracted rejections to existing jobs in the database.
 * Uses the existing rejection-exporter matching logic as foundation.
 */

import type { JobWithCompany } from '@/types';
import type { ExtractedRejection } from './extractor';

export interface MatchedMboxRejection {
  extraction: ExtractedRejection;
  jobId: number;
  jobTitle: string;
  jobCompany: string;
  jobStatus: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface UnmatchedMboxRejection {
  extraction: ExtractedRejection;
  candidateJobs?: { id: number; title: string; company: string }[];
}

export interface MatchResult {
  matched: MatchedMboxRejection[];
  unmatched: UnmatchedMboxRejection[];
  summary: {
    totalRejections: number;
    matched: number;
    unmatched: number;
  };
}

/**
 * Match extracted rejections against jobs in the database.
 */
export function matchRejections(
  rejections: ExtractedRejection[],
  jobs: JobWithCompany[],
): MatchResult {
  const matched: MatchedMboxRejection[] = [];
  const unmatched: UnmatchedMboxRejection[] = [];

  for (const rej of rejections) {
    // Find jobs by company name (fuzzy)
    const companyMatches = jobs.filter(j => fuzzyCompanyMatch(rej.company, j.company_display_name));

    if (companyMatches.length === 0) {
      unmatched.push({ extraction: rej });
      continue;
    }

    // Among company matches, try title match
    const titleMatches = companyMatches.filter(j => fuzzyTitleMatch(rej.role, j.title));

    if (titleMatches.length > 0) {
      const best = pickBest(titleMatches);
      matched.push({
        extraction: rej,
        jobId: best.id,
        jobTitle: best.title,
        jobCompany: best.company_display_name,
        jobStatus: best.status,
        confidence: 'high',
      });
    } else if (companyMatches.length === 1 && rej.role === 'Unknown') {
      // Only one job at this company and we don't know the role — likely match
      const best = companyMatches[0];
      matched.push({
        extraction: rej,
        jobId: best.id,
        jobTitle: best.title,
        jobCompany: best.company_display_name,
        jobStatus: best.status,
        confidence: 'low',
      });
    } else {
      // Multiple jobs, no title match — ambiguous
      unmatched.push({
        extraction: rej,
        candidateJobs: companyMatches.map(j => ({ id: j.id, title: j.title, company: j.company_display_name })),
      });
    }
  }

  return {
    matched,
    unmatched,
    summary: {
      totalRejections: rejections.length,
      matched: matched.length,
      unmatched: unmatched.length,
    },
  };
}

/**
 * Normalize company name for comparison.
 */
function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/,?\s*(inc\.?|corp\.?|corporation|ltd\.?|llc|co\.?|company|technologies|technology|tech|group|holdings|services|solutions)$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyCompanyMatch(a: string, b: string): boolean {
  const na = normalizeCompany(a);
  const nb = normalizeCompany(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

/**
 * Fuzzy title match using token overlap.
 */
function fuzzyTitleMatch(rejTitle: string, jobTitle: string): boolean {
  if (rejTitle === 'Unknown') return false;

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const na = normalize(rejTitle);
  const nb = normalize(jobTitle);

  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  // Token overlap: at least 50% of tokens match
  const tokensA = new Set(na.split(/\s+/).filter(t => t.length > 2));
  const tokensB = new Set(nb.split(/\s+/).filter(t => t.length > 2));
  if (tokensA.size === 0 || tokensB.size === 0) return false;

  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }

  const minSize = Math.min(tokensA.size, tokensB.size);
  return overlap / minSize >= 0.5;
}

function pickBest(jobs: JobWithCompany[]): JobWithCompany {
  // Prefer applied > other statuses, then most recent
  return jobs.sort((a, b) => {
    if (a.status === 'applied' && b.status !== 'applied') return -1;
    if (b.status === 'applied' && a.status !== 'applied') return 1;
    return (b.status_changed_at || b.updated_at).localeCompare(a.status_changed_at || a.updated_at);
  })[0];
}
