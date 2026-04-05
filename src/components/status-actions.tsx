'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useClickOutside } from '@/hooks/use-click-outside';
import { STATUS_LABELS } from '@/types';
import type { JobStatus } from '@/types';
import { getAllowedTransitions } from '@/lib/status-machine';

const STATUS_COLORS: Record<string, string> = {
  pending_eval: 'text-yellow-800 bg-yellow-50',
  flagged: 'text-amber-800 bg-amber-50',
  pending_deep_analysis: 'text-purple-800 bg-purple-50',
  ready_to_apply_tailored: 'text-indigo-800 bg-indigo-50',
  ready_to_apply: 'text-green-800 bg-green-50',
  applied: 'text-cyan-800 bg-cyan-50',
  interviewing: 'text-orange-800 bg-orange-50',
  offer: 'text-emerald-800 bg-emerald-50',
  rejected_resume: 'text-red-800 bg-red-50',
  archived_filtered: 'text-zinc-600 bg-zinc-50',
  archived_low_match: 'text-zinc-600 bg-zinc-50',
  archived_no_response: 'text-zinc-600 bg-zinc-50',
  archived_manual: 'text-zinc-600 bg-zinc-50',
};

const ARCHIVE_REASONS = [
  'Position Expired',
  'Skill Mismatch',
  'Cautious Apply',
  'Eligibility Mismatch',
];

function isArchiveStatus(status: string): boolean {
  return status.startsWith('archived_');
}

export function StatusActions({
  jobId,
  currentStatus,
  variant,
}: {
  jobId: number;
  currentStatus: JobStatus;
  variant: 'compact' | 'expanded';
}) {
  const router = useRouter();
  const allowed = getAllowedTransitions(currentStatus);

  if (allowed.length === 0) return null;

  if (variant === 'expanded') {
    return <ExpandedActions jobId={jobId} allowed={allowed} />;
  }
  return <CompactActions jobId={jobId} allowed={allowed} />;
}

// --- Expanded variant (detail page) ---

function ExpandedActions({ jobId, allowed }: { jobId: number; allowed: JobStatus[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const archiveRef = useRef<HTMLDivElement>(null);

  useClickOutside(archiveRef, () => setArchiveOpen(false), archiveOpen);

  const forward = allowed.filter((s) => !isArchiveStatus(s));
  const archive = allowed.filter((s) => isArchiveStatus(s));

  async function transition(status: string, notes?: string) {
    setLoading(status);
    setError(null);
    try {
      const body: Record<string, string> = { status };
      if (notes) body.notes = notes;
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
      setArchiveOpen(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-zinc-500">Move to:</span>
      {forward.map((status) => (
        <button
          key={status}
          onClick={() => transition(status)}
          disabled={loading !== null}
          className={`px-3 py-1 text-xs font-medium border border-zinc-300 rounded-md hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
        >
          {loading === status ? '...' : STATUS_LABELS[status] || status}
        </button>
      ))}
      {archive.length > 0 && (
        <div className="relative" ref={archiveRef}>
          <button
            onClick={() => setArchiveOpen(!archiveOpen)}
            disabled={loading !== null}
            className="px-3 py-1 text-xs font-medium border border-zinc-300 rounded-md text-zinc-500 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading && isArchiveStatus(loading) ? '...' : 'Archive ▾'}
          </button>
          {archiveOpen && (
            <ArchiveDropdown
              archive={archive}
              onSelect={transition}
            />
          )}
        </div>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

// --- Compact variant (list page) ---

function CompactActions({ jobId, allowed }: { jobId: number; allowed: JobStatus[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [archiveSub, setArchiveSub] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => { setOpen(false); setArchiveSub(false); }, open);

  const forward = allowed.filter((s) => !isArchiveStatus(s));
  const archive = allowed.filter((s) => isArchiveStatus(s));

  async function transition(status: string, notes?: string) {
    setLoading(true);
    try {
      const body: Record<string, string> = { status };
      if (notes) body.notes = notes;
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        try { alert(JSON.parse(text).error || 'Failed'); } catch { alert(text || 'Failed'); }
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
      setOpen(false);
      setArchiveSub(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setArchiveSub(false); }}
        disabled={loading}
        className="text-[10px] text-zinc-400 hover:text-zinc-600 mt-0.5"
      >
        {loading ? '...' : 'Actions ▾'}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 w-44 bg-white border border-zinc-200 rounded-lg shadow-lg py-1">
          {forward.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => transition(status)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 flex items-center gap-2"
            >
              <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${(STATUS_COLORS[status] || 'bg-zinc-100').split(' ')[1] || 'bg-zinc-100'}`} />
              <span className={STATUS_COLORS[status]?.split(' ')[0] || 'text-zinc-700'}>
                {STATUS_LABELS[status] || status}
              </span>
            </button>
          ))}
          {forward.length > 0 && archive.length > 0 && (
            <div className="border-t border-zinc-100 my-1" />
          )}
          {archive.length > 0 && !archiveSub && (
            <button
              type="button"
              onClick={() => setArchiveSub(true)}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50"
            >
              Archive...
            </button>
          )}
          {archiveSub && archive.map((status) => {
            if (status === 'archived_manual') {
              return ARCHIVE_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => transition('archived_manual', `[Manual Archive] ${reason}`)}
                  className="w-full text-left px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 pl-5"
                >
                  {reason}
                </button>
              ));
            }
            return (
              <button
                key={status}
                type="button"
                onClick={() => transition(status)}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 pl-5"
              >
                {STATUS_LABELS[status] || status}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Shared archive reason dropdown ---

function ArchiveDropdown({
  archive,
  onSelect,
}: {
  archive: JobStatus[];
  onSelect: (status: string, notes?: string) => void;
}) {
  return (
    <div className="absolute z-20 mt-1 left-0 w-44 bg-white border border-zinc-200 rounded-lg shadow-lg py-1">
      {archive.map((status) => {
        if (status === 'archived_manual') {
          return ARCHIVE_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => onSelect('archived_manual', `[Manual Archive] ${reason}`)}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50"
            >
              {reason}
            </button>
          ));
        }
        return (
          <button
            key={status}
            type="button"
            onClick={() => onSelect(status)}
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50"
          >
            {STATUS_LABELS[status] || status}
          </button>
        );
      })}
    </div>
  );
}
