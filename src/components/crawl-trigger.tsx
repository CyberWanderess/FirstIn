'use client';

import { useState } from 'react';

type CrawlState = 'idle' | 'loading' | 'success' | 'error';

interface CrawlResult {
  jobs_found: number;
  new_after_dedup: number;
}

export function CrawlTrigger() {
  const [state, setState] = useState<CrawlState>('idle');
  const [result, setResult] = useState<CrawlResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCrawl() {
    setState('loading');
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/crawl/source', { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Crawl failed');
      setResult(json.data);
      setState('success');
    } catch (e) {
      setError((e as Error).message);
      setState('error');
    }

    setTimeout(() => {
      setState('idle');
      setResult(null);
      setError(null);
    }, 5000);
  }

  if (state === 'loading') {
    return (
      <button
        disabled
        className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-zinc-100 text-zinc-400 rounded-md cursor-not-allowed"
      >
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Crawling...
      </button>
    );
  }

  if (state === 'success' && result) {
    return (
      <span className="text-sm text-green-600 font-medium">
        Found {result.jobs_found} jobs, {result.new_after_dedup} new
      </span>
    );
  }

  if (state === 'error') {
    return (
      <span className="text-sm text-red-600 font-medium">
        Error: {error}
      </span>
    );
  }

  return (
    <button
      onClick={handleCrawl}
      className="px-4 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 transition-colors"
    >
      Start Crawl
    </button>
  );
}
