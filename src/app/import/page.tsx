'use client';

import { useState } from 'react';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface ParsedJob {
  title: string;
  company_name: string;
  location: string[];
  salary_min?: number | null;
  salary_max?: number | null;
  work_mode?: string | null;
  jd_url?: string | null;
  source: string;
  rule_result?: {
    action: string;
    matchedRules: Array<{ id: number; name: string; action: string }>;
    reason?: string;
  };
  dedup_result?: {
    isDuplicate: boolean;
    matchType: string | null;
    matchedJobId?: number;
  };
  selected?: boolean;
}

async function fetchApi<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(url, options);
  return res.json();
}

export default function ImportPage() {
  return (
    <div className="space-y-8">
      <ImportSection />
      <hr className="border-zinc-200" />
      <SeedSection />
    </div>
  );
}

function ImportSection() {
  const [mode, setMode] = useState<'normal' | 'viewall'>('normal');
  const [companyName, setCompanyName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [parsedJobs, setParsedJobs] = useState<ParsedJob[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [parseLoading, setParseLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleParse() {
    setParseLoading(true);
    setError(null);
    setResult(null);
    setParsedJobs([]);
    setSelectedIndices(new Set());

    try {
      const body: Record<string, unknown> = { text: pasteText };
      if (mode === 'viewall' && companyName.trim()) {
        body.company_name = companyName.trim();
      }
      body.mode = mode;

      const res = await fetchApi<{ items: ParsedJob[]; warnings: string[] }>('/api/import/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.success) throw new Error(res.error || 'Parse failed');

      const items = res.data?.items || [];
      setParsedJobs(items);

      // Auto-select non-duplicate, non-excluded jobs
      const autoSelect = new Set<number>();
      items.forEach((job, i) => {
        const isDup = job.dedup_result?.isDuplicate;
        const isExcluded = job.rule_result?.action === 'exclude';
        if (!isDup && !isExcluded) autoSelect.add(i);
      });
      setSelectedIndices(autoSelect);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParseLoading(false);
    }
  }

  async function handleImport() {
    setImportLoading(true);
    setError(null);
    setResult(null);

    try {
      const selectedJobs = parsedJobs.filter((_, i) => selectedIndices.has(i));
      const res = await fetchApi<{ imported: number; total: number }>('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selectedJobs }),
      });
      if (!res.success) throw new Error(res.error || 'Import failed');
      setResult(`Imported ${res.data?.imported || 0} of ${res.data?.total || 0} jobs`);
      setParsedJobs([]);
      setSelectedIndices(new Set());
      setPasteText('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImportLoading(false);
    }
  }

  function toggleSelect(index: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIndices.size === parsedJobs.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(parsedJobs.map((_, i) => i)));
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-zinc-900">Import Jobs</h1>

      {/* Mode toggle */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              checked={mode === 'normal'}
              onChange={() => setMode('normal')}
              className="text-zinc-900"
            />
            Normal
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              checked={mode === 'viewall'}
              onChange={() => setMode('viewall')}
              className="text-zinc-900"
            />
            View All (single company)
          </label>
        </div>

        {mode === 'viewall' && (
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Company name..."
            className="border border-zinc-300 rounded-md px-3 py-1.5 text-sm w-full max-w-md"
          />
        )}

        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={10}
          className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm text-zinc-900 font-mono resize-y"
          placeholder="Paste job listings here..."
        />

        <div className="flex items-center gap-3">
          <button
            onClick={handleParse}
            disabled={parseLoading || !pasteText.trim()}
            className="px-4 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {parseLoading ? 'Parsing...' : 'Parse'}
          </button>
        </div>
      </div>

      {/* Preview table */}
      {parsedJobs.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-lg">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-900">
              Parsed Jobs ({parsedJobs.length}) &mdash; {selectedIndices.size} selected
            </h2>
            <button
              onClick={handleImport}
              disabled={importLoading || selectedIndices.size === 0}
              className="px-4 py-1.5 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {importLoading ? 'Importing...' : `Import ${selectedIndices.size} Selected`}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="text-left px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIndices.size === parsedJobs.length}
                      onChange={toggleAll}
                      className="rounded border-zinc-300"
                    />
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-zinc-600">Company</th>
                  <th className="text-left px-4 py-2 font-medium text-zinc-600">Title</th>
                  <th className="text-left px-4 py-2 font-medium text-zinc-600">Location</th>
                  <th className="text-left px-4 py-2 font-medium text-zinc-600">Rules</th>
                  <th className="text-left px-4 py-2 font-medium text-zinc-600">Dedup</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {parsedJobs.map((job, i) => {
                  const isDup = job.dedup_result?.isDuplicate;
                  const ruleAction = job.rule_result?.action || 'pass';
                  const rowClass = isDup
                    ? 'bg-zinc-50 opacity-60'
                    : ruleAction === 'exclude'
                      ? 'bg-red-50 opacity-60'
                      : ruleAction === 'flag'
                        ? 'bg-yellow-50'
                        : '';
                  return (
                    <tr key={i} className={`${rowClass} hover:bg-zinc-50`}>
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIndices.has(i)}
                          onChange={() => toggleSelect(i)}
                          className="rounded border-zinc-300"
                        />
                      </td>
                      <td className="px-4 py-2 text-zinc-600">{job.company_name}</td>
                      <td className="px-4 py-2 text-zinc-900">{job.title}</td>
                      <td className="px-4 py-2 text-zinc-600">
                        {job.location?.join(', ') || '--'}
                      </td>
                      <td className="px-4 py-2">
                        {ruleAction !== 'pass' ? (
                          <span
                            className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                              ruleAction === 'exclude'
                                ? 'bg-red-100 text-red-700'
                                : ruleAction === 'flag'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-green-100 text-green-700'
                            }`}
                            title={job.rule_result?.matchedRules?.map((r) => r.name).join(', ')}
                          >
                            {ruleAction}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">pass</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {isDup ? (
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">
                            dup ({job.dedup_result?.matchType})
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">new</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
          {result}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}

function SeedSection() {
  const [seedText, setSeedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setSeedText(text);
  }

  async function handleImportSeed() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let data: unknown;
      try {
        data = JSON.parse(seedText);
      } catch {
        throw new Error('Invalid JSON');
      }

      const res = await fetchApi<{ imported: number }>('/api/import/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.success) throw new Error(res.error || 'Seed import failed');
      setResult(`Seed import complete: ${res.data?.imported || 0} items imported`);
      setSeedText('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-zinc-900">Import Seed Data</h2>

      <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3">
        <div>
          <label className="block text-sm text-zinc-600 mb-1">Upload JSON file</label>
          <input
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            className="text-sm text-zinc-600"
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-600 mb-1">Or paste JSON</label>
          <textarea
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            rows={6}
            className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm text-zinc-900 font-mono resize-y"
            placeholder='{"companies": [...], "jobs": [...]}'
          />
        </div>

        <button
          onClick={handleImportSeed}
          disabled={loading || !seedText.trim()}
          className="px-4 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Importing...' : 'Import Seed'}
        </button>
      </div>

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
          {result}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}
