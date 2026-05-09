'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────

type ApiResponse<T> = { success: boolean; data?: T; error?: string };

type PromptGroup = 'evaluation' | 'shared' | 'recheck' | 'company' | 'deep_analysis' | 'rejection';

interface PromptListItem {
  key: string;
  title: string;
  group: PromptGroup;
  description: string;
  placeholders: string[];
  isCustomized: boolean;
  currentValue: string;
  defaultValue: string;
}

interface PromptVersion {
  id: number;
  key: string;
  value: string;
  label: string | null;
  created_at: string;
}

interface PromptDetail extends PromptListItem {
  versions: PromptVersion[];
}

const GROUP_LABEL: Record<PromptGroup, string> = {
  evaluation: 'Evaluation',
  shared: 'Shared',
  recheck: 'Recheck',
  company: 'Company Research',
  deep_analysis: 'Deep Analysis',
  rejection: 'Rejection Scan',
};

const GROUP_ORDER: PromptGroup[] = ['evaluation', 'shared', 'recheck', 'company', 'deep_analysis', 'rejection'];

// ── Helpers ───────────────────────────────────────────────────────────

async function fetchApi<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(url, options);
  return res.json();
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
  } else {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

async function pasteFromClipboard(): Promise<string | null> {
  if (!navigator.clipboard || !navigator.clipboard.readText) return null;
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

// ── Main tab ──────────────────────────────────────────────────────────

export function PromptsTab() {
  const [items, setItems] = useState<PromptListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchApi<{ items: PromptListItem[] }>('/api/prompts');
    if (!res.success) {
      setError(res.error || 'Failed to load prompts');
      setLoading(false);
      return;
    }
    setItems(res.data!.items);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading) return <div className="text-sm text-zinc-500">Loading prompts…</div>;
  if (error) return <div className="text-sm text-rose-600">Error: {error}</div>;

  const byGroup: Record<string, PromptListItem[]> = {};
  for (const it of items) {
    (byGroup[it.group] ||= []).push(it);
  }

  return (
    <div className="space-y-6">
      <div className="rounded border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
        <p className="font-medium text-zinc-900">How this works</p>
        <p className="mt-1 text-zinc-600">
          Each prompt below is the editable template used when you export to clipboard.
          Copy a prompt out, tweak it in an external LLM, paste it back, and Save.
          Every Save creates a new version — use History to restore or delete old versions.
          Reset to Default removes all your versions and falls back to the built-in prompt.
        </p>
      </div>

      {GROUP_ORDER.filter((g) => byGroup[g]?.length).map((group) => (
        <section key={group} className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-700">{GROUP_LABEL[group]}</h2>
          <div className="space-y-2">
            {byGroup[group].map((item) => (
              <PromptCard
                key={item.key}
                item={item}
                expanded={expanded.has(item.key)}
                onToggle={() => toggleExpanded(item.key)}
                onChanged={load}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Per-prompt card ───────────────────────────────────────────────────

interface CardProps {
  item: PromptListItem;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}

function PromptCard({ item, expanded, onToggle, onChanged }: CardProps) {
  const [text, setText] = useState(item.currentValue);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<PromptVersion[] | null>(null);

  // Re-sync when underlying item changes (e.g. after parent reload).
  useEffect(() => { setText(item.currentValue); }, [item.currentValue]);

  const dirty = text !== item.currentValue;

  async function refreshVersions() {
    const res = await fetchApi<PromptDetail>(`/api/prompts/${encodeURIComponent(item.key)}`);
    if (res.success && res.data) setVersions(res.data.versions);
  }

  async function handleCopy() {
    setBusy('copy');
    try {
      await copyToClipboard(text);
      setMsg('Copied to clipboard');
    } catch {
      setErr('Copy failed');
    }
    setBusy(null);
    setTimeout(() => setMsg(null), 1500);
  }

  async function handlePaste() {
    setBusy('paste');
    const pasted = await pasteFromClipboard();
    setBusy(null);
    if (pasted == null) {
      setErr('Clipboard read not allowed — use Ctrl+V in the textarea instead');
      return;
    }
    setText(pasted);
    setMsg('Pasted from clipboard');
    setTimeout(() => setMsg(null), 1500);
  }

  async function handleSave() {
    if (!dirty) return;
    setBusy('save');
    setErr(null);
    const res = await fetchApi<PromptVersion>(`/api/prompts/${encodeURIComponent(item.key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: text, label: label.trim() || null }),
    });
    setBusy(null);
    if (!res.success) {
      setErr(res.error || 'Save failed');
      return;
    }
    setLabel('');
    setMsg(`Saved v${res.data!.id}`);
    setTimeout(() => setMsg(null), 2000);
    if (showHistory) refreshVersions();
    onChanged();
  }

  async function handleReset() {
    if (!item.isCustomized) {
      setText(item.defaultValue);
      setMsg('Restored default in editor (not yet saved)');
      setTimeout(() => setMsg(null), 2000);
      return;
    }
    if (!confirm(`Delete ALL ${versions?.length ?? ''} saved version(s) for this prompt and revert to the built-in default?`)) return;
    setBusy('reset');
    setErr(null);
    const res = await fetchApi(`/api/prompts/${encodeURIComponent(item.key)}`, { method: 'DELETE' });
    setBusy(null);
    if (!res.success) {
      setErr(res.error || 'Reset failed');
      return;
    }
    setMsg('Reset to default');
    setTimeout(() => setMsg(null), 2000);
    setVersions(null);
    onChanged();
  }

  async function handleToggleHistory() {
    const next = !showHistory;
    setShowHistory(next);
    if (next && versions == null) await refreshVersions();
  }

  async function handleRestore(v: PromptVersion) {
    setBusy('restore');
    setErr(null);
    const res = await fetchApi<PromptVersion>(`/api/prompts/versions/${v.id}/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    setBusy(null);
    if (!res.success) {
      setErr(res.error || 'Restore failed');
      return;
    }
    setMsg(`Restored v${v.id} as v${res.data!.id}`);
    setTimeout(() => setMsg(null), 2000);
    await refreshVersions();
    onChanged();
  }

  async function handleDeleteVersion(v: PromptVersion) {
    const isLatest = versions && versions[0]?.id === v.id;
    const isLastRow = versions && versions.length === 1;
    const warning = isLastRow
      ? 'This is the only saved version — deleting it reverts this prompt to the built-in default. Continue?'
      : isLatest
        ? `This is the currently-active version. After deletion, the previous version (v${versions?.[1]?.id}) will become active. Continue?`
        : `Delete version v${v.id}? This cannot be undone.`;
    if (!confirm(warning)) return;

    setBusy('del-version');
    setErr(null);
    const res = await fetchApi(`/api/prompts/versions/${v.id}`, { method: 'DELETE' });
    setBusy(null);
    if (!res.success) {
      setErr(res.error || 'Delete failed');
      return;
    }
    setMsg(`Deleted v${v.id}`);
    setTimeout(() => setMsg(null), 2000);
    await refreshVersions();
    onChanged();
  }

  return (
    <div className="rounded border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-900">{item.title}</span>
            {item.isCustomized && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                Customized
              </span>
            )}
            {item.placeholders.length > 0 && (
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">
                placeholders: {item.placeholders.map((p) => `{{${p}}}`).join(', ')}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-500">{item.description}</p>
        </div>
        <span className="text-zinc-400">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-zinc-200 px-4 py-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={Math.min(24, Math.max(8, text.split('\n').length + 1))}
            spellCheck={false}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 focus:border-zinc-500 focus:outline-none"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={handleCopy}
              className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >Copy</button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={handlePaste}
              className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >Paste</button>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional, e.g. 'Tightened H1B rules')"
              className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400"
            />
            <button
              type="button"
              disabled={busy !== null || !dirty}
              onClick={handleSave}
              className="rounded border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
            >{dirty ? 'Save new version' : 'Saved'}</button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={handleReset}
              className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              title={item.isCustomized ? 'Delete all saved versions and revert to built-in default' : 'Put built-in default into the editor'}
            >Reset to default</button>
            <button
              type="button"
              onClick={handleToggleHistory}
              className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
            >{showHistory ? 'Hide history' : 'History'}</button>
          </div>

          {(msg || err) && (
            <div className={`text-xs ${err ? 'text-rose-600' : 'text-emerald-600'}`}>
              {err || msg}
            </div>
          )}

          {showHistory && (
            <HistoryList
              versions={versions}
              onRestore={handleRestore}
              onDelete={handleDeleteVersion}
              busy={busy !== null}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── History list ──────────────────────────────────────────────────────

interface HistoryListProps {
  versions: PromptVersion[] | null;
  onRestore: (v: PromptVersion) => void;
  onDelete: (v: PromptVersion) => void;
  busy: boolean;
}

function HistoryList({ versions, onRestore, onDelete, busy }: HistoryListProps) {
  if (versions == null) return <div className="text-xs text-zinc-500">Loading history…</div>;
  if (versions.length === 0) {
    return <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">No saved versions yet. The built-in default is in use.</div>;
  }

  return (
    <div className="overflow-hidden rounded border border-zinc-200">
      <table className="w-full text-xs">
        <thead className="bg-zinc-100 text-zinc-600">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">ID</th>
            <th className="px-2 py-1.5 text-left font-medium">Saved</th>
            <th className="px-2 py-1.5 text-left font-medium">Label</th>
            <th className="px-2 py-1.5 text-left font-medium">Size</th>
            <th className="px-2 py-1.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v, i) => (
            <tr key={v.id} className="border-t border-zinc-200">
              <td className="px-2 py-1.5 font-mono text-zinc-700">
                v{v.id}
                {i === 0 && <span className="ml-1 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-medium text-emerald-800">ACTIVE</span>}
              </td>
              <td className="px-2 py-1.5 text-zinc-500">{new Date(v.created_at + 'Z').toLocaleString()}</td>
              <td className="px-2 py-1.5 text-zinc-700">{v.label || <span className="text-zinc-400">—</span>}</td>
              <td className="px-2 py-1.5 text-zinc-500">{v.value.length.toLocaleString()} chars</td>
              <td className="px-2 py-1.5 text-right">
                {i !== 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRestore(v)}
                    className="mr-2 rounded border border-zinc-300 bg-white px-2 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >Restore</button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDelete(v)}
                  className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
