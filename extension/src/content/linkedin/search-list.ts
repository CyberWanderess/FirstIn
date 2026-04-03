/**
 * Search results list enhancement — injects status badges, checkboxes,
 * and batch save functionality into LinkedIn job search result cards.
 */
import { checkBatch, saveBatch } from '../../shared/api-client';
import { makeDraggable } from '../../shared/draggable';
import { expandDescription, findDescription, findSalary, findLocationMeta, findPostedDate } from './selectors';
import type { JobPayload } from '../../shared/types';

const BADGE_ATTR = 'data-firstin-badge';
const TOOLBAR_ID = 'firstin-batch-toolbar';

interface CardInfo {
  card: HTMLElement;
  title: string;
  company: string;
  sourceId: string | null;
  jobUrl: string | null;
}

/** Track which cards are selected */
const selectedCards = new Set<HTMLElement>();

/** Cache of enriched payloads (JD extracted from detail panel) */
const enrichedCache = new Map<HTMLElement, JobPayload>();

/** Sequential queue for JD extraction (prevents concurrent clicks) */
let enrichQueue = Promise.resolve();
let enrichQueueSize = 0;
let enrichQueueDone = 0;

/**
 * Main entry: scan visible job cards, check status, inject badges + checkboxes.
 */
export async function enhanceSearchList() {
  if (!isSearchPage()) return;

  const cards = findJobCards();
  if (cards.length === 0) return;

  const newCards = cards.filter(c => !c.card.hasAttribute(BADGE_ATTR));
  if (newCards.length === 0) return;

  console.log(`[FirstIn] enhancing ${newCards.length} job cards`);

  for (const c of newCards) {
    c.card.setAttribute(BADGE_ATTR, 'loading');
  }

  const checkItems = newCards.map(c => ({
    title: c.title,
    company_name: c.company,
    source: 'linkedin' as const,
    source_id: c.sourceId || undefined,
  }));

  const result = await checkBatch(checkItems);

  if (result.success && result.data?.results) {
    for (const r of result.data.results) {
      const card = newCards[r.index];
      if (!card) continue;

      if (r.exists) {
        card.card.setAttribute(BADGE_ATTR, 'exists');
        injectBadge(card.card, r.statusLabel || r.status || 'Saved', 'exists');
      } else {
        card.card.setAttribute(BADGE_ATTR, 'new');
        injectBadge(card.card, 'New', 'new');
        injectCheckbox(card.card);
      }
    }
  } else {
    for (const c of newCards) {
      c.card.setAttribute(BADGE_ATTR, 'unknown');
      injectCheckbox(c.card);
    }
  }

  updateToolbar();
}

/**
 * Observe the job list for new cards (infinite scroll / pagination).
 */
export function observeSearchList() {
  if (!isSearchPage()) return;

  const observer = new MutationObserver(() => {
    enhanceSearchList();
  });

  const listContainer = document.querySelector(
    '.jobs-search-results-list, .scaffold-layout__list-container, [role="list"]'
  );
  if (listContainer) {
    observer.observe(listContainer, { childList: true, subtree: true });
  } else {
    let timer: ReturnType<typeof setTimeout>;
    const bodyObserver = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => enhanceSearchList(), 1000);
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }
}

function isSearchPage(): boolean {
  const path = window.location.pathname;
  return path.includes('/jobs/search') || path.includes('/jobs/collections');
}

// ── Card finding ──

function findJobCards(): CardInfo[] {
  const results: CardInfo[] = [];

  const listItems = document.querySelectorAll(
    'li.jobs-search-results__list-item, li[data-occludable-job-id], .scaffold-layout__list-item'
  );

  for (const li of listItems) {
    const el = li as HTMLElement;
    const jobLink = el.querySelector('a[href*="/jobs/view/"]') as HTMLAnchorElement | null;
    const sourceId = jobLink?.href?.match(/\/jobs\/view\/(\d+)/)?.[1]
      || el.getAttribute('data-occludable-job-id')
      || null;

    const titleEl = el.querySelector('a[href*="/jobs/view/"] strong, a[href*="/jobs/view/"] span');
    const title = titleEl?.textContent?.trim()
      || jobLink?.textContent?.trim()
      || '';

    let company = '';
    const subtitleEl = el.querySelector('.artdeco-entity-lockup__subtitle, .job-card-container__primary-description');
    if (subtitleEl) {
      company = subtitleEl.textContent?.trim() || '';
    }
    if (!company) {
      const spans = el.querySelectorAll('span, div');
      for (const span of spans) {
        const text = span.textContent?.trim() || '';
        if (text.length > 1 && text.length < 80 && text !== title
            && !text.includes('ago') && !text.includes('applicant')
            && !text.includes('Easy Apply') && !text.includes('Promoted')) {
          const childText = Array.from(span.childNodes)
            .filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.textContent?.trim())
            .join('');
          if (childText && childText === text && text !== title) {
            company = text;
            break;
          }
        }
      }
    }

    if (title && title.length > 3) {
      results.push({ card: el, title, company, sourceId, jobUrl: jobLink?.href || null });
    }
  }

  return results;
}

// ── Badge & Checkbox injection ──

function injectBadge(card: HTMLElement, label: string, type: 'exists' | 'new') {
  card.querySelector('.firstin-badge')?.remove();

  const badge = document.createElement('span');
  badge.className = 'firstin-badge';
  badge.textContent = label;

  if (type === 'exists') {
    badge.style.cssText = 'display:inline-block;font-size:10px;font-weight:600;padding:1px 6px;border-radius:3px;background:#3b82f6;color:white;margin-left:6px;vertical-align:middle;white-space:nowrap;';
  } else {
    badge.style.cssText = 'display:inline-block;font-size:10px;font-weight:600;padding:1px 6px;border-radius:3px;background:#059669;color:white;margin-left:6px;vertical-align:middle;white-space:nowrap;';
    card.style.borderLeft = '3px solid #059669';
  }

  const titleEl = card.querySelector('a[href*="/jobs/view/"] strong, a[href*="/jobs/view/"] span');
  if (titleEl) {
    titleEl.parentElement?.appendChild(badge);
  } else {
    card.prepend(badge);
  }
}

function injectCheckbox(card: HTMLElement) {
  if (card.querySelector('[data-firstin-cb-wrap]')) return;

  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-firstin-cb-wrap', '1');
  wrapper.style.cssText = 'position:absolute;top:8px;left:4px;z-index:9999;width:20px;height:20px;';

  const shadow = wrapper.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host { display:block; }
    input {
      width: 16px; height: 16px; cursor: pointer;
      accent-color: #059669; margin: 0;
    }
  `;

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.title = 'Select for batch save to FirstIn';

  cb.addEventListener('change', () => {
    if (cb.checked) {
      selectedCards.add(card);
      card.style.backgroundColor = 'rgba(5, 150, 105, 0.05)';
      // Queue JD extraction immediately
      queueEnrich(card);
    } else {
      selectedCards.delete(card);
      enrichedCache.delete(card);
      card.style.backgroundColor = '';
    }
    updateToolbar();
  });

  cb.addEventListener('click', (e) => e.stopPropagation());

  shadow.appendChild(style);
  shadow.appendChild(cb);

  if (getComputedStyle(card).position === 'static') {
    card.style.position = 'relative';
  }
  card.style.overflow = 'visible';

  card.prepend(wrapper);
}

// ── JD enrichment queue ──

/** Get the source_id from a card element */
function getCardSourceId(card: HTMLElement): string | null {
  const jobLink = card.querySelector('a[href*="/jobs/view/"]') as HTMLAnchorElement | null;
  return jobLink?.href?.match(/\/jobs\/view\/(\d+)/)?.[1]
    || card.getAttribute('data-occludable-job-id')
    || null;
}

/** Get the currently active job ID from the URL */
function getCurrentJobId(): string | null {
  const pathMatch = window.location.pathname.match(/\/jobs\/view\/(\d+)/);
  if (pathMatch) return pathMatch[1];
  return new URLSearchParams(window.location.search).get('currentJobId');
}

/** Add a card to the enrichment queue */
function queueEnrich(card: HTMLElement) {
  if (enrichedCache.has(card)) return; // Already enriched
  enrichQueueSize++;
  enrichQueue = enrichQueue.then(async () => {
    // Skip if card was unchecked while waiting in queue
    if (!selectedCards.has(card)) {
      enrichQueueDone++;
      return;
    }
    try {
      await enrichAndCache(card);
    } catch (e) {
      console.warn('[FirstIn] Failed to enrich card:', e);
    }
    enrichQueueDone++;
    updateToolbarProgress();
  });
}

/** Extract JD from detail panel and store in cache */
async function enrichAndCache(card: HTMLElement): Promise<void> {
  const basic = extractCardInfo(card);
  if (!basic) return;

  const sourceId = getCardSourceId(card);
  const currentId = getCurrentJobId();
  const isAlreadyActive = sourceId && sourceId === currentId;

  if (!isAlreadyActive) {
    // Random delay before clicking (1-3s) to avoid LinkedIn rate limiting
    if (enrichQueueDone > 0) {
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
    }

    // Click the job link to load detail panel
    const jobLink = card.querySelector('a[href*="/jobs/view/"]') as HTMLElement | null;
    if (jobLink) {
      jobLink.click();
    } else {
      card.click();
    }

    // Wait for JD to load (poll up to 3s)
    let loaded = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      await new Promise(r => setTimeout(r, 250));
      const desc = findDescription();
      if (desc && desc.length > 50) { loaded = true; break; }
    }
    if (!loaded) {
      // Timeout — store basic info without JD
      enrichedCache.set(card, basic);
      return;
    }
  }

  // Expand truncated JD
  expandDescription();
  await new Promise(r => setTimeout(r, 500));

  const description = findDescription();
  const salary = findSalary();
  const { location: detailLocation, workMode } = findLocationMeta();
  const postedAt = findPostedDate();

  enrichedCache.set(card, {
    ...basic,
    jd_full_text: description || undefined,
    salary_min: salary?.min,
    salary_max: salary?.max,
    salary_currency: salary?.currency,
    work_mode: workMode || undefined,
    location: detailLocation ? [detailLocation] : basic.location,
    posted_at: postedAt || undefined,
  });
}

function extractCardInfo(card: HTMLElement): JobPayload | null {
  const jobLink = card.querySelector('a[href*="/jobs/view/"]') as HTMLAnchorElement | null;
  const sourceId = jobLink?.href?.match(/\/jobs\/view\/(\d+)/)?.[1]
    || card.getAttribute('data-occludable-job-id')
    || undefined;

  const titleEl = card.querySelector('a[href*="/jobs/view/"] strong, a[href*="/jobs/view/"] span');
  const title = titleEl?.textContent?.trim() || '';

  let company = '';
  const subtitleEl = card.querySelector('.artdeco-entity-lockup__subtitle, .job-card-container__primary-description');
  if (subtitleEl) company = subtitleEl.textContent?.trim() || '';

  if (!title || !company) return null;

  const metaEl = card.querySelector('.artdeco-entity-lockup__caption, .job-card-container__metadata-wrapper');
  const location = metaEl?.textContent?.trim() || undefined;

  return {
    title,
    company_name: company,
    location: location ? [location] : [],
    jd_url: jobLink?.href || undefined,
    apply_url: jobLink?.href || undefined,
    source: 'linkedin',
    source_id: sourceId,
  };
}

// ── Toolbar ──

function updateToolbar() {
  const count = selectedCards.size;
  const newCards = document.querySelectorAll(`[${BADGE_ATTR}="new"]`);
  const newCount = newCards.length;

  let toolbar = document.getElementById(TOOLBAR_ID);

  if (count === 0 && newCount === 0) {
    toolbar?.remove();
    return;
  }

  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = TOOLBAR_ID;
    toolbar.attachShadow({ mode: 'open' });
    document.body.appendChild(toolbar);

    const style = document.createElement('style');
    style.textContent = `
      :host {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 20px;
        background: #1e293b;
        color: white;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.25);
        font-size: 14px;
        font-weight: 500;
        cursor: grab;
      }
      .toolbar:active { cursor: grabbing; }
      .count { color: #34d399; font-weight: 700; }
      .progress { color: #94a3b8; font-size: 12px; }
      button {
        padding: 6px 16px;
        border-radius: 8px;
        border: none;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
      }
      .save-btn { background: #059669; color: white; }
      .save-btn:hover { background: #047857; }
      .save-btn:disabled { background: #6b7280; cursor: wait; }
      .select-all-btn { background: #2563eb; color: white; }
      .select-all-btn:hover { background: #1d4ed8; }
      .clear-btn { background: transparent; color: #94a3b8; border: 1px solid #475569; }
      .clear-btn:hover { color: white; border-color: #94a3b8; }
      .result { color: #34d399; font-size: 13px; }
    `;
    toolbar.shadowRoot!.appendChild(style);
    // Make the toolbar draggable — bar itself is the handle (buttons excluded automatically)
    makeDraggable(toolbar, toolbar);
  }

  renderToolbarContent(toolbar);
}

/** Update toolbar to show enrichment progress without full rebuild */
function updateToolbarProgress() {
  const toolbar = document.getElementById(TOOLBAR_ID);
  if (toolbar) renderToolbarContent(toolbar);
}

function renderToolbarContent(toolbar: HTMLElement) {
  const shadow = toolbar.shadowRoot!;
  const style = shadow.querySelector('style')!;
  shadow.innerHTML = '';
  shadow.appendChild(style);

  const count = selectedCards.size;
  const newCount = document.querySelectorAll(`[${BADGE_ATTR}="new"]`).length;
  const bar = document.createElement('div');
  bar.className = 'toolbar';

  if (count === 0) {
    // No selection — show Select All
    bar.innerHTML = `<span><span class="count">${newCount}</span> new jobs</span>`;

    const selectAllBtn = document.createElement('button');
    selectAllBtn.className = 'select-all-btn';
    selectAllBtn.textContent = `Select All (${newCount})`;
    selectAllBtn.addEventListener('click', () => selectAllNew());
    bar.appendChild(selectAllBtn);
  } else {
    // Cards selected
    const enriching = enrichQueueDone < enrichQueueSize;
    const cached = enrichedCache.size;

    let statusHtml = `<span class="count">${count}</span> selected`;
    if (enriching) {
      statusHtml += ` <span class="progress">(loading JD ${enrichQueueDone}/${enrichQueueSize})</span>`;
    } else if (cached > 0) {
      statusHtml += ` <span class="progress">(${cached} JD ready)</span>`;
    }
    bar.innerHTML = `<span>${statusHtml}</span>`;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'save-btn';
    saveBtn.textContent = 'Save to FirstIn';
    saveBtn.addEventListener('click', () => handleBatchSave(saveBtn, bar));
    bar.appendChild(saveBtn);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'clear-btn';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => {
      for (const card of selectedCards) {
        uncheckCard(card);
        card.style.backgroundColor = '';
      }
      selectedCards.clear();
      enrichedCache.clear();
      enrichQueueSize = 0;
      enrichQueueDone = 0;
      updateToolbar();
    });
    bar.appendChild(clearBtn);
  }

  shadow.appendChild(bar);
}

// ── Batch save ──

async function handleBatchSave(btn: HTMLButtonElement, bar: HTMLElement) {
  btn.disabled = true;

  // Wait for any in-progress enrichment to finish
  if (enrichQueueDone < enrichQueueSize) {
    btn.textContent = 'Waiting for JD...';
    await enrichQueue;
  }

  btn.textContent = 'Saving...';

  // Build payloads from cache, fallback to basic info for uncached cards
  const payloads: JobPayload[] = [];
  for (const card of selectedCards) {
    const cached = enrichedCache.get(card);
    if (cached) {
      payloads.push(cached);
    } else {
      const basic = extractCardInfo(card);
      if (basic) payloads.push(basic);
    }
  }

  if (payloads.length === 0) {
    btn.textContent = 'No data to save';
    return;
  }

  const result = await saveBatch(payloads);

  if (result.success && result.data) {
    const { imported, duplicates, filtered } = result.data;

    for (const card of selectedCards) {
      removeCheckbox(card);
      card.style.backgroundColor = '';
      card.style.borderLeft = '3px solid #3b82f6';
      card.querySelector('.firstin-badge')?.remove();
      card.setAttribute(BADGE_ATTR, 'exists');
      injectBadge(card, 'Saved', 'exists');
    }
    selectedCards.clear();
    enrichedCache.clear();
    enrichQueueSize = 0;
    enrichQueueDone = 0;

    const resultEl = document.createElement('span');
    resultEl.className = 'result';
    resultEl.textContent = `${imported} saved, ${duplicates} dups`;
    if (filtered > 0) resultEl.textContent += `, ${filtered} filtered`;
    bar.querySelector('.save-btn')?.remove();
    bar.querySelector('.clear-btn')?.remove();
    bar.appendChild(resultEl);

    setTimeout(() => { document.getElementById(TOOLBAR_ID)?.remove(); }, 3000);
  } else {
    btn.disabled = false;
    btn.textContent = 'Retry';
    const err = document.createElement('span');
    err.className = 'result';
    err.style.color = '#f87171';
    err.textContent = result.error || 'Failed';
    bar.appendChild(err);
  }
}

// ── Select All / helpers ──

function selectAllNew() {
  const newCards = document.querySelectorAll(`[${BADGE_ATTR}="new"]`);
  for (const card of newCards) {
    const el = card as HTMLElement;
    if (selectedCards.has(el)) continue;
    selectedCards.add(el);
    el.style.backgroundColor = 'rgba(5, 150, 105, 0.05)';
    const wrap = el.querySelector('[data-firstin-cb-wrap]');
    if (wrap?.shadowRoot) {
      const cb = wrap.shadowRoot.querySelector('input') as HTMLInputElement | null;
      if (cb) cb.checked = true;
    }
    queueEnrich(el);
  }
  updateToolbar();
}

function uncheckCard(card: HTMLElement) {
  const wrap = card.querySelector('[data-firstin-cb-wrap]');
  if (wrap?.shadowRoot) {
    const cb = wrap.shadowRoot.querySelector('input') as HTMLInputElement | null;
    if (cb) cb.checked = false;
  }
}

function removeCheckbox(card: HTMLElement) {
  card.querySelector('[data-firstin-cb-wrap]')?.remove();
}
