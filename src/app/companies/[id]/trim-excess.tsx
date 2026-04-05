'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const TRIMMABLE_STATUSES = [
  'pending_eval', 'flagged', 'pending_deep_analysis',
  'ready_to_apply_tailored', 'ready_to_apply',
];

export function TrimExcess({
  companyId,
  applicationLimit,
  limitPeriodMonths,
  jobs,
}: {
  companyId: number;
  applicationLimit: number;
  limitPeriodMonths: number | null;
  jobs: { id: number; title: string; status: string; score_success: number | null; score: number | null }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [keepCount, setKeepCount] = useState(applicationLimit * 2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeJobs = jobs.filter(j => TRIMMABLE_STATUSES.includes(j.status));
  const sortedJobs = [...activeJobs].sort((a, b) => {
    const sa = a.score_success ?? -1;
    const sb = b.score_success ?? -1;
    if (sb !== sa) return sb - sa;
    return (b.score ?? -1) - (a.score ?? -1);
  });

  const toArchive = sortedJobs.slice(keepCount);
  const period = (limitPeriodMonths ?? 12) === 1 ? 'mo' : (limitPeriodMonths ?? 12) === 12 ? 'yr' : `${limitPeriodMonths}mo`;

  // Don't show if nothing to trim
  if (activeJobs.length <= applicationLimit * 2) return null;

  async function handleTrim() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/trim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep: keepCount }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Trim failed');
      setResult(`Archived ${json.data.archived} jobs, kept ${json.data.kept}`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs px-2 py-1 rounded border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
      >
        Trim to top {keepCount}
      </button>

      {result && (
        <span className="text-xs text-green-600 ml-2">{result}</span>
      )}

      {open && (
        <div className="absolute z-20 mt-2 right-0 w-80 bg-white border border-zinc-200 rounded-lg shadow-lg p-4 space-y-3">
          <div className="text-sm font-medium text-zinc-900">
            Trim Excess Jobs
          </div>
          <div className="text-xs text-zinc-500">
            Application limit: {applicationLimit}/{period}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-600">Keep top:</label>
            <input
              type="number"
              value={keepCount}
              onChange={(e) => setKeepCount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 border border-zinc-300 rounded px-2 py-1 text-xs text-zinc-900"
              min={1}
            />
            <span className="text-xs text-zinc-400">
              ({activeJobs.length} active, {toArchive.length} to archive)
            </span>
          </div>

          {toArchive.length > 0 && (
            <div className="max-h-40 overflow-y-auto border border-zinc-100 rounded p-2 space-y-1">
              <div className="text-[10px] text-zinc-400 uppercase font-medium">Will be archived:</div>
              {toArchive.map((job) => (
                <div key={job.id} className="text-xs text-zinc-600 flex justify-between">
                  <span className="truncate mr-2">{job.title}</span>
                  <span className="text-zinc-400 shrink-0">
                    {job.score_success ?? '--'}/{job.score ?? '--'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTrim}
              disabled={loading || toArchive.length === 0}
              className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Trimming...' : `Archive ${toArchive.length} jobs`}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700"
            >
              Cancel
            </button>
          </div>

          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>
      )}
    </div>
  );
}
