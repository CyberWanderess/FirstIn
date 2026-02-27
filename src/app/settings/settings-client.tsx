'use client';

import { useState } from 'react';

interface Setting {
  id: number;
  key: string;
  value: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

async function fetchApi<T>(url: string, options?: RequestInit): Promise<{ success: boolean; data?: T; error?: string }> {
  const res = await fetch(url, options);
  return res.json();
}

export function SettingsClient({ initialSettings }: { initialSettings: Setting[] }) {
  const [settings, setSettings] = useState<Setting[]>(initialSettings);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  // Resume text state
  const resumeSetting = settings.find((s) => s.key === 'resume_text');
  const [resumeText, setResumeText] = useState(resumeSetting?.value || '');
  const [resumeSaving, setResumeSaving] = useState(false);
  const [resumeSaved, setResumeSaved] = useState(false);

  function startEdit(setting: Setting) {
    setEditingKey(setting.key);
    setEditValue(setting.value);
    setError(null);
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditValue('');
    setError(null);
  }

  async function handleSave(key: string) {
    setSaving(true);
    setError(null);
    setSavedKey(null);

    try {
      const res = await fetchApi<Setting>(`/api/settings/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: editValue }),
      });
      if (!res.success) throw new Error(res.error || 'Failed to save');
      if (res.data) {
        setSettings((prev) =>
          prev.map((s) => (s.key === key ? res.data! : s))
        );
      }
      setEditingKey(null);
      setSavedKey(key);
      setTimeout(() => setSavedKey(null), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleResumeSave() {
    setResumeSaving(true);
    setError(null);
    setResumeSaved(false);
    try {
      const res = await fetchApi<Setting>('/api/settings/resume_text', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: resumeText, description: 'User resume for deep analysis' }),
      });
      if (!res.success) throw new Error(res.error || 'Failed to save');
      if (res.data) {
        setSettings((prev) => {
          const exists = prev.find((s) => s.key === 'resume_text');
          if (exists) return prev.map((s) => (s.key === 'resume_text' ? res.data! : s));
          return [...prev, res.data!];
        });
      }
      setResumeSaved(true);
      setTimeout(() => setResumeSaved(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResumeSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-zinc-900">Settings</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Resume */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-zinc-900">Resume</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Used in deep analysis export for JD-resume mapping</p>
          </div>
          <div className="flex items-center gap-2">
            {resumeSaved && <span className="text-xs text-green-600">Saved</span>}
            <button
              onClick={handleResumeSave}
              disabled={resumeSaving}
              className="px-3 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {resumeSaving ? 'Saving...' : 'Save Resume'}
            </button>
          </div>
        </div>
        <textarea
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          rows={12}
          className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm text-zinc-900 font-mono resize-y"
          placeholder="Paste your resume text here..."
        />
      </div>

      {/* Other settings */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Key</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Value</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Description</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600 w-28">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {settings.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                  No settings configured
                </td>
              </tr>
            )}
            {settings.map((setting) => (
              <tr key={setting.key} className="hover:bg-zinc-50 transition-colors">
                <td className="px-4 py-2.5 font-mono text-zinc-900 text-xs">
                  {setting.key}
                </td>
                <td className="px-4 py-2.5">
                  {editingKey === setting.key ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="border border-zinc-300 rounded px-2 py-1 text-sm flex-1 font-mono"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSave(setting.key);
                          if (e.key === 'Escape') cancelEdit();
                        }}
                      />
                    </div>
                  ) : (
                    <span className="font-mono text-xs text-zinc-700">
                      {setting.value}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-zinc-500 text-xs">
                  {setting.description || '--'}
                </td>
                <td className="px-4 py-2.5">
                  {editingKey === setting.key ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleSave(setting.key)}
                        disabled={saving}
                        className="px-2 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        {saving ? '...' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-2 py-1 text-xs font-medium border border-zinc-300 rounded hover:bg-zinc-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEdit(setting)}
                        className="px-2 py-1 text-xs font-medium border border-zinc-300 rounded hover:bg-zinc-50"
                      >
                        Edit
                      </button>
                      {savedKey === setting.key && (
                        <span className="text-xs text-green-600">Saved</span>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
