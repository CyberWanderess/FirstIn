'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  pending_eval: 'Pending Eval',
  pending_deep_analysis: 'Deep Analysis',
  analyzed: 'Analyzed',
  ready_to_apply: 'Ready to Apply',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  archived_filtered: 'Archived (Filtered)',
  archived_low_match: 'Archived (Low Match)',
  archived_no_response: 'Archived (No Response)',
};

export function JobStatusTransitions({
  jobId,
  currentStatus,
  allowedTransitions,
}: {
  jobId: number;
  currentStatus: string;
  allowedTransitions: string[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleTransition(newStatus: string) {
    setLoading(newStatus);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to update status');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-zinc-500">Move to:</span>
      {allowedTransitions.map((status) => (
        <button
          key={status}
          onClick={() => handleTransition(status)}
          disabled={loading !== null}
          className="px-3 py-1 text-xs font-medium border border-zinc-300 rounded-md hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading === status ? '...' : STATUS_LABELS[status] || status}
        </button>
      ))}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
