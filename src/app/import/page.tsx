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
  apply_url?: string | null;
  jd_url?: string | null;
  source: string;
  jd_full_text?: string | null;
  notes?: string | null;
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

const PROMPT_SHARED = `
## Output Format

\`\`\`json
{
  "jobs": [
    {
      "title": "Job Title",
      "company_name": "Company Name",
      "location": ["City, State"],
      "salary_min": 100000,
      "salary_max": 150000,
      "work_mode": "remote",
      "commitment": "Full Time",
      "apply_url": "https://company.com/careers/job-123",
      "jd_url": "https://indeed.com/viewjob?jk=abc",
      "source": "indeed",
      "jd_full_text": "Full description if available...",
      "notes": "Any relevant context"
    }
  ]
}
\`\`\`

## Field Guide

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| title | Yes | string | Job title exactly as listed |
| company_name | Yes | string | Company name |
| location | No | string[] | Array of locations, e.g. ["San Francisco, CA", "Remote"] |
| salary_min | No | number | Minimum salary (annual, USD, no commas) |
| salary_max | No | number | Maximum salary (annual, USD, no commas) |
| work_mode | No | string | "remote", "hybrid", or "onsite" |
| commitment | No | string | "Full Time", "Part Time", or "Contract" |
| apply_url | No | string | Direct link to the company's own career page for this job |
| jd_url | No | string | Link to the job on the alert platform (Indeed, LinkedIn, etc) |
| source | No | string | Platform name: "indeed", "linkedin", "glassdoor", etc |
| jd_full_text | No | string | Full job description text if available |
| notes | No | string | Any extra context (e.g. "urgently hiring", "referral available") |

## Rules

- Output ONLY the JSON object, no markdown fences, no explanation
- If salary is given as a range like "$100k-$150k", convert to numbers: salary_min=100000, salary_max=150000
- If location says "Remote" include it in the location array
- apply_url should be the company's own career/application page (NOT the job platform URL)
- jd_url should be the job platform's listing URL (Indeed, LinkedIn, etc)
- If a field is unavailable, omit it (do not include null)
- Deduplicate: if the same job appears multiple times, include it only once`;

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getDateRange(preset: string, customStart: string, customEnd: string): { start: string; end: string } {
  if (preset === 'custom') {
    return { start: customStart || formatDate(new Date()), end: customEnd || formatDate(new Date()) };
  }
  const days = preset === '1' ? 1 : preset === '3' ? 3 : 7;
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  return { start: formatDate(start), end: formatDate(end) };
}

function buildPrompt(mode: 'email_access' | 'manual', startDate: string, endDate: string): string {
  if (mode === 'email_access') {
    return `Please visit my Gmail for the content of job alert emails from job platforms (Indeed, LinkedIn, Glassdoor, etc) received between ${startDate} and ${endDate}.

Extract every job listing and output strictly valid JSON.
${PROMPT_SHARED}
`;
  }
  return `You are a job listing parser. I will give you the content of job alert emails from job platforms (Indeed, LinkedIn, Glassdoor, etc). Only process emails received between ${startDate} and ${endDate}.

Extract every job listing and output strictly valid JSON.
${PROMPT_SHARED}

## Email Content

[Paste your job alert email content here]
`;
}

export default function ImportPage() {
  return (
    <div className="space-y-8">
      <PromptTemplateSection />
      <hr className="border-zinc-200" />
      <ImportSection />
      <hr className="border-zinc-200" />
      <SeedSection />
    </div>
  );
}

function PromptTemplateSection() {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'email_access' | 'manual'>('email_access');
  const [timePreset, setTimePreset] = useState('3');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const { start, end } = getDateRange(timePreset, customStart, customEnd);
  const prompt = buildPrompt(mode, start, end);

  function handleCopy() {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = prompt;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-lg font-bold text-zinc-900 hover:text-zinc-600 transition-colors"
      >
        <span className="text-sm">{expanded ? '\u25BC' : '\u25B6'}</span>
        Prompt Template
      </button>

      {expanded && (
        <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-4">
          <p className="text-sm text-zinc-600">
            Copy this prompt and paste it into any AI (ChatGPT, Gemini, Claude, etc).
            The AI will output JSON you can import below.
          </p>

          {/* Mode selection */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-zinc-700">Mode:</span>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="promptMode"
                checked={mode === 'email_access'}
                onChange={() => setMode('email_access')}
                className="text-zinc-900"
              />
              With Email Access
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="promptMode"
                checked={mode === 'manual'}
                onChange={() => setMode('manual')}
                className="text-zinc-900"
              />
              Without Email Access
            </label>
          </div>

          <p className="text-xs text-zinc-500">
            {mode === 'email_access'
              ? 'The AI has access to your email (e.g. Gemini with Gmail). It will fetch job alert emails directly.'
              : 'You will manually copy and paste email content into the prompt before sending to AI.'}
          </p>

          {/* Time range */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-zinc-700">Time Range:</span>
            <select
              value={timePreset}
              onChange={(e) => setTimePreset(e.target.value)}
              className="border border-zinc-300 rounded-md px-2 py-1 text-sm"
            >
              <option value="1">Past 1 day</option>
              <option value="3">Past 3 days</option>
              <option value="7">Past 7 days</option>
              <option value="custom">Custom</option>
            </select>
            {timePreset === 'custom' && (
              <div className="flex items-center gap-1.5 text-sm">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="border border-zinc-300 rounded-md px-2 py-1 text-sm"
                />
                <span className="text-zinc-400">~</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="border border-zinc-300 rounded-md px-2 py-1 text-sm"
                />
              </div>
            )}
          </div>

          {/* Prompt preview */}
          <pre className="bg-zinc-50 border border-zinc-200 rounded-md p-3 text-xs text-zinc-800 font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">
            {prompt}
          </pre>

          <button
            onClick={handleCopy}
            className="px-4 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy Prompt'}
          </button>
        </div>
      )}
    </div>
  );
}

function ImportSection() {
  const [inputMode, setInputMode] = useState<'text' | 'json'>('json');
  const [textMode, setTextMode] = useState<'normal' | 'viewall'>('normal');
  const [companyName, setCompanyName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [parsedJobs, setParsedJobs] = useState<ParsedJob[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [parseLoading, setParseLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function handleParse() {
    setParseLoading(true);
    setError(null);
    setResult(null);
    setWarnings([]);
    setParsedJobs([]);
    setSelectedIndices(new Set());

    try {
      let res: ApiResponse<{ items: ParsedJob[]; warnings: string[] }>;

      if (inputMode === 'json') {
        // Try to parse as JSON first for better error messages
        let jsonInput: string = pasteText.trim();
        // Strip markdown fences if present
        if (jsonInput.startsWith('```')) {
          jsonInput = jsonInput.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        }
        try {
          JSON.parse(jsonInput);
        } catch {
          throw new Error('Invalid JSON. Make sure the AI output is valid JSON.');
        }
        res = await fetchApi<{ items: ParsedJob[]; warnings: string[] }>('/api/import/json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: jsonInput,
        });
      } else {
        const body: Record<string, unknown> = { text: pasteText };
        if (textMode === 'viewall' && companyName.trim()) {
          body.company_name = companyName.trim();
        }
        body.mode = textMode;
        res = await fetchApi<{ items: ParsedJob[]; warnings: string[] }>('/api/import/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      if (!res.success) throw new Error(res.error || 'Parse failed');

      const items = res.data?.items || [];
      setParsedJobs(items);
      setWarnings(res.data?.warnings || []);

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
      const res = await fetchApi<{ imported: number; duplicates: number; filtered: number; flagged: number }>('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selectedJobs }),
      });
      if (!res.success) throw new Error(res.error || 'Import failed');
      const d = res.data!;
      setResult(`Imported ${d.imported} jobs (${d.duplicates} duplicates, ${d.filtered} filtered, ${d.flagged} flagged)`);
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

      <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3">
        {/* Input mode tabs */}
        <div className="flex gap-1 bg-zinc-100 rounded-md p-0.5 w-fit">
          <button
            onClick={() => setInputMode('text')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              inputMode === 'text'
                ? 'bg-white text-zinc-900 shadow-sm font-medium'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Paste Text
          </button>
          <button
            onClick={() => setInputMode('json')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              inputMode === 'json'
                ? 'bg-white text-zinc-900 shadow-sm font-medium'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Paste JSON
          </button>
        </div>

        {/* Text mode options */}
        {inputMode === 'text' && (
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="textMode"
                checked={textMode === 'normal'}
                onChange={() => setTextMode('normal')}
                className="text-zinc-900"
              />
              Normal
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="textMode"
                checked={textMode === 'viewall'}
                onChange={() => setTextMode('viewall')}
                className="text-zinc-900"
              />
              View All (single company)
            </label>
          </div>
        )}

        {inputMode === 'text' && textMode === 'viewall' && (
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
          placeholder={inputMode === 'json'
            ? '{"jobs": [{"title": "...", "company_name": "...", ...}]}'
            : 'Paste job listings here...'
          }
        />

        <div className="flex items-center gap-3">
          <button
            onClick={handleParse}
            disabled={parseLoading || !pasteText.trim()}
            className="px-4 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {parseLoading ? 'Parsing...' : inputMode === 'json' ? 'Parse JSON' : 'Parse'}
          </button>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
          <div className="font-medium mb-1">Warnings:</div>
          {warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

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
                  <th className="text-left px-4 py-2 font-medium text-zinc-600">Source</th>
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
                      <td className="px-4 py-2 text-zinc-500 text-xs">{job.source}</td>
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
