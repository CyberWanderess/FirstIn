'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const STRATEGIES = ['open', 'cautious', 'blocked', 'no_h1b'] as const;

export function CompanyStrategyEditor({
  companyId,
  currentStrategy,
  currentReason,
  currentLimit,
}: {
  companyId: number;
  currentStrategy: string;
  currentReason: string;
  currentLimit: number | null;
}) {
  const router = useRouter();
  const [strategy, setStrategy] = useState(currentStrategy);
  const [reason, setReason] = useState(currentReason);
  const [limit, setLimit] = useState(currentLimit !== null ? String(currentLimit) : '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    strategy !== currentStrategy ||
    reason !== currentReason ||
    (limit === '' ? null : Number(limit)) !== currentLimit;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_strategy: strategy,
          strategy_reason: reason || null,
          application_limit: limit === '' ? null : Number(limit),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to update');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <label className="block text-sm text-zinc-600 mb-1">Strategy</label>
        <select
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          className="w-full border border-zinc-300 rounded-md px-3 py-1.5 text-sm bg-white text-zinc-900"
        >
          {STRATEGIES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm text-zinc-600 mb-1">Reason</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm text-zinc-900 resize-y"
          placeholder="Why this strategy?"
        />
      </div>

      <div>
        <label className="block text-sm text-zinc-600 mb-1">Application Limit</label>
        <input
          type="number"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          className="w-full border border-zinc-300 rounded-md px-3 py-1.5 text-sm text-zinc-900"
          placeholder="No limit"
          min={0}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || !hasChanges}
          className="px-4 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving...' : 'Save Strategy'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
