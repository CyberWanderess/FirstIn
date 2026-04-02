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

export function DedupClient() {
  const [pairs, setPairs] = useState<DedupPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null); // "primaryId-secondaryId"

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
        // Remove this pair and any pair involving the secondary job
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
        <span className="text-sm text-zinc-500">
          {pairs.length} suspected duplicate{pairs.length !== 1 ? 's' : ''}
        </span>
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

          return (
            <div key={idx} className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
              {/* Match info header */}
              <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-semibold text-zinc-700">
                    {MATCH_LABELS[pair.matchType] || pair.matchType}
                  </span>
                  <span className="text-zinc-500">
                    similarity: {(pair.similarity * 100).toFixed(0)}%
                  </span>
                  <span className="text-zinc-400">
                    {pair.jobA.company_display_name}
                  </span>
                </div>
                <button
                  onClick={() => handleDismiss(pair.jobA.id, pair.jobB.id)}
                  className="text-xs text-zinc-400 hover:text-zinc-600"
                >
                  Not Duplicate
                </button>
              </div>

              {/* Side by side comparison */}
              <div className="grid grid-cols-2 divide-x divide-zinc-100">
                <JobCard
                  job={pair.jobA}
                  onKeep={() => handleMerge(pair.jobA.id, pair.jobB.id)}
                  isMerging={isMerging}
                  label="A"
                />
                <JobCard
                  job={pair.jobB}
                  onKeep={() => handleMerge(pair.jobB.id, pair.jobA.id)}
                  isMerging={isMerging}
                  label="B"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JobCard({
  job,
  onKeep,
  isMerging,
  label,
}: {
  job: JobSummary;
  onKeep: () => void;
  isMerging: boolean;
  label: string;
}) {
  return (
    <div className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/jobs/${job.id}`}
            className="text-sm font-medium text-zinc-900 hover:underline block truncate"
            target="_blank"
          >
            {job.title}
          </Link>
          <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
            <span>#{job.id}</span>
            <span>{job.source}</span>
            <StatusBadge status={job.status} />
          </div>
        </div>
      </div>

      <div className="text-xs text-zinc-500 space-y-0.5">
        {job.location.length > 0 && (
          <div>Location: {job.location.join(', ')}</div>
        )}
        {(job.salary_min || job.salary_max) && (
          <div>
            Salary: {job.salary_min ? `$${(job.salary_min / 1000).toFixed(0)}k` : '?'}
            {' - '}
            {job.salary_max ? `$${(job.salary_max / 1000).toFixed(0)}k` : '?'}
          </div>
        )}
        <div>Created: {new Date(job.created_at).toLocaleDateString()}</div>
      </div>

      {job.jd_full_text && (
        <div className="text-xs text-zinc-400 line-clamp-3 bg-zinc-50 rounded p-2">
          {job.jd_full_text.slice(0, 300)}...
        </div>
      )}

      <button
        onClick={onKeep}
        disabled={isMerging}
        className="w-full mt-1 px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 transition-colors"
      >
        {isMerging ? 'Merging...' : `Keep ${label}`}
      </button>
    </div>
  );
}
