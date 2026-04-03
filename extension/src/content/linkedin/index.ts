import { extractJobFromDetail } from './extractor';
import { saveJob, checkJob } from '../../shared/api-client';
import { getConfig, isConfigured } from '../../shared/storage';
import { enhanceSearchList, observeSearchList } from './search-list';
import type { JobPayload } from '../../shared/types';

const BUTTON_ID = 'firstin-save-btn';
const CONTAINER_ID = 'firstin-container';

let currentUrl = '';
let currentPayload: JobPayload | null = null;

/**
 * Main entry point — runs on LinkedIn job pages.
 */
async function init() {
  console.log('[FirstIn] init() called on', window.location.href);
  const config = await getConfig();
  console.log('[FirstIn] config:', { serverUrl: config.serverUrl ? '✓' : '✗', apiToken: config.apiToken ? '✓' : '✗' });
  if (!isConfigured(config)) { console.log('[FirstIn] not configured, exiting'); return; }

  // Initial run
  await handlePage();

  // Enhance search results list (status badges + checkboxes)
  await enhanceSearchList();
  observeSearchList();

  // Watch for SPA navigation (LinkedIn is a single-page app)
  observeNavigation();
}

async function handlePage() {
  const url = window.location.href;
  if (url === currentUrl) return;
  currentUrl = url;

  // Must be on a job-related page
  if (!window.location.pathname.startsWith('/jobs/')) {
    console.log('[FirstIn] not a /jobs/ page, skipping');
    removeButton();
    return;
  }

  // Wait for the job detail to render — try multiple selectors for different page layouts
  // /jobs/view/ uses aria-label="Company,..."; /jobs/search/ uses different DOM
  console.log('[FirstIn] waiting for job detail element...');
  const detailEl = await waitForElement([
    'div[aria-label^="Company,"]',
    'span[data-testid="expandable-text-box"]',
    'a[href*="/company/"]',
    '#job-details',
  ], 8000);
  console.log('[FirstIn] detail element found:', !!detailEl);

  // Small delay to let all content load
  await sleep(500);

  // Extract job data
  currentPayload = await extractJobFromDetail();
  console.log('[FirstIn] extracted payload:', currentPayload ? { title: currentPayload.title, company: currentPayload.company_name } : null);
  if (!currentPayload) {
    removeButton();
    return;
  }

  // Check if job already exists
  const result = await checkJob({
    title: currentPayload.title,
    company_name: currentPayload.company_name,
    source: 'linkedin',
    source_id: currentPayload.source_id,
    location: currentPayload.location,
  });

  if (result.success && result.data?.exists) {
    injectButton('exists', result.data.statusLabel || result.data.status || 'Saved', result.data.jobId);
  } else {
    injectButton('save');
  }
}

type ButtonState = 'save' | 'saving' | 'saved' | 'exists' | 'error';

function injectButton(state: ButtonState, label?: string, jobId?: number) {
  removeButton();

  const container = document.createElement('div');
  container.id = CONTAINER_ID;

  // Use Shadow DOM to avoid LinkedIn CSS conflicts
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
    .btn-save { background: #059669; color: white; }
    .btn-saving { background: #6b7280; color: white; cursor: wait; }
    .btn-saved { background: #2563eb; color: white; }
    .btn-exists { background: #475569; color: white; cursor: default; }
    .btn-exists:hover { transform: none; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
    .btn-error { background: #dc2626; color: white; }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot-green { background: #34d399; }
    .dot-blue { background: #60a5fa; }
    .dot-red { background: #f87171; }
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
      setTimeout(() => { btn.className = 'btn btn-exists'; btn.textContent = `In FirstIn: ${label || 'Pending Eval'}`; }, 2000);
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

function observeNavigation() {
  // LinkedIn uses pushState for SPA navigation
  let lastUrl = window.location.href;

  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      currentUrl = ''; // Reset to trigger re-extraction
      handlePage();
      enhanceSearchList();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Also watch for clicks on job cards in search results (sometimes URL doesn't change immediately)
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const jobCard = target.closest('a[href*="/jobs/view/"], li[data-occludable-job-id]');
    if (jobCard) {
      // Delay to let LinkedIn update the detail panel
      setTimeout(() => {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          currentUrl = '';
          handlePage();
        }
      }, 1500);
    }
  });
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
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Start
init().catch(err => console.error('[FirstIn] init failed:', err));
