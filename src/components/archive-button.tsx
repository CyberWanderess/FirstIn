'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useClickOutside } from '@/hooks/use-click-outside';

const ARCHIVE_REASONS = [
  { label: '职位失效', value: '职位失效' },
  { label: 'Skill 不 match', value: 'Skill不match' },
  { label: '谨慎投递', value: '谨慎投递' },
  { label: '身份不 match', value: '身份不match' },
];

export function ArchiveButton({ jobId }: { jobId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false), open);

  async function archive(reason: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'archived_manual',
          notes: `[手动归档] ${reason}`,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to archive');
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="text-[10px] text-zinc-400 hover:text-zinc-600 mt-0.5"
      >
        {loading ? '...' : 'Archive'}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 w-36 bg-white border border-zinc-200 rounded-lg shadow-lg py-1">
          {ARCHIVE_REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => archive(r.value)}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
