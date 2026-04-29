/**
 * Match extracted rejections to existing jobs in the database.
 * Priority: match via confirmation emails first, then fall back to DB with time proximity.
 */

import type { JobWithCompany } from '@/types';
import type { ExtractedRejection, ExtractedConfirmation } from './extractor';

export interface MatchedMboxRejection {
  extraction: ExtractedRejection;
  jobId: number;
  jobTitle: string;
  jobCompany: string;
  jobStatus: string;
  confidence: 'high' | 'medium' | 'low';
  matchedVia?: 'confirmation' | 'db_direct';
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
 * When confirmations are available, uses them to improve match accuracy.
 */
export function matchRejections(
  rejections: ExtractedRejection[],
  jobs: JobWithCompany[],
  confirmations?: ExtractedConfirmation[],
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

    // Find matching confirmation for this rejection (same company, date before rejection)
    const confirmation = confirmations?.find(c =>
      fuzzyCompanyMatch(c.company, rej.company) &&
      (!c.confirmationDate || !rej.rejectionDate || c.confirmationDate <= rej.rejectionDate)
    );

    // Among company matches, try title match
    const titleMatches = companyMatches.filter(j => fuzzyTitleMatch(rej.role, j.title));

    // Also try matching confirmation's role if rejection role is unknown
    const effectiveTitleMatches = titleMatches.length > 0 ? titleMatches :
      (confirmation && confirmation.role !== 'Unknown'
        ? companyMatches.filter(j => fuzzyTitleMatch(confirmation.role, j.title))
        : []);

    if (effectiveTitleMatches.length > 0) {
      // Use confirmation date or rejection date for time proximity ranking
      const referenceDate = confirmation?.confirmationDate || rej.rejectionDate;
      const best = pickBestByTimeProximity(effectiveTitleMatches, referenceDate);
      matched.push({
        extraction: rej,
        jobId: best.id,
        jobTitle: best.title,
        jobCompany: best.company_display_name,
        jobStatus: best.status,
        confidence: 'high',
        matchedVia: confirmation ? 'confirmation' : 'db_direct',
      });
    } else if (companyMatches.length === 1) {
      // Only one job at this company — likely match
      const best = companyMatches[0];
      matched.push({
        extraction: rej,
        jobId: best.id,
        jobTitle: best.title,
        jobCompany: best.company_display_name,
        jobStatus: best.status,
        confidence: confirmation ? 'medium' : 'low',
        matchedVia: confirmation ? 'confirmation' : 'db_direct',
      });
    } else {
      // Multiple jobs, no title match — try time proximity if we have a date
      const referenceDate = confirmation?.confirmationDate || rej.rejectionDate;
      if (referenceDate) {
        const best = pickBestByTimeProximity(companyMatches, referenceDate);
        matched.push({
          extraction: rej,
          jobId: best.id,
          jobTitle: best.title,
          jobCompany: best.company_display_name,
          jobStatus: best.status,
          confidence: 'low',
          matchedVia: confirmation ? 'confirmation' : 'db_direct',
        });
      } else {
        unmatched.push({
          extraction: rej,
          candidateJobs: companyMatches.map(j => ({ id: j.id, title: j.title, company: j.company_display_name })),
        });
      }
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

/**
 * Pick the job with status_changed_at closest to the reference date.
 * Falls back to preferring 'applied' status then most recent.
 */
function pickBestByTimeProximity(jobs: JobWithCompany[], referenceDate: string): JobWithCompany {
  if (!referenceDate) {
    // No date — fall back to status preference + recency
    return jobs.sort((a, b) => {
      if (a.status === 'applied' && b.status !== 'applied') return -1;
      if (b.status === 'applied' && a.status !== 'applied') return 1;
      return (b.status_changed_at || b.updated_at).localeCompare(a.status_changed_at || a.updated_at);
    })[0];
  }

  const refTime = new Date(referenceDate).getTime();
  return jobs.sort((a, b) => {
    const aTime = new Date(a.status_changed_at || a.updated_at).getTime();
    const bTime = new Date(b.status_changed_at || b.updated_at).getTime();
    // Prefer jobs with status_changed_at before the reference date, closest first
    const aDiff = Math.abs(refTime - aTime);
    const bDiff = Math.abs(refTime - bTime);
    return aDiff - bDiff;
  })[0];
}
