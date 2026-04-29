'use client';

import { useState, useEffect } from 'react';
import { StatusBadge } from '@/components/status-badge';
import { JobFilterBar, type FilterParams } from '@/components/job-filter-bar';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: { total: number; page: number; limit: number };
}

interface Company {
  id: number;
  display_name: string;
  info_status: string;
  industry: string | null;
}

interface Job {
  id: number;
  title: string;
  company_display_name: string;
  status: string;
  score: number | null;
}

interface PreviewItem {
  [key: string]: unknown;
}

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

export function CompaniesTab() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewStatus, setViewStatus] = useState<'pending' | 'complete'>('pending');
  const [batchSize, setBatchSize] = useState(15);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [parseLoading, setParseLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [splitCount, setSplitCount] = useState(1);
  const [copiedBatches, setCopiedBatches] = useState<Set<number>>(new Set());

  function getChunks(): number[][] {
    const ids = Array.from(selectedIds);
    if (splitCount <= 1) return [ids];
    const chunks: number[][] = [];
    const chunkSize = Math.ceil(ids.length / splitCount);
    for (let i = 0; i < splitCount; i++) {
      const chunk = ids.slice(i * chunkSize, (i + 1) * chunkSize);
      if (chunk.length > 0) chunks.push(chunk);
    }
    return chunks;
  }

  async function handleExportBatch(batchIndex: number, ids: number[]) {
    setError(null);
    try {
      const res = await fetchApi<{ text: string; companyCount: number }>(
        `/api/export/companies?status=${viewStatus}&format=markdown&ids=${ids.join(',')}`
      );
      if (!res.success) throw new Error(res.error || 'Export failed');
      await copyToClipboard(res.data?.text || '');
      setCopiedBatches((prev) => new Set(prev).add(batchIndex));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    setLoading(true);
    setCompanies([]);
    setSelectedIds(new Set());
    const params = viewStatus === 'pending'
      ? 'application_strategy=open&info_status=pending'
      : 'info_status=complete';
    fetchApi<Company[]>(`/api/companies?${params}`)
      .then((res) => {
        if (res.success && res.data) {
          setCompanies(res.data);
          setSelectedIds(new Set(res.data.slice(0, batchSize).map((c) => c.id)));
        }
      })
      .finally(() => setLoading(false));
  }, [batchSize, viewStatus]);

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(companies.slice(0, batchSize).map((c) => c.id)));
    }
  }

  async function handleExport() {
    setCopied(false);
    setError(null);
    try {
      const ids = Array.from(selectedIds).join(',');
      const res = await fetchApi<{ text: string; companyCount: number }>(`/api/export/companies?status=${viewStatus}&format=markdown&ids=${ids}`);
      if (!res.success) throw new Error(res.error || 'Export failed');
      await copyToClipboard(res.data?.text || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleParse() {
    setParseLoading(true);
    setError(null);
    setPreview(null);
    setResult(null);
    try {
      const res = await fetchApi<{ items: PreviewItem[]; warnings: string[] }>('/api/import/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText }),
      });
      if (!res.success) throw new Error(res.error || 'Parse failed');
      setPreview(res.data?.items || []);
      setPreviewWarnings(res.data?.warnings || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParseLoading(false);
    }
  }

  async function handleConfirm() {
    setConfirmLoading(true);
    setError(null);
    try {
      const res = await fetchApi<{ updated: number; merged: number; errors: string[] }>('/api/import/companies/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: preview }),
      });
      if (!res.success) throw new Error(res.error || 'Import failed');
      const mergedMsg = (res.data?.merged ?? 0) > 0 ? `, merged ${res.data!.merged} duplicates` : '';
      const errorsMsg = res.data?.errors?.length ? ` — errors: ${res.data.errors.join('; ')}` : '';
      setResult(`Updated ${res.data?.updated || 0} companies${mergedMsg}${errorsMsg}`);
      setPreview(null);
      setPasteText('');
      setCopied(false);
      setCopiedBatches(new Set());
      // Refresh the list
      const params = viewStatus === 'pending'
        ? 'application_strategy=open&info_status=pending'
        : 'info_status=complete';
      const listRes = await fetchApi<Company[]>(`/api/companies?${params}`);
      if (listRes.success && listRes.data) {
        setCompanies(listRes.data);
        setSelectedIds(new Set(listRes.data.slice(0, batchSize).map((c) => c.id)));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConfirmLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Companies list */}
      <div className="bg-white border border-zinc-200 rounded-lg">
        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-zinc-900">
              {viewStatus === 'pending' ? 'Companies Needing Research' : 'Researched Companies'} ({loading ? '...' : companies.length})
            </h2>
            <div className="flex gap-1 bg-zinc-100 rounded-md p-0.5">
              <button
                onClick={() => setViewStatus('pending')}
                className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                  viewStatus === 'pending' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                Pending
              </button>
              <button
                onClick={() => setViewStatus('complete')}
                className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                  viewStatus === 'complete' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                Complete
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-600">
              Batch:
              <select
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="ml-2 border border-zinc-300 rounded-md px-2 py-1 text-sm bg-white"
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
            <label className="text-sm text-zinc-600">
              Split:
              <select
                value={splitCount}
                onChange={(e) => { setSplitCount(Number(e.target.value)); setCopiedBatches(new Set()); }}
                className="ml-2 border border-zinc-300 rounded-md px-2 py-1 text-sm bg-white"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
              </select>
            </label>
            {splitCount <= 1 ? (
              <button
                onClick={handleExport}
                disabled={selectedIds.size === 0}
                className="px-3 py-1.5 text-sm font-medium border border-zinc-300 rounded-md hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {copied ? 'Copied!' : `Export ${selectedIds.size} to Clipboard`}
              </button>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {getChunks().map((chunk, i) => (
                  <button
                    key={i}
                    onClick={() => handleExportBatch(i, chunk)}
                    disabled={chunk.length === 0}
                    className={`px-3 py-1.5 text-sm font-medium border rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      copiedBatches.has(i)
                        ? 'border-green-300 bg-green-50 text-green-700'
                        : 'border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    {copiedBatches.has(i) ? `#${i + 1} Copied` : `#${i + 1} (${chunk.length})`}
                  </button>
                ))}
                {copiedBatches.size > 0 && (
                  <span className="text-xs text-zinc-500">{copiedBatches.size}/{getChunks().length}</span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="text-left px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === companies.length && companies.length > 0}
                    onChange={toggleAll}
                    className="rounded border-zinc-300"
                  />
                </th>
                <th className="text-left px-4 py-2 font-medium text-zinc-600">Company</th>
                <th className="text-left px-4 py-2 font-medium text-zinc-600">Industry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-zinc-400">Loading...</td>
                </tr>
              )}
              {!loading && companies.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-zinc-400">
                    No companies pending research
                  </td>
                </tr>
              )}
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                      className="rounded border-zinc-300"
                    />
                  </td>
                  <td className="px-4 py-2 text-zinc-900">{c.display_name}</td>
                  <td className="px-4 py-2 text-zinc-400">{c.industry || 'Unknown industry'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Parse section */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-zinc-900">Import Research Results</h2>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={8}
          className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm text-zinc-900 font-mono resize-y"
          placeholder="Paste research results here..."
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

      {/* Warnings */}
      {previewWarnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-yellow-800 mb-2">Warnings</h3>
          <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
            {previewWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview */}
      {preview && preview.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-lg">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-900">Preview ({preview.length} items)</h2>
            <button
              onClick={handleConfirm}
              disabled={confirmLoading}
              className="px-4 py-1.5 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {confirmLoading ? 'Importing...' : 'Confirm Import'}
            </button>
          </div>
          <div className="divide-y divide-zinc-100 max-h-80 overflow-y-auto">
            {preview.map((item, i) => (
              <div key={i} className="px-4 py-2 text-sm">
                <pre className="text-zinc-700 whitespace-pre-wrap text-xs">
                  {JSON.stringify(item, null, 2)}
                </pre>
              </div>
            ))}
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

export function JobsTab() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchSize, setBatchSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [parseLoading, setParseLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [splitCount, setSplitCount] = useState(1);
  const [copiedBatches, setCopiedBatches] = useState<Set<number>>(new Set());
  const [includeUnresearched, setIncludeUnresearched] = useState(false);
  const [hiddenCount, setHiddenCount] = useState(0);

  function getChunks(): number[][] {
    const ids = Array.from(selectedIds);
    if (splitCount <= 1) return [ids];
    const chunks: number[][] = [];
    const chunkSize = Math.ceil(ids.length / splitCount);
    for (let i = 0; i < splitCount; i++) {
      const chunk = ids.slice(i * chunkSize, (i + 1) * chunkSize);
      if (chunk.length > 0) chunks.push(chunk);
    }
    return chunks;
  }

  async function handleExportBatch(batchIndex: number, ids: number[]) {
    setError(null);
    try {
      const res = await fetchApi<{ text: string; jobCount: number }>(
        `/api/export/evaluate?status=pending_eval&format=markdown&ids=${ids.join(',')}&limit=${ids.length}`
      );
      if (!res.success) throw new Error(res.error || 'Export failed');
      await copyToClipboard(res.data?.text || '');
      setCopiedBatches((prev) => new Set(prev).add(batchIndex));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    setLoading(true);
    const infoFilter = includeUnresearched ? '' : '&company_info_status=complete';
    const fetches: Promise<unknown>[] = [
      fetchApi<Job[]>(`/api/jobs?status=pending_eval&limit=${batchSize}${infoFilter}`)
        .then((res) => {
          if (res.success && res.data) {
            setJobs(res.data);
            setSelectedIds(new Set(res.data.map((j) => j.id)));
          }
        }),
    ];
    if (!includeUnresearched) {
      // Fetch total pending_eval count to show how many are hidden
      fetches.push(
        Promise.all([
          fetchApi<Job[]>(`/api/jobs?status=pending_eval&limit=1`),
          fetchApi<Job[]>(`/api/jobs?status=pending_eval&limit=1&company_info_status=complete`),
        ]).then(([allRes, filteredRes]) => {
          const allTotal = (allRes as { meta?: { total: number } }).meta?.total ?? 0;
          const filteredTotal = (filteredRes as { meta?: { total: number } }).meta?.total ?? 0;
          setHiddenCount(allTotal - filteredTotal);
        })
      );
    } else {
      setHiddenCount(0);
    }
    Promise.all(fetches).finally(() => setLoading(false));
  }, [batchSize, includeUnresearched]);

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === jobs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(jobs.map((j) => j.id)));
    }
  }

  async function handleExport() {
    setCopied(false);
    setError(null);
    try {
      const ids = Array.from(selectedIds).join(',');
      const res = await fetchApi<{ text: string; jobCount: number }>(`/api/export/evaluate?status=pending_eval&format=markdown&ids=${ids}&limit=${batchSize}`);
      if (!res.success) throw new Error(res.error || 'Export failed');
      await copyToClipboard(res.data?.text || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleParse() {
    setParseLoading(true);
    setError(null);
    setPreview(null);
    setResult(null);
    try {
      const res = await fetchApi<{ items: PreviewItem[]; warnings: string[] }>('/api/import/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText }),
      });
      if (!res.success) throw new Error(res.error || 'Parse failed');
      setPreview(res.data?.items || []);
      setPreviewWarnings(res.data?.warnings || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParseLoading(false);
    }
  }

  async function handleConfirm() {
    setConfirmLoading(true);
    setError(null);
    try {
      const res = await fetchApi<{ imported: number }>('/api/import/evaluate/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: preview }),
      });
      if (!res.success) throw new Error(res.error || 'Import failed');
      setResult(`Imported evaluations for ${res.data?.imported || 0} jobs`);
      setPreview(null);
      setPasteText('');
      setCopied(false);
      setCopiedBatches(new Set());
      // Refresh the list
      const infoFilter = includeUnresearched ? '' : '&company_info_status=complete';
      const listRes = await fetchApi<Job[]>(`/api/jobs?status=pending_eval&limit=${batchSize}${infoFilter}`);
      if (listRes.success && listRes.data) {
        setJobs(listRes.data);
        setSelectedIds(new Set(listRes.data.map((j) => j.id)));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConfirmLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Company research warning */}
      {hiddenCount > 0 && !includeUnresearched && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-sm text-amber-800">
            <span className="font-medium">{hiddenCount} jobs hidden</span> — their companies haven&apos;t been researched yet.{' '}
            <a href="/workspace?tab=companies" className="text-amber-700 underline hover:text-amber-900">Research Companies →</a>
          </div>
          <button
            onClick={() => setIncludeUnresearched(true)}
            className="text-xs text-amber-700 border border-amber-300 rounded px-2 py-1 hover:bg-amber-100 whitespace-nowrap"
          >
            Show all
          </button>
        </div>
      )}
      {/* Pending jobs */}
      <div className="bg-white border border-zinc-200 rounded-lg">
        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-semibold text-zinc-900">
            Jobs Pending Evaluation ({loading ? '...' : jobs.length})
            {includeUnresearched && (
              <button
                onClick={() => setIncludeUnresearched(false)}
                className="ml-2 text-xs font-normal text-amber-600 hover:underline"
              >
                Hide unresearched
              </button>
            )}
          </h2>
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-600">
              Batch:
              <select
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="ml-2 border border-zinc-300 rounded-md px-2 py-1 text-sm bg-white"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </label>
            <label className="text-sm text-zinc-600">
              Split:
              <select
                value={splitCount}
                onChange={(e) => { setSplitCount(Number(e.target.value)); setCopiedBatches(new Set()); }}
                className="ml-2 border border-zinc-300 rounded-md px-2 py-1 text-sm bg-white"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
              </select>
            </label>
            {splitCount <= 1 ? (
              <button
                onClick={handleExport}
                disabled={selectedIds.size === 0}
                className="px-3 py-1.5 text-sm font-medium border border-zinc-300 rounded-md hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {copied ? 'Copied!' : `Export ${selectedIds.size} to Clipboard`}
              </button>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {getChunks().map((chunk, i) => (
                  <button
                    key={i}
                    onClick={() => handleExportBatch(i, chunk)}
                    disabled={chunk.length === 0}
                    className={`px-3 py-1.5 text-sm font-medium border rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      copiedBatches.has(i)
                        ? 'border-green-300 bg-green-50 text-green-700'
                        : 'border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    {copiedBatches.has(i) ? `#${i + 1} Copied` : `#${i + 1} (${chunk.length})`}
                  </button>
                ))}
                {copiedBatches.size > 0 && (
                  <span className="text-xs text-zinc-500">{copiedBatches.size}/{getChunks().length}</span>
                )}
              </div>
            )}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="text-left px-4 py-2">
                <input
                  type="checkbox"
                  checked={selectedIds.size === jobs.length && jobs.length > 0}
                  onChange={toggleAll}
                  className="rounded border-zinc-300"
                />
              </th>
              <th className="text-left px-4 py-2 font-medium text-zinc-600">Company</th>
              <th className="text-left px-4 py-2 font-medium text-zinc-600">Title</th>
              <th className="text-left px-4 py-2 font-medium text-zinc-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && jobs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                  No jobs pending evaluation
                </td>
              </tr>
            )}
            {jobs.map((job) => (
              <tr key={job.id} className="hover:bg-zinc-50">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(job.id)}
                    onChange={() => toggleSelect(job.id)}
                    className="rounded border-zinc-300"
                  />
                </td>
                <td className="px-4 py-2 text-zinc-600">{job.company_display_name}</td>
                <td className="px-4 py-2 text-zinc-900">{job.title}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={job.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Parse section */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-zinc-900">Import Evaluation Results</h2>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={8}
          className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm text-zinc-900 font-mono resize-y"
          placeholder="Paste evaluation results here..."
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

      {/* Warnings */}
      {previewWarnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-yellow-800 mb-2">Warnings</h3>
          <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
            {previewWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview */}
      {preview && preview.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-lg">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-900">Preview ({preview.length} items)</h2>
            <button
              onClick={handleConfirm}
              disabled={confirmLoading}
              className="px-4 py-1.5 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {confirmLoading ? 'Importing...' : 'Confirm Import'}
            </button>
          </div>
          <div className="divide-y divide-zinc-100 max-h-80 overflow-y-auto">
            {preview.map((item, i) => (
              <div key={i} className="px-4 py-2 text-sm">
                <pre className="text-zinc-700 whitespace-pre-wrap text-xs">
                  {JSON.stringify(item, null, 2)}
                </pre>
              </div>
            ))}
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

export function DeepAnalysisTab() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchSize, setBatchSize] = useState(5);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [parseLoading, setParseLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchApi<Job[]>(`/api/jobs?status=pending_deep_analysis&limit=${batchSize}`)
      .then((res) => {
        if (res.success && res.data) {
          setJobs(res.data);
          setSelectedIds(new Set(res.data.map((j) => j.id)));
        }
      })
      .finally(() => setLoading(false));
  }, [batchSize]);

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === jobs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(jobs.map((j) => j.id)));
    }
  }

  async function handleExport() {
    setCopied(false);
    setError(null);
    try {
      const ids = Array.from(selectedIds).join(',');
      const res = await fetchApi<{ text: string; jobCount: number }>(`/api/export/deep-analysis?ids=${ids}&limit=${batchSize}`);
      if (!res.success) throw new Error(res.error || 'Export failed');
      await copyToClipboard(res.data?.text || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleParse() {
    setParseLoading(true);
    setError(null);
    setPreview(null);
    setResult(null);
    try {
      const res = await fetchApi<{ items: PreviewItem[]; warnings: string[] }>('/api/import/deep-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText }),
      });
      if (!res.success) throw new Error(res.error || 'Parse failed');
      setPreview(res.data?.items || []);
      setPreviewWarnings(res.data?.warnings || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParseLoading(false);
    }
  }

  async function handleConfirm() {
    setConfirmLoading(true);
    setError(null);
    try {
      const res = await fetchApi<{ imported: number; errors: string[] }>('/api/import/deep-analysis/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: preview }),
      });
      if (!res.success) throw new Error(res.error || 'Import failed');
      const errCount = res.data?.errors?.length || 0;
      setResult(`Applied deep analysis to ${res.data?.imported || 0} jobs${errCount > 0 ? ` (${errCount} errors)` : ''}`);
      setPreview(null);
      setPasteText('');
      setCopied(false);
      const listRes = await fetchApi<Job[]>(`/api/jobs?status=pending_deep_analysis&limit=${batchSize}`);
      if (listRes.success && listRes.data) {
        setJobs(listRes.data);
        setSelectedIds(new Set(listRes.data.map((j) => j.id)));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConfirmLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Pending deep analysis jobs */}
      <div className="bg-white border border-zinc-200 rounded-lg">
        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-semibold text-zinc-900">
            Jobs Pending Deep Analysis ({loading ? '...' : jobs.length})
          </h2>
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-600">
              Batch:
              <select
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="ml-2 border border-zinc-300 rounded-md px-2 py-1 text-sm bg-white"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>
            </label>
            <button
              onClick={handleExport}
              disabled={selectedIds.size === 0}
              className="px-3 py-1.5 text-sm font-medium border border-zinc-300 rounded-md hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {copied ? 'Copied!' : `Export ${selectedIds.size} to Clipboard`}
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="text-left px-4 py-2">
                <input
                  type="checkbox"
                  checked={selectedIds.size === jobs.length && jobs.length > 0}
                  onChange={toggleAll}
                  className="rounded border-zinc-300"
                />
              </th>
              <th className="text-left px-4 py-2 font-medium text-zinc-600">Company</th>
              <th className="text-left px-4 py-2 font-medium text-zinc-600">Title</th>
              <th className="text-left px-4 py-2 font-medium text-zinc-600">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && jobs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                  No jobs pending deep analysis
                </td>
              </tr>
            )}
            {jobs.map((job) => (
              <tr key={job.id} className="hover:bg-zinc-50">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(job.id)}
                    onChange={() => toggleSelect(job.id)}
                    className="rounded border-zinc-300"
                  />
                </td>
                <td className="px-4 py-2 text-zinc-600">{job.company_display_name}</td>
                <td className="px-4 py-2 text-zinc-900">{job.title}</td>
                <td className="px-4 py-2 text-zinc-500">{job.score ?? '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Import section */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-zinc-900">Import Deep Analysis Results</h2>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={8}
          className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm text-zinc-900 font-mono resize-y"
          placeholder="Paste deep analysis JSON results here..."
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

      {/* Warnings */}
      {previewWarnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-yellow-800 mb-2">Warnings</h3>
          <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
            {previewWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview */}
      {preview && preview.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-lg">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-900">Preview ({preview.length} items)</h2>
            <button
              onClick={handleConfirm}
              disabled={confirmLoading}
              className="px-4 py-1.5 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {confirmLoading ? 'Importing...' : 'Confirm Import'}
            </button>
          </div>
          <div className="divide-y divide-zinc-100 max-h-80 overflow-y-auto">
            {preview.map((item, i) => (
              <div key={i} className="px-4 py-2 text-sm">
                <pre className="text-zinc-700 whitespace-pre-wrap text-xs">
                  {JSON.stringify(item, null, 2)}
                </pre>
              </div>
            ))}
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

interface MatchedItem {
  company: string;
  title: string;
  rejection_reason: string;
  job_id: number;
  job_title: string;
  job_company: string;
  job_status: string;
}

interface UnmatchedItem {
  company: string;
  title: string;
  rejection_reason: string;
}

export function RejectionsTab() {
  const [days, setDays] = useState(7);
  const [pasteText, setPasteText] = useState('');
  const [matched, setMatched] = useState<MatchedItem[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedItem[]>([]);
  const [selectedUnmatched, setSelectedUnmatched] = useState<Set<number>>(new Set());
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [parseLoading, setParseLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [parsed, setParsed] = useState(false);

  async function handleCopyPrompt() {
    setCopied(false);
    setError(null);
    try {
      const res = await fetchApi<{ text: string }>(`/api/export/rejections?days=${days}`);
      if (!res.success) throw new Error(res.error || 'Failed to get prompt');
      await copyToClipboard(res.data?.text || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleParse() {
    setParseLoading(true);
    setError(null);
    setMatched([]);
    setUnmatched([]);
    setSelectedUnmatched(new Set());
    setParseWarnings([]);
    setResult(null);
    setParsed(false);
    try {
      const res = await fetchApi<{ matched: MatchedItem[]; unmatched: UnmatchedItem[]; warnings: string[] }>('/api/import/rejections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText }),
      });
      if (!res.success) throw new Error(res.error || 'Parse failed');
      setMatched(res.data?.matched || []);
      setUnmatched(res.data?.unmatched || []);
      setSelectedUnmatched(new Set((res.data?.unmatched || []).map((_: UnmatchedItem, i: number) => i)));
      setParseWarnings(res.data?.warnings || []);
      setParsed(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParseLoading(false);
    }
  }

  function toggleUnmatched(idx: number) {
    setSelectedUnmatched((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function handleConfirm() {
    setConfirmLoading(true);
    setError(null);
    try {
      const selectedUnmatchedItems = unmatched.filter((_, i) => selectedUnmatched.has(i));
      const res = await fetchApi<{ updated: number; skipped: number; created: number; errors: string[] }>('/api/import/rejections/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matched, unmatched: selectedUnmatchedItems }),
      });
      if (!res.success) throw new Error(res.error || 'Import failed');
      const parts: string[] = [];
      if (res.data?.updated) parts.push(`${res.data.updated} jobs rejected`);
      if (res.data?.skipped) parts.push(`${res.data.skipped} already rejected`);
      if (res.data?.created) parts.push(`${res.data.created} new jobs created`);
      if (res.data?.errors?.length) parts.push(`${res.data.errors.length} errors`);
      setResult(parts.join(', ') || 'No changes');
      setMatched([]);
      setUnmatched([]);
      setPasteText('');
      setParsed(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConfirmLoading(false);
    }
  }

  const hasResults = matched.length > 0 || unmatched.length > 0;

  return (
    <div className="space-y-4">
      {/* Prompt + Copy */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-semibold text-zinc-900">Step 1: Copy Prompt</h2>
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-600">
              Check last:
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="ml-2 border border-zinc-300 rounded-md px-2 py-1 text-sm bg-white"
              >
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </label>
            <button
              onClick={handleCopyPrompt}
              className="px-3 py-1.5 text-sm font-medium border border-zinc-300 rounded-md hover:bg-zinc-50 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy Prompt'}
            </button>
          </div>
        </div>
        <p className="text-sm text-zinc-500">
          Copy the prompt and paste it to Gemini (with Gmail access). It will scan your inbox for rejection emails and return JSON.
        </p>
      </div>

      {/* Paste JSON */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-zinc-900">Step 2: Paste AI Response</h2>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={8}
          className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm text-zinc-900 font-mono resize-y"
          placeholder={'Paste AI response JSON here, e.g.:\n[{"company": "Google", "title": "SWE", "rejection_reason": "resume"}]'}
        />
        <button
          onClick={handleParse}
          disabled={parseLoading || !pasteText.trim()}
          className="px-4 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {parseLoading ? 'Parsing & Matching...' : 'Parse'}
        </button>
      </div>

      {/* Parse warnings */}
      {parseWarnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-yellow-800 mb-2">Warnings</h3>
          <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
            {parseWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Matched rejections */}
      {parsed && matched.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-lg">
          <div className="px-4 py-3 border-b border-zinc-200">
            <h2 className="font-semibold text-zinc-900">Matched — {matched.length} rejections</h2>
            <p className="text-xs text-zinc-500 mt-1">These rejections matched existing jobs in the system</p>
          </div>
          <div className="divide-y divide-zinc-100 max-h-60 overflow-y-auto">
            {matched.map((item, i) => (
              <div key={i} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-900 font-medium">{item.company}</span>
                    <span className="text-zinc-400">|</span>
                    <span className="text-zinc-600">{item.title}</span>
                  </div>
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
                    {item.rejection_reason}
                  </span>
                </div>
                <div className="mt-1 text-xs text-zinc-400">
                  Matched to: #{item.job_id} {item.job_title} @ {item.job_company}
                  <StatusBadge status={item.job_status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unmatched rejections */}
      {parsed && unmatched.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-lg">
          <div className="px-4 py-3 border-b border-zinc-200">
            <h2 className="font-semibold text-zinc-900">Unmatched — {unmatched.length} rejections</h2>
            <p className="text-xs text-zinc-500 mt-1">These rejections did not match any existing job. Check the ones you want to create as new rejected jobs.</p>
          </div>
          <div className="divide-y divide-zinc-100 max-h-60 overflow-y-auto">
            {unmatched.map((item, i) => (
              <div key={i} className="px-4 py-3 text-sm flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedUnmatched.has(i)}
                  onChange={() => toggleUnmatched(i)}
                  className="rounded border-zinc-300"
                />
                <div className="flex-1 flex items-center justify-between">
                  <div>
                    <span className="text-zinc-900 font-medium">{item.company}</span>
                    <span className="mx-2 text-zinc-400">|</span>
                    <span className="text-zinc-600">{item.title}</span>
                  </div>
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
                    {item.rejection_reason}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No results */}
      {parsed && !hasResults && parseWarnings.length === 0 && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 text-sm text-zinc-500 text-center">
          No rejection emails found
        </div>
      )}

      {/* Confirm */}
      {parsed && hasResults && (
        <div className="flex justify-end">
          <button
            onClick={handleConfirm}
            disabled={confirmLoading || (matched.length === 0 && selectedUnmatched.size === 0)}
            className="px-4 py-1.5 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {confirmLoading ? 'Processing...' : `Confirm Reject (${matched.length + selectedUnmatched.size})`}
          </button>
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

// ── Auto Eval Log Tab ───────────────────────────────────────────────

interface LogEntry {
  id: number;
  run_type: string;
  entity_type: string | null;
  entity_id: number | null;
  entity_name: string | null;
  status: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
  result_summary: string | null;
  created_at: string;
}

interface LogSummary {
  today_count: number;
  today_cost: number;
  today_input_tokens: number;
  today_output_tokens: number;
  today_success: number;
  today_failed: number;
}

interface RecheckJob {
  id: number;
  title: string;
  company_display_name: string;
  status: string;
  score: number | null;
  score_success: number | null;
  score_reason: string | null;
  created_at: string;
  posted_at: string | null;
}

interface RecheckPreviewItem {
  id: number;
  score_success: number;
  daily_work_summary: string;
  must_haves_match: string[];
  must_haves_gap: string[];
  reason: string;
}

export function RecheckTab() {
  const [jobs, setJobs] = useState<RecheckJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filterParams, setFilterParams] = useState<FilterParams>({
    sort: 'score_success', order: 'DESC',
    sort2: 'score', order2: 'DESC',
  });
  const [batchSize, setBatchSize] = useState(3);
  const [copiedBatches, setCopiedBatches] = useState<Set<number>>(new Set());
  const [exportMode, setExportMode] = useState<'recheck' | 'eval'>('recheck');
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState<RecheckPreviewItem[] | null>(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function buildFetchUrl(fp: FilterParams) {
    const p = new URLSearchParams({
      status: 'ready_to_apply',
      score_success_min: '4',
      score_success_max: '6',
      exclude_rechecked: '1',
      sort: fp.sort,
      order: fp.order,
      limit: '30',
    });
    if (fp.q) p.set('q', fp.q);
    if (fp.sort2) { p.set('sort2', fp.sort2); p.set('order2', fp.order2 || 'DESC'); }
    if (fp.sort3) { p.set('sort3', fp.sort3); p.set('order3', fp.order3 || 'DESC'); }
    if (fp.tags) p.set('tags', fp.tags);
    if (fp.excludeTags) p.set('exclude_tags', fp.excludeTags);
    if (fp.createdAfter) p.set('created_after', fp.createdAfter);
    return `/api/jobs?${p.toString()}`;
  }

  function fetchJobs(fp: FilterParams) {
    setLoading(true);
    setCopiedBatches(new Set());
    fetchApi<RecheckJob[]>(buildFetchUrl(fp))
      .then((res) => {
        if (res.success && res.data) {
          setJobs(res.data);
          setSelectedIds(new Set(res.data.map((j) => j.id)));
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchJobs(filterParams); }, []);

  function handleFilterChange(params: FilterParams) {
    setFilterParams(params);
    fetchJobs(params);
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === jobs.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(jobs.map((j) => j.id)));
  }

  function getChunks(): number[][] {
    const ids = Array.from(selectedIds);
    if (batchSize <= 0 || ids.length <= batchSize) return [ids];
    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += batchSize) {
      chunks.push(ids.slice(i, i + batchSize));
    }
    return chunks;
  }

  async function handleExportBatch(batchIndex: number, ids: number[]) {
    setError(null);
    try {
      const endpoint = exportMode === 'recheck'
        ? `/api/export/recheck?ids=${ids.join(',')}`
        : `/api/export/evaluate?format=markdown&ids=${ids.join(',')}&limit=${ids.length}`;
      const res = await fetchApi<{ text: string }>(endpoint);
      if (!res.success) throw new Error(res.error || 'Export failed');
      await copyToClipboard(res.data?.text || '');
      setCopiedBatches((prev) => new Set(prev).add(batchIndex));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleParse() {
    setParseLoading(true);
    setError(null);
    setPreview(null);
    setResult(null);
    try {
      const res = await fetchApi<{ items: RecheckPreviewItem[]; warnings: string[] }>('/api/import/recheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText }),
      });
      if (!res.success) throw new Error(res.error || 'Parse failed');
      setPreview(res.data?.items || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParseLoading(false);
    }
  }

  async function handleConfirm() {
    setConfirmLoading(true);
    setError(null);
    try {
      const res = await fetchApi<{ updated: number; upgraded: number; downgraded: number }>('/api/import/recheck', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: preview }),
      });
      if (!res.success) throw new Error(res.error || 'Import failed');
      const d = res.data!;
      setResult(`Applied ${d.updated} recheck results (${d.upgraded} upgraded, ${d.downgraded} downgraded)`);
      setPreview(null);
      setPasteText('');
      setCopiedBatches(new Set());
      fetchJobs(filterParams);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConfirmLoading(false);
    }
  }

  const chunks = getChunks();
  function getDecision(item: RecheckPreviewItem): 'upgrade' | 'keep' | 'downgrade' {
    if (item.score_success >= 7) return 'upgrade';
    if (item.score_success <= 3) return 'downgrade';
    return 'keep';
  }
  function getOriginalScore(id: number): number {
    return jobs.find((j) => j.id === id)?.score_success ?? 5;
  }
  const decisionIcon = (d: string) => d === 'upgrade' ? '↑' : d === 'downgrade' ? '↓' : '→';
  const decisionColor = (d: string) => d === 'upgrade' ? 'text-green-600' : d === 'downgrade' ? 'text-red-600' : 'text-zinc-500';

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <JobFilterBar
        initialSort="score_success"
        initialOrder="DESC"
        initialSort2="score"
        initialOrder2="DESC"
        onChange={handleFilterChange}
        hideStatusFilter
      />

      {/* Borderline jobs list */}
      <div className="bg-white border border-zinc-200 rounded-lg">
        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-semibold text-zinc-900">
            Borderline Jobs — score_success 4-6 ({loading ? '...' : jobs.length})
          </h2>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Export mode */}
            <label className="text-sm text-zinc-600">
              Export:
              <select
                value={exportMode}
                onChange={(e) => {
                  const mode = e.target.value as 'recheck' | 'eval';
                  setExportMode(mode);
                  setBatchSize(mode === 'recheck' ? 3 : 5);
                  setCopiedBatches(new Set());
                }}
                className="ml-1 border border-zinc-300 rounded-md px-2 py-1 text-sm bg-white"
              >
                <option value="recheck">Recheck</option>
                <option value="eval">Re-evaluate</option>
              </select>
            </label>
            {/* Batch size */}
            <label className="text-sm text-zinc-600">
              Batch size:
              <select
                value={batchSize}
                onChange={(e) => { setBatchSize(Number(e.target.value)); setCopiedBatches(new Set()); }}
                className="ml-1 border border-zinc-300 rounded-md px-2 py-1 text-sm bg-white"
              >
                <option value={1}>1</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
              </select>
            </label>
            {/* Export batch buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {chunks.map((chunk, i) => (
                <button
                  key={i}
                  onClick={() => handleExportBatch(i, chunk)}
                  disabled={chunk.length === 0}
                  className={`px-2.5 py-1 text-sm font-medium border rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    copiedBatches.has(i) ? 'border-green-300 bg-green-50 text-green-700' : 'border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  {copiedBatches.has(i) ? `#${i + 1} ✓` : `#${i + 1} (${chunk.length})`}
                </button>
              ))}
              {chunks.length > 1 && copiedBatches.size > 0 && (
                <span className="text-xs text-zinc-500">{copiedBatches.size}/{chunks.length}</span>
              )}
            </div>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="text-left px-4 py-2">
                <input type="checkbox" checked={selectedIds.size === jobs.length && jobs.length > 0} onChange={toggleAll} className="rounded border-zinc-300" />
              </th>
              <th className="text-left px-4 py-2 font-medium text-zinc-600">Date</th>
              <th className="text-left px-4 py-2 font-medium text-zinc-600">Company</th>
              <th className="text-left px-4 py-2 font-medium text-zinc-600">Title</th>
              <th className="text-left px-4 py-2 font-medium text-zinc-600">Score</th>
              <th className="text-left px-4 py-2 font-medium text-zinc-600">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-400">Loading...</td></tr>
            )}
            {!loading && jobs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-400">No borderline jobs to recheck</td></tr>
            )}
            {jobs.map((job) => (
              <tr key={job.id} className="hover:bg-zinc-50">
                <td className="px-4 py-2">
                  <input type="checkbox" checked={selectedIds.has(job.id)} onChange={() => toggleSelect(job.id)} className="rounded border-zinc-300" />
                </td>
                <td className="px-4 py-2 text-zinc-500 text-xs whitespace-nowrap">{(job.posted_at || job.created_at).slice(5, 10)}</td>
                <td className="px-4 py-2 text-zinc-600">{job.company_display_name}</td>
                <td className="px-4 py-2 text-zinc-900">{job.title}</td>
                <td className="px-4 py-2 text-zinc-600 font-mono">{job.score}/{job.score_success}</td>
                <td className="px-4 py-2 text-zinc-500 text-xs max-w-xs truncate">{job.score_reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Import section */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-zinc-900">Import Recheck Results</h2>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={6}
          className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm text-zinc-900 font-mono resize-y"
          placeholder="Paste recheck JSON results here..."
        />
        <button
          onClick={handleParse}
          disabled={parseLoading || !pasteText.trim()}
          className="px-4 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {parseLoading ? 'Parsing...' : 'Parse'}
        </button>
      </div>

      {/* Preview */}
      {preview && preview.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-lg">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-900">Preview ({preview.length} items)</h2>
            <button
              onClick={handleConfirm}
              disabled={confirmLoading}
              className="px-4 py-1.5 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {confirmLoading ? 'Applying...' : 'Confirm Apply'}
            </button>
          </div>
          <div className="divide-y divide-zinc-100 max-h-96 overflow-y-auto">
            {preview.map((item, i) => (
              <div key={i} className="px-4 py-3 text-sm space-y-1">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-zinc-600">#{item.id}</span>
                  <span className={`font-medium ${decisionColor(getDecision(item))}`}>
                    {decisionIcon(getDecision(item))} {getDecision(item)}
                  </span>
                  <span className="font-mono text-zinc-500">{getOriginalScore(item.id)} → {item.score_success}</span>
                </div>
                <p className="text-zinc-700 text-xs">{item.daily_work_summary}</p>
                <p className="text-zinc-500 text-xs">{item.reason}</p>
                {item.must_haves_gap.length > 0 && (
                  <p className="text-red-600 text-xs">Gaps: {item.must_haves_gap.join(', ')}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {result && <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">{result}</div>}
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">{error}</div>}
    </div>
  );
}

const PHASE_KEYS = [
  { key: 'auto_eval_company', label: 'Company Research' },
  { key: 'auto_eval_jd_cleanup', label: 'JD Cleanup' },
  { key: 'auto_eval_job_eval', label: 'Job Evaluation' },
  { key: 'auto_eval_recheck', label: 'Borderline Recheck' },
] as const;

interface WorkerStatus {
  status: 'idle' | 'running';
  mode: 'manual' | 'auto' | null;
  pid: number | null;
  startedAt: string | null;
  pending: { companies: number; jdCleanup: number; jobs: number; recheck?: number };
  ultraMode?: boolean;
}

export function AutoEvalLogTab() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [summary, setSummary] = useState<LogSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [phases, setPhases] = useState<Record<string, boolean>>({});
  const [phasesLoading, setPhasesLoading] = useState(true);

  // Worker control state
  const [worker, setWorker] = useState<WorkerStatus>({ status: 'idle', mode: null, pid: null, startedAt: null, pending: { companies: 0, jdCleanup: 0, jobs: 0 } });
  const [workerLoading, setWorkerLoading] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [ultraMode, setUltraMode] = useState(false);

  // Poll worker status
  useEffect(() => {
    const poll = () => {
      fetchApi<WorkerStatus>('/api/auto-eval/worker').then((res) => {
        if (res.success && res.data) {
          setWorker(res.data);
          setAutoMode(res.data.mode === 'auto');
          setUltraMode(res.data.ultraMode ?? false);
        }
      });
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  // Refresh log entries when worker is running (poll more frequently)
  useEffect(() => {
    if (worker.status !== 'running') return;
    const interval = setInterval(() => {
      const params = new URLSearchParams({ limit: '100' });
      if (filter) params.set('run_type', filter);
      fetchApi<{ entries: LogEntry[]; summary: LogSummary }>(`/api/auto-eval-log?${params}`)
        .then((res) => {
          if (res.success && res.data) {
            setEntries(res.data.entries);
            setSummary(res.data.summary);
          }
        });
    }, 10000);
    return () => clearInterval(interval);
  }, [worker.status, filter]);

  const startWorker = async (mode: 'manual' | 'auto') => {
    setWorkerLoading(true);
    const res = await fetchApi<{ status: string }>('/api/auto-eval/worker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, ultra: ultraMode }),
    });
    if (res.success) {
      // Refresh status after a brief delay to let process start
      setTimeout(() => {
        fetchApi<WorkerStatus>('/api/auto-eval/worker').then((r) => {
          if (r.success && r.data) setWorker(r.data);
          setWorkerLoading(false);
        });
      }, 1000);
    } else {
      setWorkerLoading(false);
    }
  };

  const stopWorker = async () => {
    setWorkerLoading(true);
    await fetchApi('/api/auto-eval/worker', { method: 'DELETE' });
    setAutoMode(false);
    setTimeout(() => {
      fetchApi<WorkerStatus>('/api/auto-eval/worker').then((r) => {
        if (r.success && r.data) setWorker(r.data);
        setWorkerLoading(false);
      });
    }, 1000);
  };

  const toggleUltraMode = async () => {
    const next = !ultraMode;
    if (next) {
      const confirmed = window.confirm(
        '⚠ Ultra mode 将把 Company / JD cleanup / Job eval / QA 四个阶段并发度拉到 3，' +
        '并启用 Opus QA 复评层。\n\n' +
        '预计 token 消耗约为常规模式的 3-5 倍，' +
        '单轮清空完整 backlog 估价 $5-20（视 backlog 大小而定）。\n\n' +
        '确认开启 Ultra mode?'
      );
      if (!confirmed) return;
    }
    setUltraMode(next);
    await fetchApi('/api/auto-eval/worker', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ultra: next }),
    });
  };

  const toggleAutoMode = async () => {
    if (autoMode) {
      // Turning off auto → switch to manual mode (finishes current work, then exits)
      setAutoMode(false);
      setWorkerLoading(true);
      await fetchApi('/api/auto-eval/worker', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'manual' }),
      });
      setTimeout(() => {
        fetchApi<WorkerStatus>('/api/auto-eval/worker').then((r) => {
          if (r.success && r.data) setWorker(r.data);
          setWorkerLoading(false);
        });
      }, 1000);
    } else {
      // Turning on auto → start in auto mode
      setAutoMode(true);
      await startWorker('auto');
    }
  };

  // Load phase toggles
  useEffect(() => {
    Promise.all(
      PHASE_KEYS.map(({ key }) =>
        fetchApi<{ key: string; value: string }>(`/api/settings/${key}`)
          .then((res) => [key, res.success && res.data ? res.data.value !== 'false' : true] as const)
      )
    ).then((results) => {
      setPhases(Object.fromEntries(results));
      setPhasesLoading(false);
    });
  }, []);

  const togglePhase = async (key: string, enabled: boolean) => {
    setPhases((prev) => ({ ...prev, [key]: enabled }));
    await fetchApi(`/api/settings/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: enabled ? 'true' : 'false', description: 'Auto-eval phase toggle' }),
    });
  };

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    if (filter) params.set('run_type', filter);
    fetchApi<{ entries: LogEntry[]; summary: LogSummary }>(`/api/auto-eval-log?${params}`)
      .then((res) => {
        if (res.success && res.data) {
          setEntries(res.data.entries);
          setSummary(res.data.summary);
        }
      })
      .finally(() => setLoading(false));
  }, [filter]);

  const statusIcon = (s: string) => s === 'success' ? '\u2713' : s === 'failed' ? '\u2717' : '-';
  const statusColor = (s: string) => s === 'success' ? 'text-green-600' : s === 'failed' ? 'text-red-600' : 'text-zinc-400';

  const totalPending = worker.pending.companies + worker.pending.jdCleanup + worker.pending.jobs + (worker.pending.recheck || 0);

  return (
    <div className="space-y-4">
      {/* Worker controls */}
      <div className="bg-white border border-zinc-200 rounded-lg p-3">
        <div className="flex items-center gap-4">
          {/* Status indicator */}
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${worker.status === 'running' ? 'bg-green-500 animate-pulse' : 'bg-zinc-300'}`} />
            <span className="text-sm font-medium text-zinc-700">
              {worker.status === 'running'
                ? `Running (${worker.mode})`
                : 'Idle'}
            </span>
          </div>

          {/* Pending counts */}
          {totalPending > 0 && (
            <span className="text-xs text-zinc-500">
              {worker.pending.companies > 0 && `${worker.pending.companies} companies`}
              {worker.pending.companies > 0 && worker.pending.jdCleanup > 0 && ' + '}
              {worker.pending.jdCleanup > 0 && `${worker.pending.jdCleanup} JD cleanup`}
              {(worker.pending.companies > 0 || worker.pending.jdCleanup > 0) && worker.pending.jobs > 0 && ' + '}
              {worker.pending.jobs > 0 && `${worker.pending.jobs} jobs`}
              {(worker.pending.companies > 0 || worker.pending.jdCleanup > 0 || worker.pending.jobs > 0) && (worker.pending.recheck || 0) > 0 && ' + '}
              {(worker.pending.recheck || 0) > 0 && `${worker.pending.recheck} recheck`}
              {' pending'}
            </span>
          )}

          <div className="flex-1" />

          {/* Run Now button */}
          <button
            type="button"
            disabled={workerLoading || worker.status === 'running'}
            onClick={() => startWorker('manual')}
            className="px-3 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {worker.status === 'running' && worker.mode === 'manual' ? 'Running...' : 'Run Now'}
          </button>

          {/* Stop button (only when running) */}
          {worker.status === 'running' && (
            <button
              type="button"
              disabled={workerLoading}
              onClick={stopWorker}
              className="px-3 py-1.5 text-sm font-medium border border-red-300 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Stop
            </button>
          )}

          {/* Auto mode toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <button
              type="button"
              role="switch"
              aria-checked={autoMode}
              disabled={workerLoading}
              onClick={toggleAutoMode}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                autoMode ? 'bg-green-600' : 'bg-zinc-300'
              } ${workerLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                autoMode ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`} />
            </button>
            <span className="text-sm text-zinc-700">Auto</span>
          </label>

          {/* Ultra mode toggle (parallel + QA) */}
          <label className="flex items-center gap-2 cursor-pointer select-none" title="Ultra mode: 3x concurrency + Opus QA review layer. Higher token usage.">
            <button
              type="button"
              role="switch"
              aria-checked={ultraMode}
              onClick={toggleUltraMode}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                ultraMode ? 'bg-purple-600' : 'bg-zinc-300'
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                ultraMode ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`} />
            </button>
            <span className={`text-sm ${ultraMode ? 'text-purple-700 font-medium' : 'text-zinc-700'}`}>
              Ultra{ultraMode ? ' \u26A1' : ''}
            </span>
          </label>
        </div>
      </div>

      {/* Phase toggles */}
      <div className="bg-white border border-zinc-200 rounded-lg p-3 flex items-center gap-6">
        <span className="text-sm font-medium text-zinc-600">Pipeline Phases:</span>
        {phasesLoading ? (
          <span className="text-xs text-zinc-400">Loading...</span>
        ) : (
          PHASE_KEYS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={phases[key] ?? true}
                onClick={() => togglePhase(key, !(phases[key] ?? true))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  (phases[key] ?? true) ? 'bg-blue-600' : 'bg-zinc-300'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  (phases[key] ?? true) ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`} />
              </button>
              <span className="text-sm text-zinc-700">{label}</span>
            </label>
          ))
        )}
      </div>

      {summary && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white border border-zinc-200 rounded-lg p-3">
            <div className="text-xs text-zinc-500">Today Processed</div>
            <div className="text-xl font-semibold text-zinc-900">{summary.today_count}</div>
            <div className="text-xs text-zinc-400">{summary.today_success} ok / {summary.today_failed} failed</div>
          </div>
          <div className="bg-white border border-zinc-200 rounded-lg p-3">
            <div className="text-xs text-zinc-500">Today Cost</div>
            <div className="text-xl font-semibold text-zinc-900">${summary.today_cost.toFixed(2)}</div>
          </div>
          <div className="bg-white border border-zinc-200 rounded-lg p-3">
            <div className="text-xs text-zinc-500">Input Tokens</div>
            <div className="text-xl font-semibold text-zinc-900">{(summary.today_input_tokens / 1000).toFixed(1)}k</div>
          </div>
          <div className="bg-white border border-zinc-200 rounded-lg p-3">
            <div className="text-xs text-zinc-500">Output Tokens</div>
            <div className="text-xl font-semibold text-zinc-900">{(summary.today_output_tokens / 1000).toFixed(1)}k</div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <label className="text-sm text-zinc-600">Filter:</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border border-zinc-300 rounded-md px-2 py-1 text-sm bg-white"
        >
          <option value="">All</option>
          <option value="job_evaluation">Job Evaluation</option>
          <option value="company_research">Company Research</option>
          <option value="worker_start">Worker Start</option>
          <option value="error">Errors</option>
        </select>
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="text-left px-3 py-2 font-medium text-zinc-600">Time</th>
              <th className="text-left px-3 py-2 font-medium text-zinc-600">Type</th>
              <th className="text-left px-3 py-2 font-medium text-zinc-600">Entity</th>
              <th className="text-left px-3 py-2 font-medium text-zinc-600">Status</th>
              <th className="text-left px-3 py-2 font-medium text-zinc-600">Result</th>
              <th className="text-right px-3 py-2 font-medium text-zinc-600">Tokens</th>
              <th className="text-right px-3 py-2 font-medium text-zinc-600">Cost</th>
              <th className="text-right px-3 py-2 font-medium text-zinc-600">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-zinc-400">Loading...</td></tr>
            )}
            {!loading && entries.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-zinc-400">No log entries yet. Start the auto-evaluate worker to see activity.</td></tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-zinc-50">
                <td className="px-3 py-1.5 text-xs text-zinc-500 whitespace-nowrap">
                  {e.created_at.replace('T', ' ').substring(5, 19)}
                </td>
                <td className="px-3 py-1.5">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                    e.run_type === 'job_evaluation' ? 'bg-blue-50 text-blue-700' :
                    e.run_type === 'company_research' ? 'bg-purple-50 text-purple-700' :
                    e.run_type === 'error' ? 'bg-red-50 text-red-700' :
                    'bg-zinc-100 text-zinc-600'
                  }`}>
                    {e.run_type.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-zinc-700 max-w-[250px] truncate" title={e.entity_name || ''}>
                  {e.entity_name || '-'}
                </td>
                <td className={`px-3 py-1.5 font-medium ${statusColor(e.status)}`}>
                  {statusIcon(e.status)} {e.status}
                </td>
                <td className="px-3 py-1.5 text-xs text-zinc-600 max-w-[200px] truncate" title={e.result_summary || ''}>
                  {e.result_summary || '-'}
                </td>
                <td className="px-3 py-1.5 text-right text-xs text-zinc-500 whitespace-nowrap">
                  {e.input_tokens != null ? `${(e.input_tokens / 1000).toFixed(1)}k/${((e.output_tokens ?? 0) / 1000).toFixed(1)}k` : '-'}
                </td>
                <td className="px-3 py-1.5 text-right text-xs text-zinc-500">
                  {e.cost_usd != null ? `$${e.cost_usd.toFixed(3)}` : '-'}
                </td>
                <td className="px-3 py-1.5 text-right text-xs text-zinc-500">
                  {e.duration_ms != null ? `${(e.duration_ms / 1000).toFixed(0)}s` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
