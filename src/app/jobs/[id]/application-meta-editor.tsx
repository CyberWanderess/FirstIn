'use client';

import { useState } from 'react';

export function ApplicationMetaEditor({
  jobId,
  initialTailored,
  initialReferral,
}: {
  jobId: number;
  initialTailored: boolean | null;
  initialReferral: boolean | null;
}) {
  const [tailored, setTailored] = useState(initialTailored ?? false);
  const [referral, setReferral] = useState(initialReferral ?? false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(field: 'resume_tailored' | 'has_referral', value: boolean) {
    setSaving(field);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to save');
      if (field === 'resume_tailored') setTailored(value);
      else setReferral(value);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex items-center gap-5 mt-3 pt-3 border-t border-zinc-100">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={tailored}
          disabled={saving !== null}
          onChange={e => toggle('resume_tailored', e.target.checked)}
          className="w-4 h-4 accent-indigo-600 cursor-pointer"
        />
        <span className="text-sm text-zinc-700">
          Resume Tailored
          {tailored && (
            <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">✓</span>
          )}
        </span>
      </label>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={referral}
          disabled={saving !== null}
          onChange={e => toggle('has_referral', e.target.checked)}
          className="w-4 h-4 accent-amber-500 cursor-pointer"
        />
        <span className="text-sm text-zinc-700">
          内推 / Referral
          {referral && (
            <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">✓</span>
          )}
        </span>
      </label>

      {saving && <span className="text-xs text-zinc-400">Saving...</span>}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
