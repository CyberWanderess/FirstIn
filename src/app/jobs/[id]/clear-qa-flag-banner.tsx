'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ClearQAFlagBanner({
  jobId,
  companyId,
  notes,
}: {
  jobId?: number;
  companyId?: number;
  notes: string | null;
}) {
  const router = useRouter();
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endpoint = jobId != null
    ? `/api/jobs/${jobId}`
    : `/api/companies/${companyId}`;
  const entityLabel = jobId != null ? 'evaluation' : 'company';

  async function handleClear() {
    setClearing(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qa_flagged: 0, qa_notes: null }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to clear QA flag');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setClearing(false);
    }
  }

  return (
    <div className="border-l-4 border-red-500 bg-red-50 rounded-md p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
            <span>⚠</span>
            <span>QA agent flagged this {entityLabel}</span>
          </div>
          {notes && (
            <p className="mt-1 text-sm text-red-700 whitespace-pre-wrap break-words">{notes}</p>
          )}
          {error && <p className="mt-1 text-xs text-red-600">Error: {error}</p>}
        </div>
        <button
          type="button"
          onClick={handleClear}
          disabled={clearing}
          className="shrink-0 px-3 py-1.5 text-xs font-medium border border-red-300 text-red-700 bg-white rounded-md hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {clearing ? 'Clearing...' : 'Clear Flag'}
        </button>
      </div>
    </div>
  );
}
