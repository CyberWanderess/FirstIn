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
  const [tab, setTab] = useState<'companies' | 'jobs' | 'deep'>('companies');

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
      </div>

      {tab === 'companies' ? <CompaniesTab /> : tab === 'jobs' ? <JobsTab /> : <DeepAnalysisTab />}
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
      const res = await fetchApi<{ imported: number }>('/api/import/companies/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: preview }),
      });
      if (!res.success) throw new Error(res.error || 'Import failed');
      setResult(`Imported ${res.data?.imported || 0} companies`);
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
            <button
              onClick={handleExport}
              disabled={selectedIds.size === 0}
              className="px-3 py-1.5 text-sm font-medium border border-zinc-300 rounded-md hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {copied ? 'Copied!' : `Export ${selectedIds.size} to Clipboard`}
            </button>
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
