import { extractJobFromDetail } from './extractor';
import { saveJob, checkJob } from '../../shared/api-client';
import { getConfig, isConfigured } from '../../shared/storage';
import { enhanceSearchList, observeSearchList } from './search-list';
import type { JobPayload } from '../../shared/types';

const CONTAINER_ID = 'firstin-indeed-container';

let currentPayload: JobPayload | null = null;
let currentJobKey = '';   // currently shown job key (jk or vjk)
let isHandling = false;   // prevent concurrent handlePage calls

/**
 * Returns the active job key from the current URL.
 * - /viewjob?jk=xxx          → jk param
 * - /jobs?...&vjk=xxx        → vjk param (search results selected job)
 */
function getActiveJobKey(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('jk') ?? params.get('vjk') ?? '';
}

function isSearchPage(): boolean {
  return window.location.pathname === '/jobs';
}

/**
 * Main entry point. Runs on:
 *   - /viewjob?jk=... (full page reload on each navigation)
 *   - /jobs?...&vjk=... (SPA: URL updates when clicking job cards)
 */
async function init() {
  console.log('[FirstIn/Indeed] init() on', window.location.href);
  const config = await getConfig();
  if (!isConfigured(config)) {
    console.log('[FirstIn/Indeed] not configured, exiting');
    return;
  }

  await handlePage();

  // Search results page: observe URL changes via interval polling.
  // Interval is more reliable than pushState/replaceState interception
  // since Indeed's router may bypass those.
  if (isSearchPage()) {
    setInterval(() => {
      const newKey = getActiveJobKey();
      if (newKey !== currentJobKey && !isHandling) {
        handlePage().catch(err => console.error('[FirstIn/Indeed] nav handlePage error:', err));
      }
    }, 300);

    await enhanceSearchList();
    observeSearchList();
  }
}

async function handlePage() {
  if (isHandling) return;
  isHandling = true;

  try {
    await _handlePage();
  } finally {
    isHandling = false;
  }
}

async function _handlePage() {
  const jobKey = getActiveJobKey();

  // Search page with no job selected → no button
  if (isSearchPage() && !jobKey) {
    if (currentJobKey) {
      currentJobKey = '';
      removeButton();
    }
    return;
  }

  // Same job already shown → nothing to do
  if (jobKey === currentJobKey) return;

  console.log('[FirstIn/Indeed] job changed:', currentJobKey, '→', jobKey);
  currentJobKey = jobKey;
  removeButton();  // clear stale button immediately

  if (isSearchPage()) {
    // Right panel re-renders asynchronously after URL change.
    // Give React ~800ms to swap out the old panel with new job content.
    await sleep(800);

    // Stale guard: user may have clicked another card during the wait
    if (getActiveJobKey() !== currentJobKey) return;
  } else {
    // viewjob page: server-rendered; wait for key element to appear
    const detailEl = await waitForElement([
      '#jobDescriptionText',
      '[data-testid="jobsearch-JobInfoHeader-title"]',
      '[data-testid="inlineHeader-companyName"]',
      'h1',
    ], 8000);

    if (!detailEl) {
      console.log('[FirstIn/Indeed] detail element not found, aborting');
      return;
    }
    await sleep(300);

    if (getActiveJobKey() !== currentJobKey) return;
  }

  currentPayload = await extractJobFromDetail();
  console.log('[FirstIn/Indeed] extracted:', currentPayload
    ? { title: currentPayload.title, company: currentPayload.company_name, source_id: currentPayload.source_id }
    : null);

  if (!currentPayload) return;

  const result = await checkJob({
    title:        currentPayload.title,
    company_name: currentPayload.company_name,
    source:       'indeed',
    source_id:    currentPayload.source_id,
    location:     currentPayload.location,
  });

  if (getActiveJobKey() !== currentJobKey) return;

  if (result.success && result.data?.exists) {
    injectButton('exists', result.data.statusLabel || result.data.status || 'Saved', result.data.jobId);
  } else {
    injectButton('save');
  }
}

// ─── Button UI (Shadow DOM, identical to LinkedIn adapter) ───────────────────

type ButtonState = 'save' | 'saving' | 'saved' | 'exists' | 'error';

function injectButton(state: ButtonState, label?: string, jobId?: number) {
  removeButton();

  const container = document.createElement('div');
  container.id = CONTAINER_ID;

  const shadow = container.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      border-radius: 10px;
      border: none;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: all 0.2s;
      white-space: nowrap;
    }
    .btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,0.2); }
    .btn:active { transform: translateY(0); }
    .btn-save    { background: #059669; color: white; }
    .btn-saving  { background: #6b7280; color: white; cursor: wait; }
    .btn-saved   { background: #2563eb; color: white; }
    .btn-exists  { background: #475569; color: white; cursor: default; }
    .btn-exists:hover { transform: none; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
    .btn-error   { background: #dc2626; color: white; }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot-green { background: #34d399; }
    .dot-blue  { background: #60a5fa; }
    .dot-red   { background: #f87171; }
    .spinner {
      width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;

  const btn = document.createElement('button');
  btn.className = `btn btn-${state}`;

  switch (state) {
    case 'save':
      btn.innerHTML = '<span class="dot dot-green"></span>Save to FirstIn';
      btn.addEventListener('click', handleSave);
      break;
    case 'saving':
      btn.innerHTML = '<span class="spinner"></span>Saving...';
      break;
    case 'saved':
      btn.innerHTML = '<span class="dot dot-blue"></span>Saved!';
      setTimeout(() => {
        btn.className = 'btn btn-exists';
        btn.textContent = `In FirstIn: ${label || 'Pending Eval'}`;
      }, 2000);
      break;
    case 'exists':
      btn.innerHTML = `<span class="dot dot-blue"></span>In FirstIn: ${label}`;
      if (jobId) {
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', () => {
          getConfig().then(config => {
            if (config.serverUrl) window.open(`${config.serverUrl}/jobs/${jobId}`, '_blank');
          });
        });
      }
      break;
    case 'error':
      btn.innerHTML = `<span class="dot dot-red"></span>${label || 'Error'}`;
      btn.addEventListener('click', handleSave);
      break;
  }

  shadow.appendChild(style);
  shadow.appendChild(btn);
  document.body.appendChild(container);
}

async function handleSave() {
  if (!currentPayload) return;

  injectButton('saving');

  const result = await saveJob(currentPayload);

  if (result.success && result.data) {
    if (result.data.saved) {
      injectButton('saved', result.data.status, result.data.jobId);
    } else if (result.data.duplicate) {
      injectButton('exists', result.data.status || 'Already saved', result.data.matchedJobId);
    } else {
      injectButton('error', 'Failed to save');
    }
  } else {
    injectButton('error', result.error || 'Network error');
  }
}

function removeButton() {
  document.getElementById(CONTAINER_ID)?.remove();
}

function waitForElement(selectors: string | string[], timeout = 5000): Promise<Element | null> {
  const selectorList = Array.isArray(selectors) ? selectors : [selectors];
  const combined = selectorList.join(', ');

  return new Promise((resolve) => {
    const el = document.querySelector(combined);
    if (el) { resolve(el); return; }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(combined);
      if (el) { observer.disconnect(); resolve(el); }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Start
init().catch(err => console.error('[FirstIn/Indeed] init failed:', err));
