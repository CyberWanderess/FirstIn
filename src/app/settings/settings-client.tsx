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

const SETTING_SECTIONS: { label: string; keys: string[]; id: string; crawlerOnly?: boolean }[] = [
  {
    id: 'filtering',
    label: 'Filtering & Evaluation',
    keys: ['no_h1b_action', 'job_no_visa_action', 'blocked_action', 'eval_score_threshold', 'archive_no_response_days', 'expiry_days'],
  },
  {
    id: 'crawler',
    label: 'Crawler',
    keys: ['scrape_delay_ms', 'scrape_batch_size'],
    crawlerOnly: true,
  },
];

const CATEGORIZED_KEYS = new Set(SETTING_SECTIONS.flatMap((s) => s.keys));
const HIDDEN_KEYS = new Set(['resume_text', 'setup_completed', 'extension_api_token', 'jsearch_enabled', 'jsearch_api_key']);

export function SettingsClient({ initialSettings, enableCrawler = true }: { initialSettings: Setting[]; enableCrawler?: boolean }) {
  const [settings, setSettings] = useState<Setting[]>(initialSettings);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  // Extension token state
  const [tokenVisible, setTokenVisible] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const hasToken = settings.some((s) => s.key === 'extension_api_token' && s.value);

  async function handleGenerateToken() {
    setTokenLoading(true);
    setError(null);
    try {
      const res = await fetchApi<{ token: string }>('/api/settings/extension-token', { method: 'POST' });
      if (!res.success) throw new Error(res.error || 'Failed to generate token');
      setGeneratedToken(res.data!.token);
      setTokenVisible(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTokenLoading(false);
    }
  }

  async function handleRevokeToken() {
    setTokenLoading(true);
    setError(null);
    try {
      const res = await fetchApi<{ revoked: boolean }>('/api/settings/extension-token', { method: 'DELETE' });
      if (!res.success) throw new Error(res.error || 'Failed to revoke token');
      setGeneratedToken(null);
      setTokenVisible(false);
      setSettings((prev) => prev.map((s) => s.key === 'extension_api_token' ? { ...s, value: '' } : s));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTokenLoading(false);
    }
  }

  // Change password state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwChanging, setPwChanging] = useState(false);
  const [pwResult, setPwResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleChangePassword() {
    setPwChanging(true);
    setPwResult(null);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwResult({ ok: false, msg: data.error || 'Failed' });
      } else {
        setPwResult({ ok: true, msg: data.message || 'Password changed' });
        setCurrentPw('');
        setNewPw('');
        // Redirect to login after short delay since sessions are invalidated
        setTimeout(() => { window.location.href = '/login'; }, 2000);
      }
    } catch (e) {
      setPwResult({ ok: false, msg: (e as Error).message });
    } finally {
      setPwChanging(false);
    }
  }

  // Resume text state
  const resumeSetting = settings.find((s) => s.key === 'resume_text');
  const [resumeText, setResumeText] = useState(resumeSetting?.value || '');
  const [resumeSaving, setResumeSaving] = useState(false);
  const [resumeSaved, setResumeSaved] = useState(false);

  // JSearch state
  const jsearchEnabledSetting = settings.find((s) => s.key === 'jsearch_enabled');
  const [jsearchEnabled, setJsearchEnabled] = useState(jsearchEnabledSetting?.value === 'true');
  const [jsearchToggling, setJsearchToggling] = useState(false);
  const jsearchKeySetting = settings.find((s) => s.key === 'jsearch_api_key');
  const [jsearchApiKey, setJsearchApiKey] = useState(jsearchKeySetting?.value || '');
  const [jsearchKeySaving, setJsearchKeySaving] = useState(false);
  const [jsearchKeySaved, setJsearchKeySaved] = useState(false);
  const [jsearchKeyVisible, setJsearchKeyVisible] = useState(false);

  // Uncategorized settings (not in any section and not hidden)
  const uncategorizedSettings = settings.filter(
    (s) => !CATEGORIZED_KEYS.has(s.key) && !HIDDEN_KEYS.has(s.key)
  );

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

  async function handleJsearchToggle() {
    setJsearchToggling(true);
    setError(null);
    const newValue = !jsearchEnabled;
    try {
      const res = await fetchApi<Setting>('/api/settings/jsearch_enabled', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: String(newValue), description: 'Enable JSearch (Google Jobs) data source' }),
      });
      if (!res.success) throw new Error(res.error || 'Failed to save');
      setJsearchEnabled(newValue);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setJsearchToggling(false);
    }
  }

  async function handleJsearchKeySave() {
    setJsearchKeySaving(true);
    setError(null);
    setJsearchKeySaved(false);
    try {
      const res = await fetchApi<Setting>('/api/settings/jsearch_api_key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: jsearchApiKey, description: 'RapidAPI key for JSearch' }),
      });
      if (!res.success) throw new Error(res.error || 'Failed to save');
      setJsearchKeySaved(true);
      setTimeout(() => setJsearchKeySaved(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setJsearchKeySaving(false);
    }
  }

  function renderSettingsTable(items: Setting[]) {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50/50">
            <th className="text-left px-4 py-2 font-medium text-zinc-600">Key</th>
            <th className="text-left px-4 py-2 font-medium text-zinc-600">Value</th>
            <th className="text-left px-4 py-2 font-medium text-zinc-600">Description</th>
            <th className="text-left px-4 py-2 font-medium text-zinc-600 w-28">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {items.map((setting) => (
            <tr key={setting.key} className="hover:bg-zinc-50 transition-colors">
              <td className="px-4 py-2.5 font-mono text-zinc-900 text-xs">
                {setting.key}
              </td>
              <td className="px-4 py-2.5">
                {editingKey === setting.key ? (
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
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-zinc-900">Settings</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Extension Token */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-zinc-900">Chrome Extension</h2>
            <p className="text-xs text-zinc-500 mt-0.5">API token for the Chrome Extension to connect to JobHQ</p>
          </div>
          <div className="flex items-center gap-2">
            {(hasToken || generatedToken) && (
              <button
                onClick={handleRevokeToken}
                disabled={tokenLoading}
                className="px-3 py-1.5 text-sm font-medium border border-red-300 text-red-700 rounded-md hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                Revoke
              </button>
            )}
            <button
              onClick={handleGenerateToken}
              disabled={tokenLoading}
              className="px-3 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {tokenLoading ? 'Working...' : hasToken || generatedToken ? 'Regenerate Token' : 'Generate Token'}
            </button>
          </div>
        </div>
        {generatedToken && tokenVisible && (
          <div className="bg-zinc-50 border border-zinc-200 rounded-md p-3 space-y-2">
            <p className="text-xs text-zinc-600">Copy this token to your Chrome Extension settings. It will only be shown once.</p>
            <div className="flex gap-2">
              <code className="flex-1 bg-white border border-zinc-300 rounded px-3 py-2 text-xs font-mono text-zinc-900 break-all select-all">
                {generatedToken}
              </code>
              <button
                onClick={() => {
                  if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(generatedToken);
                  } else {
                    const ta = document.createElement('textarea');
                    ta.value = generatedToken;
                    ta.style.position = 'fixed';
                    ta.style.left = '-9999px';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                  }
                }}
                className="px-3 py-2 text-xs font-medium border border-zinc-300 rounded hover:bg-zinc-100 transition-colors whitespace-nowrap"
              >
                Copy
              </button>
            </div>
          </div>
        )}
        {!generatedToken && hasToken && (
          <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">Token is configured. Regenerate to get a new one.</p>
        )}
        <div className="flex items-center gap-3 pt-2 border-t border-zinc-100">
          <a
            href="/api/extension/download"
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-zinc-300 rounded-md hover:bg-zinc-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Download Extension
          </a>
          <span className="text-xs text-zinc-500">Load in Chrome: chrome://extensions → Developer mode → Load unpacked</span>
        </div>
      </div>

      {/* Database Export */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-zinc-900">Database</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Download a full copy of the SQLite database</p>
          </div>
          <a
            href="/api/export/database"
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-zinc-300 rounded-md hover:bg-zinc-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Download Database
          </a>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-3">
        <div>
          <h2 className="font-semibold text-zinc-900">Change Password</h2>
          <p className="text-xs text-zinc-500 mt-0.5">All sessions will be invalidated after changing password</p>
        </div>
        {pwResult && (
          <p className={`text-sm ${pwResult.ok ? 'text-green-700' : 'text-red-700'}`}>
            {pwResult.msg}
          </p>
        )}
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-zinc-600 mb-1">Current Password</label>
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full border border-zinc-300 rounded px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-zinc-600 mb-1">New Password (min 8)</label>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              minLength={8}
              className="w-full border border-zinc-300 rounded px-3 py-1.5 text-sm"
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={pwChanging || !currentPw || newPw.length < 8}
            className="px-4 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {pwChanging ? 'Changing...' : 'Change'}
          </button>
        </div>
      </div>

      {/* JSearch (Google Jobs) */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-zinc-900">JSearch (Google Jobs)</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Fetch jobs from Google Jobs via{' '}
              <a href="https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                RapidAPI
              </a>
              {' '}— free tier: 500 req/month
            </p>
          </div>
          <button
            onClick={handleJsearchToggle}
            disabled={jsearchToggling}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${jsearchEnabled ? 'bg-green-500' : 'bg-zinc-300'} ${jsearchToggling ? 'opacity-50' : ''}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${jsearchEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {jsearchEnabled && (
          <div className="space-y-2 pt-2 border-t border-zinc-100">
            <label className="text-xs font-medium text-zinc-600">RapidAPI Key</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={jsearchKeyVisible ? 'text' : 'password'}
                  value={jsearchApiKey}
                  onChange={(e) => setJsearchApiKey(e.target.value)}
                  className="w-full border border-zinc-300 rounded px-3 py-1.5 text-sm font-mono pr-16"
                  placeholder="Enter your RapidAPI key..."
                />
                <button
                  type="button"
                  onClick={() => setJsearchKeyVisible(!jsearchKeyVisible)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-700"
                >
                  {jsearchKeyVisible ? 'Hide' : 'Show'}
                </button>
              </div>
              <button
                onClick={handleJsearchKeySave}
                disabled={jsearchKeySaving}
                className="px-3 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                {jsearchKeySaving ? 'Saving...' : 'Save'}
              </button>
              {jsearchKeySaved && <span className="self-center text-xs text-green-600">Saved</span>}
            </div>
            <p className="text-xs text-zinc-400">
              Used by <code className="bg-zinc-100 px-1 rounded">scripts/fetch-jsearch.ts</code> when <code className="bg-zinc-100 px-1 rounded">RAPIDAPI_KEY</code> env var is not set
            </p>
          </div>
        )}
      </div>

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

      {/* Categorized settings sections */}
      {SETTING_SECTIONS.filter((s) => !s.crawlerOnly || enableCrawler).map((section) => {
        const sectionSettings = section.keys
          .map((key) => settings.find((s) => s.key === key))
          .filter((s): s is Setting => s !== undefined);
        if (sectionSettings.length === 0) return null;
        return (
          <div key={section.id} className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-zinc-200 bg-zinc-50">
              <h2 className="text-sm font-semibold text-zinc-700">{section.label}</h2>
            </div>
            {renderSettingsTable(sectionSettings)}
          </div>
        );
      })}

      {/* Uncategorized settings */}
      {uncategorizedSettings.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-200 bg-zinc-50">
            <h2 className="text-sm font-semibold text-zinc-700">Other</h2>
          </div>
          {renderSettingsTable(uncategorizedSettings)}
        </div>
      )}
    </div>
  );
}
