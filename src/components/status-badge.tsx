const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  pending_eval: 'bg-yellow-100 text-yellow-800',
  pending_deep_analysis: 'bg-purple-100 text-purple-800',
  ready_to_apply_tailored: 'bg-indigo-100 text-indigo-800',
  ready_to_apply: 'bg-green-100 text-green-800',
  applied: 'bg-cyan-100 text-cyan-800',
  interviewing: 'bg-orange-100 text-orange-800',
  offer: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  archived_filtered: 'bg-zinc-100 text-zinc-600',
  archived_low_match: 'bg-zinc-100 text-zinc-600',
  archived_no_response: 'bg-zinc-100 text-zinc-600',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  pending_eval: 'Pending Eval',
  pending_deep_analysis: 'Deep Analysis',
  ready_to_apply_tailored: 'Tailored',
  ready_to_apply: 'Ready to Apply',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  archived_filtered: 'Archived (Filtered)',
  archived_low_match: 'Archived (Low Match)',
  archived_no_response: 'Archived (No Response)',
};

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || 'bg-zinc-100 text-zinc-600';
  const label = STATUS_LABELS[status] || status;

  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${color}`}>
      {label}
    </span>
  );
}
