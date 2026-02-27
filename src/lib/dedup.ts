import { createHash } from 'crypto';
import type { Job, JobInsert, DedupResult } from '@/types';

/**
 * Pure function: checks if a candidate job is a duplicate of any existing job.
 * Three-layer dedup: exact match → fuzzy title → content hash.
 */
export function checkDuplicate(
  candidate: JobInsert & { company_id: number },
  existingJobs: Job[],
): DedupResult {
  // Layer 1: Exact match — same company + normalized title
  const candidateTitle = normalizeTitle(candidate.title);
  for (const job of existingJobs) {
    if (job.company_id === candidate.company_id && normalizeTitle(job.title) === candidateTitle) {
      return { isDuplicate: true, matchType: 'exact', matchedJobId: job.id };
    }
  }

  // Layer 2: Fuzzy match — same company + high title similarity
  const sameCompanyJobs = existingJobs.filter((j) => j.company_id === candidate.company_id);
  for (const job of sameCompanyJobs) {
    const similarity = trigramSimilarity(candidateTitle, normalizeTitle(job.title));
    if (similarity > 0.85) {
      return { isDuplicate: true, matchType: 'fuzzy', matchedJobId: job.id };
    }
  }

  // Layer 3: Content hash — same JD full text hash
  if (candidate.jd_full_text) {
    const candidateHash = hashContent(candidate.jd_full_text);
    for (const job of existingJobs) {
      if (job.jd_content_hash && job.jd_content_hash === candidateHash) {
        return { isDuplicate: true, matchType: 'content', matchedJobId: job.id };
      }
    }
  }

  return { isDuplicate: false, matchType: null };
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function hashContent(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex');
}

/**
 * Trigram similarity: fraction of trigrams shared between two strings.
 * Returns 0..1 where 1 = identical.
 */
function trigramSimilarity(a: string, b: string): number {
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
