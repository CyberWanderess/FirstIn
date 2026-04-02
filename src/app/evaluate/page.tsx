'use client';

import { useState, useEffect } from 'react';
import { StatusBadge } from '@/components/status-badge';

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

export default function EvaluatePage() {
  const [tab, setTab] = useState<'companies' | 'jobs' | 'deep' | 'rejections'>('companies');

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 bg-white border border-zinc-200 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('companies')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            tab === 'companies'
              ? 'bg-zinc-900 text-white'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
          }`}
        >
          Companies
        </button>
        <button
          onClick={() => setTab('jobs')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            tab === 'jobs'
              ? 'bg-zinc-900 text-white'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
          }`}
        >
          Jobs
        </button>
        <button
          onClick={() => setTab('deep')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            tab === 'deep'
              ? 'bg-zinc-900 text-white'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
          }`}
        >
          Deep Analysis
        </button>
        <button
          onClick={() => setTab('rejections')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            tab === 'rejections'
              ? 'bg-red-600 text-white'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
          }`}
        >
          Rejections
        </button>
      </div>

      {tab === 'companies' ? <CompaniesTab /> : tab === 'jobs' ? <JobsTab /> : tab === 'deep' ? <DeepAnalysisTab /> : <RejectionsTab />}
    </div>
  );
}

function CompaniesTab() {
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

function JobsTab() {
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
    fetchApi<Job[]>(`/api/jobs?status=pending_eval&limit=${batchSize}`)
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
      // Refresh the list
      const listRes = await fetchApi<Job[]>(`/api/jobs?status=pending_eval&limit=${batchSize}`);
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
      {/* Pending jobs */}
      <div className="bg-white border border-zinc-200 rounded-lg">
        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-semibold text-zinc-900">
            Jobs Pending Evaluation ({loading ? '...' : jobs.length})
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

function DeepAnalysisTab() {
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

function RejectionsTab() {
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
          placeholder={'Paste AI response JSON here, e.g.:\n[{"company": "Google", "title": "SWE", "rejection_reason": "简历拒"}]'}
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
