import { createHash } from 'crypto';
import type { Job, JobInsert, DedupResult } from '@/types';

/**
 * Pure function: checks if a candidate job is a duplicate of any existing job.
 *
 * Strategy differs based on whether source_id is available:
 *
 * WITH source_id (e.g., linkedin, hiring_cafe):
 *   1. Same source + same source_id → definite duplicate
 *   2. Same company + content hash match (same or cross source) → same job, merge locations
 *   3. Otherwise → NOT duplicate (different source_id + different JD = genuinely different job)
 *
 * WITHOUT source_id (e.g., manual entry):
 *   1. Content hash match
 *   2. Title exact match (same company)
 *   3. Title fuzzy match (same company, trigram > 0.85)
 */
export function checkDuplicate(
  candidate: JobInsert & { company_id: number },
  existingJobs: Job[],
): DedupResult {
  const hasCandidateSourceId = !!(candidate.source_id && candidate.source);

  // === Path A: Candidate has source_id ===
  if (hasCandidateSourceId) {
    // Step 1: Same source + same source_id → definite match
    for (const job of existingJobs) {
      if (job.source === candidate.source && job.source_id === candidate.source_id) {
        return { isDuplicate: true, matchType: 'source_id', matchedJobId: job.id };
      }
    }

    // Step 2: Content hash match — same JD = same job (even across sources or different source_ids)
    // Handles: LinkedIn multi-location postings, cross-platform same job
    if (candidate.jd_full_text) {
      const candidateHash = hashContent(candidate.jd_full_text);
      const sameCompanyJobs = existingJobs.filter(j => j.company_id === candidate.company_id);
      for (const job of sameCompanyJobs) {
        if (job.jd_content_hash && job.jd_content_hash === candidateHash) {
          // Compute new locations to merge
          const candidateLocs = candidate.location || [];
          const existingLocs = job.location || [];
          const existingSet = new Set(existingLocs.map(l => l.toLowerCase().trim()));
          const newLocs = candidateLocs.filter(l => !existingSet.has(l.toLowerCase().trim()));
          return {
            isDuplicate: true,
            matchType: 'content',
            matchedJobId: job.id,
            mergeLocations: newLocs.length > 0 ? [...existingLocs, ...newLocs] : undefined,
          };
        }
      }
    }

    // Step 2b: Normalized JD text similarity (cross-source or same-source multi-location)
    // Handles: hiring.cafe ↔ LinkedIn where JD formatting differs but content is the same
    if (candidate.jd_full_text) {
      const candidateTitle = normalizeTitle(candidate.title);
      const candidateJd = normalizeJdText(candidate.jd_full_text);
      const sameCompanyJobs = existingJobs.filter(j => j.company_id === candidate.company_id);

      for (const job of sameCompanyJobs) {
        if (!job.jd_full_text) continue;
        // Require title match to avoid false positives (same company, different role, similar JD boilerplate)
        if (normalizeTitle(job.title) !== candidateTitle) continue;

        const similarity = trigramSimilarity(candidateJd, normalizeJdText(job.jd_full_text));
        if (similarity > 0.7) {
          const candidateLocs = candidate.location || [];
          const existingLocs = job.location || [];
          const existingSet = new Set(existingLocs.map(l => l.toLowerCase().trim()));
          const newLocs = candidateLocs.filter(l => !existingSet.has(l.toLowerCase().trim()));
          return {
            isDuplicate: true,
            matchType: 'content',
            matchedJobId: job.id,
            mergeLocations: newLocs.length > 0 ? [...existingLocs, ...newLocs] : undefined,
          };
        }
      }
    }

    // Step 3: Different source_id + different JD = genuinely different job
    return { isDuplicate: false, matchType: null };
  }

  // === Path B: Candidate has NO source_id (manual entry, legacy import) ===
  const candidateTitle = normalizeTitle(candidate.title);
  const sameCompanyJobs = existingJobs.filter(j => j.company_id === candidate.company_id);

  // Content hash
  if (candidate.jd_full_text) {
    const candidateHash = hashContent(candidate.jd_full_text);
    for (const job of sameCompanyJobs) {
      if (job.jd_content_hash && job.jd_content_hash === candidateHash) {
        return { isDuplicate: true, matchType: 'content', matchedJobId: job.id };
      }
    }
  }

  // Exact title match
  for (const job of sameCompanyJobs) {
    if (normalizeTitle(job.title) === candidateTitle) {
      return { isDuplicate: true, matchType: 'exact', matchedJobId: job.id };
    }
  }

  // Fuzzy title match
  for (const job of sameCompanyJobs) {
    const similarity = trigramSimilarity(candidateTitle, normalizeTitle(job.title));
    if (similarity > 0.85) {
      return { isDuplicate: true, matchType: 'fuzzy', matchedJobId: job.id };
    }
  }

  return { isDuplicate: false, matchType: null };
}

export function normalizeTitle(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Normalize JD text for similarity comparison: strip formatting differences */
export function normalizeJdText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hashContent(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex');
}

/**
 * Trigram similarity: fraction of trigrams shared between two strings.
 * Returns 0..1 where 1 = identical.
 */
export function trigramSimilarity(a: string, b: string): number {
  const triA = trigrams(a);
  const triB = trigrams(b);
  if (triA.size === 0 && triB.size === 0) return 1;
  if (triA.size === 0 || triB.size === 0) return 0;

  let intersection = 0;
  for (const t of triA) {
    if (triB.has(t)) intersection++;
  }

  const union = triA.size + triB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const result = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    result.add(padded.slice(i, i + 3));
  }
  return result;
}
