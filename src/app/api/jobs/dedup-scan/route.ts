import { NextResponse } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { listJobs } from '@/lib/repositories/job-repository';
import { normalizeTitle, normalizeJdText, trigramSimilarity } from '@/lib/dedup';
import type { JobWithCompany } from '@/types';

export const dynamic = 'force-dynamic';

interface DedupPair {
  jobA: JobWithCompany;
  jobB: JobWithCompany;
  matchType: 'exact_title' | 'fuzzy_title' | 'content_hash' | 'jd_similarity';
  similarity: number;
}

export async function GET() {
  ensureInitialized();

  // Fetch all non-archived jobs
  const { jobs } = listJobs({
    limit: 10000,
    offset: 0,
    excludeExpired: false,
  });

  const activeJobs = jobs.filter(j => !j.status.startsWith('archived'));

  // Group by company
  const byCompany = new Map<number, JobWithCompany[]>();
  for (const job of activeJobs) {
    const group = byCompany.get(job.company_id) || [];
    group.push(job);
    byCompany.set(job.company_id, group);
  }

  const pairs: DedupPair[] = [];
  const seen = new Set<string>(); // "id1-id2" to avoid duplicate pairs

  for (const companyJobs of byCompany.values()) {
    if (companyJobs.length < 2) continue;

    for (let i = 0; i < companyJobs.length; i++) {
      for (let j = i + 1; j < companyJobs.length; j++) {
        const a = companyJobs[i];
        const b = companyJobs[j];
        const pairKey = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
        if (seen.has(pairKey)) continue;

        const match = findMatch(a, b);
        if (match) {
          seen.add(pairKey);
          pairs.push({ jobA: a, jobB: b, ...match });
        }
      }
    }
  }

  // Sort by similarity descending
  pairs.sort((a, b) => b.similarity - a.similarity);

  return NextResponse.json({ success: true, data: { pairs, total: pairs.length } });
}

function findMatch(
  a: JobWithCompany,
  b: JobWithCompany,
): { matchType: DedupPair['matchType']; similarity: number } | null {
  const titleA = normalizeTitle(a.title);
  const titleB = normalizeTitle(b.title);

  // Content hash match
  if (a.jd_content_hash && b.jd_content_hash && a.jd_content_hash === b.jd_content_hash) {
    return { matchType: 'content_hash', similarity: 1.0 };
  }

  // Exact title match
  if (titleA === titleB) {
    return { matchType: 'exact_title', similarity: 1.0 };
  }

  // Fuzzy title match
  const titleSim = trigramSimilarity(titleA, titleB);
  if (titleSim > 0.85) {
    return { matchType: 'fuzzy_title', similarity: titleSim };
  }

  // JD text similarity (requires title to be somewhat similar)
  if (a.jd_full_text && b.jd_full_text && titleSim > 0.7) {
    const jdSim = trigramSimilarity(normalizeJdText(a.jd_full_text), normalizeJdText(b.jd_full_text));
    if (jdSim > 0.7) {
      return { matchType: 'jd_similarity', similarity: jdSim };
    }
  }

  return null;
}
