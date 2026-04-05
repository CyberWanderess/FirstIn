'use client';

import { useState } from 'react';
import { DedupClient } from '@/app/dedup/dedup-client';

export function DedupPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`text-xs px-2 py-1 rounded border transition-colors ${
          open
            ? 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
            : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'
        }`}
      >
        {open ? 'Hide Duplicates' : 'Scan Duplicates'}
      </button>
      {open && (
        <div className="mt-4 bg-white border border-zinc-200 rounded-lg p-4">
          <DedupClient />
        </div>
      )}
    </div>
  );
}
