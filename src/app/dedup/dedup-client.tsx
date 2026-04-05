'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/status-badge';

interface JobSummary {
  id: number;
  title: string;
  company_display_name: string;
  location: string[];
  source: string;
  status: string;
  salary_min: number | null;
  salary_max: number | null;
  jd_full_text: string | null;
  created_at: string;
}

interface DedupPair {
  jobA: JobSummary;
  jobB: JobSummary;
  matchType: string;
  similarity: number;
}

const MATCH_LABELS: Record<string, string> = {
  exact_title: 'Exact Title',
  fuzzy_title: 'Fuzzy Title',
  content_hash: 'Same JD',
  jd_similarity: 'Similar JD',
};

/** Pick the better job as primary: prefer the one with more info */
function pickPrimary(a: JobSummary, b: JobSummary): { primaryId: number; secondaryId: number } {
  function infoScore(j: JobSummary): number {
    let s = 0;
    if (j.jd_full_text) s += 10;
    if (j.salary_min || j.salary_max) s += 5;
    s += j.location.length;
    return s;
  }
  const scoreA = infoScore(a);
  const scoreB = infoScore(b);
  if (scoreA >= scoreB) return { primaryId: a.id, secondaryId: b.id };
  return { primaryId: b.id, secondaryId: a.id };
}

const AUTO_MERGE_THRESHOLD = 0.95;

// ── Sentence diff helpers ──

/** Split text into sentences for comparison. Handles both multi-line and single-line JDs. */
function splitSentences(text: string): string[] {
  // First split by newlines to preserve paragraph structure
  const paragraphs = text.split(/\n+/).filter(p => p.trim());
  const sentences: string[] = [];
  for (const para of paragraphs) {
    // Split long paragraphs into sentences (at . ! ? followed by space or end)
    const parts = para.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    if (parts.length > 1) {
      sentences.push(...parts);
    } else {
      sentences.push(para);
    }
  }
  return sentences;
}

/** Mark each sentence as same/different by building a Set of the other side's sentences */
function markSentences(own: string[], otherSet: Set<string>): { text: string; same: boolean }[] {
  return own.map(s => ({ text: s, same: otherSet.has(s) }));
}

function formatSalary(min: number | null, max: number | null): string {
  if (min && max) return `$${(min / 1000).toFixed(0)}k - $${(max / 1000).toFixed(0)}k`;
  if (min) return `$${(min / 1000).toFixed(0)}k+`;
  if (max) return `up to $${(max / 1000).toFixed(0)}k`;
  return '--';
}

/** Check if two values differ */
function isDiff(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

// ── Main component ──

export function DedupClient() {
  const [pairs, setPairs] = useState<DedupPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null);
  const [autoMerging, setAutoMerging] = useState(false);
  const [expandedJd, setExpandedJd] = useState<string | null>(null); // "idA-idB"

  useEffect(() => {
    fetch('/api/jobs/dedup-scan')
      .then(r => r.json())
      .then(res => {
        if (res.success) setPairs(res.data.pairs);
        else setError(res.error);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleMerge(primaryId: number, secondaryId: number) {
    const key = `${primaryId}-${secondaryId}`;
    setMerging(key);
    try {
      const res = await fetch('/api/jobs/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryId, secondaryId }),
      });
      const data = await res.json();
      if (data.success) {
        setPairs(prev => prev.filter(p =>
          p.jobA.id !== secondaryId && p.jobB.id !== secondaryId
        ));
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMerging(null);
    }
  }

  const autoMergePairs = pairs.filter(p => p.similarity >= AUTO_MERGE_THRESHOLD);

  async function handleAutoMerge() {
    if (autoMergePairs.length === 0) return;
    setAutoMerging(true);
    setError(null);
    let merged = 0;
    const failedIds = new Set<number>();
    for (const pair of autoMergePairs) {
      if (failedIds.has(pair.jobA.id) || failedIds.has(pair.jobB.id)) continue;
      const { primaryId, secondaryId } = pickPrimary(pair.jobA, pair.jobB);
      try {
        const res = await fetch('/api/jobs/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ primaryId, secondaryId }),
        });
        const data = await res.json();
        if (data.success) {
          merged++;
          setPairs(prev => prev.filter(p =>
            p.jobA.id !== secondaryId && p.jobB.id !== secondaryId
          ));
        } else {
          failedIds.add(pair.jobA.id);
          failedIds.add(pair.jobB.id);
        }
      } catch {
        failedIds.add(pair.jobA.id);
        failedIds.add(pair.jobB.id);
      }
    }
    setAutoMerging(false);
    if (failedIds.size > 0) {
      setError(`Auto-merged ${merged}, ${failedIds.size / 2} failed`);
    }
  }

  function handleDismiss(jobAId: number, jobBId: number) {
    setPairs(prev => prev.filter(p =>
      !(p.jobA.id === jobAId && p.jobB.id === jobBId)
    ));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold text-zinc-900">Dedup Scanner</h1>
        <div className="text-sm text-zinc-500">Scanning for duplicates...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-zinc-900">Dedup Scanner</h1>
        <div className="flex items-center gap-3">
          {autoMergePairs.length > 0 && (
            <button
              onClick={handleAutoMerge}
              disabled={autoMerging}
              className="px-3 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {autoMerging ? 'Merging...' : `Auto Merge ${autoMergePairs.length} (≥${(AUTO_MERGE_THRESHOLD * 100).toFixed(0)}%)`}
            </button>
          )}
          <span className="text-sm text-zinc-500">
            {pairs.length} duplicate{pairs.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {pairs.length === 0 && !error && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center text-sm text-green-800">
          No duplicates found. Database is clean!
        </div>
      )}

      <div className="space-y-3">
        {pairs.map((pair, idx) => {
          const mergeKey = `${pair.jobA.id}-${pair.jobB.id}`;
          const isMerging = merging === mergeKey || merging === `${pair.jobB.id}-${pair.jobA.id}`;
          const jdKey = `${pair.jobA.id}-${pair.jobB.id}`;
          const jdExpanded = expandedJd === jdKey;
          const jdIdentical = pair.matchType === 'content_hash' ||
            (pair.jobA.jd_full_text && pair.jobB.jd_full_text && pair.jobA.jd_full_text === pair.jobB.jd_full_text);

          return (
            <div key={idx} className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
              {/* Header */}
              <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-zinc-900">
                    {pair.jobA.company_display_name}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    pair.similarity >= 0.95
                      ? 'bg-red-100 text-red-700'
                      : pair.similarity >= 0.85
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-zinc-100 text-zinc-600'
                  }`}>
                    {MATCH_LABELS[pair.matchType] || pair.matchType} {(pair.similarity * 100).toFixed(0)}%
                  </span>
                </div>
                <button
                  onClick={() => handleDismiss(pair.jobA.id, pair.jobB.id)}
                  className="text-xs text-zinc-400 hover:text-zinc-600"
                >
                  Not Duplicate
                </button>
              </div>

              {/* Side-by-side field comparison */}
              <div className="grid grid-cols-2 divide-x divide-zinc-200">
                <FieldCompareCard
                  job={pair.jobA}
                  other={pair.jobB}
                  label="A"
                  onMerge={() => handleMerge(pair.jobA.id, pair.jobB.id)}
                  isMerging={isMerging}
                />
                <FieldCompareCard
                  job={pair.jobB}
                  other={pair.jobA}
                  label="B"
                  onMerge={() => handleMerge(pair.jobB.id, pair.jobA.id)}
                  isMerging={isMerging}
                />
              </div>

              {/* JD comparison section */}
              {(pair.jobA.jd_full_text || pair.jobB.jd_full_text) && (
                <div className="border-t border-zinc-200">
                  <button
                    onClick={() => setExpandedJd(jdExpanded ? null : jdKey)}
                    className="w-full px-4 py-2 flex items-center justify-between bg-zinc-50 hover:bg-zinc-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-zinc-700">Job Description</span>
                      {jdIdentical ? (
                        <span className="text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Identical</span>
                      ) : (
                        <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Different</span>
                      )}
                      {!pair.jobA.jd_full_text && <span className="text-zinc-400">(A: no JD)</span>}
                      {!pair.jobB.jd_full_text && <span className="text-zinc-400">(B: no JD)</span>}
                    </div>
                    <svg className={`w-4 h-4 text-zinc-400 transition-transform ${jdExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {jdExpanded && (
                    <div className="max-h-96 overflow-y-auto border-t border-zinc-100">
                      {jdIdentical ? (
                        <pre className="px-4 py-3 text-xs text-zinc-600 whitespace-pre-wrap font-mono">
                          {pair.jobA.jd_full_text || pair.jobB.jd_full_text}
                        </pre>
                      ) : (
                        <JdDiff textA={pair.jobA.jd_full_text} textB={pair.jobB.jd_full_text} />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Field comparison card (one side) ──

function FieldCompareCard({
  job,
  other,
  label,
  onMerge,
  isMerging,
}: {
  job: JobSummary;
  other: JobSummary;
  label: string;
  onMerge: () => void;
  isMerging: boolean;
}) {
  const fields: { name: string; value: string; differs: boolean }[] = [
    { name: 'Title', value: job.title, differs: isDiff(job.title, other.title) },
    { name: 'Source', value: job.source, differs: isDiff(job.source, other.source) },
    { name: 'Status', value: job.status, differs: isDiff(job.status, other.status) },
    { name: 'Location', value: job.location.join(', ') || '--', differs: isDiff(job.location, other.location) },
    { name: 'Salary', value: formatSalary(job.salary_min, job.salary_max), differs: isDiff([job.salary_min, job.salary_max], [other.salary_min, other.salary_max]) },
    { name: 'Created', value: new Date(job.created_at).toLocaleDateString(), differs: isDiff(job.created_at.slice(0, 10), other.created_at.slice(0, 10)) },
    { name: 'Has JD', value: job.jd_full_text ? 'Yes' : 'No', differs: !!job.jd_full_text !== !!other.jd_full_text },
  ];

  return (
    <div className="p-3 space-y-2">
      {/* Header with ID and link */}
      <div className="flex items-center justify-between">
        <Link
          href={`/jobs/${job.id}`}
          className="text-xs font-mono text-blue-600 hover:underline"
          target="_blank"
        >
          #{job.id}
        </Link>
        <StatusBadge status={job.status} />
      </div>

      {/* Field rows */}
      <table className="w-full text-xs">
        <tbody>
          {fields.map((f) => (
            <tr key={f.name}>
              <td className="py-0.5 pr-2 text-zinc-400 whitespace-nowrap w-16">{f.name}</td>
              <td className={`py-0.5 ${f.differs ? 'bg-amber-50 text-amber-900 font-medium px-1 rounded' : 'text-zinc-700'}`}>
                {f.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        onClick={onMerge}
        disabled={isMerging}
        className="w-full mt-1 px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 transition-colors"
      >
        {isMerging ? 'Merging...' : `Merge → ${label}`}
      </button>
    </div>
  );
}

// ── JD side-by-side diff view ──

function JdDiff({ textA, textB }: { textA: string | null; textB: string | null }) {
  if (!textA && !textB) return null;

  if (!textA) {
    return (
      <div className="px-4 py-3">
        <div className="text-xs text-zinc-400 mb-2">A has no JD. Showing B only:</div>
        <pre className="text-xs text-zinc-600 bg-zinc-50 p-2 rounded whitespace-pre-wrap font-mono">{textB}</pre>
      </div>
    );
  }
  if (!textB) {
    return (
      <div className="px-4 py-3">
        <div className="text-xs text-zinc-400 mb-2">B has no JD. Showing A only:</div>
        <pre className="text-xs text-zinc-600 bg-zinc-50 p-2 rounded whitespace-pre-wrap font-mono">{textA}</pre>
      </div>
    );
  }

  const sentA = splitSentences(textA);
  const sentB = splitSentences(textB);
  const setA = new Set(sentA);
  const setB = new Set(sentB);
  const markedA = markSentences(sentA, setB);
  const markedB = markSentences(sentB, setA);
  const diffCountA = markedA.filter(s => !s.same).length;
  const diffCountB = markedB.filter(s => !s.same).length;

  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span>A: {sentA.length} sentences, <span className="text-amber-600">{diffCountA} unique</span></span>
        <span>B: {sentB.length} sentences, <span className="text-amber-600">{diffCountB} unique</span></span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SentenceColumn sentences={markedA} label="A" />
        <SentenceColumn sentences={markedB} label="B" />
      </div>
    </div>
  );
}

function SentenceColumn({ sentences, label }: { sentences: { text: string; same: boolean }[]; label: string }) {
  return (
    <div className="text-xs space-y-0.5 max-h-80 overflow-y-auto pr-1">
      <div className="text-zinc-400 font-medium mb-1 sticky top-0 bg-white">{label}</div>
      {sentences.map((s, i) => (
        <span
          key={i}
          className={s.same ? 'text-zinc-500' : 'bg-amber-100 text-amber-900 rounded px-0.5'}
        >
          {s.text}{' '}
        </span>
      ))}
    </div>
  );
}
