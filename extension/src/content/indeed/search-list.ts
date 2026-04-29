/**
 * Indeed search list enhancement — injects status badges, checkboxes,
 * and batch save functionality into job search result cards.
 *
 * Card structure (confirmed 2026-04):
 *   [class*="tapItem"]              ← card container (no data-jk)
 *     a[data-jk].jcs-JobTitle       ← title link (has data-jk = job key)
 *     [data-testid="company-name"]  ← company
 *     [data-testid="text-location"] ← location
 *
 * Batch save uses card-level data only (no JD enrichment via clicking).
 * Clicking into viewjob pages triggers Indeed's anti-bot; card data is
 * sufficient for dedup and basic job tracking.
 */
import { checkBatch, saveBatch } from '../../shared/api-client';
import { makeDraggable } from '../../shared/draggable';
import type { JobPayload } from '../../shared/types';

const BADGE_ATTR = 'data-firstin-badge';
const TOOLBAR_ID = 'firstin-indeed-toolbar';

const selectedCards = new Set<HTMLElement>();

// ── Public API ───────────────────────────────────────────────────────────────

export async function enhanceSearchList() {
  const cards = findJobCards();
  if (cards.length === 0) return;

  const newCards = cards.filter(c => !c.card.hasAttribute(BADGE_ATTR));
  if (newCards.length === 0) return;

  console.log(`[FirstIn/Indeed] enhancing ${newCards.length} job cards`);
  for (const c of newCards) c.card.setAttribute(BADGE_ATTR, 'loading');

  const result = await checkBatch(newCards.map(c => ({
    title: c.title,
    company_name: c.company,
    source: 'indeed' as const,
    source_id: c.jobKey || undefined,
  })));

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
    // API error — allow selecting all cards
    for (const c of newCards) {
      c.card.setAttribute(BADGE_ATTR, 'unknown');
      injectCheckbox(c.card);
    }
  }

  updateToolbar();
}

export function observeSearchList() {
  const container = document.querySelector('[id*="jobResults"]');
  if (container) {
    const observer = new MutationObserver(() => enhanceSearchList());
    observer.observe(container, { childList: true, subtree: false });
  } else {
    let timer: ReturnType<typeof setTimeout>;
    const bodyObs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => enhanceSearchList(), 1000);
    });
    bodyObs.observe(document.body, { childList: true });
  }
}

// ── Card finding ─────────────────────────────────────────────────────────────

interface CardInfo {
  card: HTMLElement;
  title: string;
  company: string;
  jobKey: string;
  jobUrl: string | null;
}

function findJobCards(): CardInfo[] {
  const results: CardInfo[] = [];

  for (const el of document.querySelectorAll('[class*="tapItem"]')) {
    const card = el as HTMLElement;

    const link = card.querySelector('a[data-jk]') as HTMLAnchorElement | null;
    if (!link) continue;

    const jobKey = link.getAttribute('data-jk') || '';
    if (!jobKey) continue;

    const rawTitle = link.textContent?.trim() || '';
    const title = rawTitle.replace(/\s*-\s*(job post|job ad|job listing)\s*$/i, '').trim();
    if (title.length < 3) continue;

    const company = card.querySelector('[data-testid="company-name"]')?.textContent?.trim() || '';

    results.push({ card, title, company, jobKey, jobUrl: link.href || null });
  }

  return results;
}

// ── Badge & Checkbox injection ────────────────────────────────────────────────

function injectBadge(card: HTMLElement, label: string, type: 'exists' | 'new') {
  card.querySelector('.firstin-badge')?.remove();

  const badge = document.createElement('span');
  badge.className = 'firstin-badge';
  badge.textContent = label;

  const base = 'display:inline-block;font-size:10px;font-weight:600;padding:1px 6px;border-radius:3px;color:white;margin-left:6px;vertical-align:middle;white-space:nowrap;';
  badge.style.cssText = base + (type === 'exists' ? 'background:#3b82f6;' : 'background:#059669;');

  if (type === 'new') card.style.borderLeft = '3px solid #059669';

  const titleWrapper = card.querySelector('a[data-jk]')?.parentElement;
  if (titleWrapper) {
    titleWrapper.appendChild(badge);
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
  style.textContent = ':host{display:block;}input{width:16px;height:16px;cursor:pointer;accent-color:#059669;margin:0;}';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.title = 'Select for batch save to FirstIn';

  cb.addEventListener('change', () => {
    if (cb.checked) {
      selectedCards.add(card);
      card.style.backgroundColor = 'rgba(5,150,105,0.05)';
    } else {
      selectedCards.delete(card);
      card.style.backgroundColor = '';
    }
    updateToolbar();
  });

  cb.addEventListener('click', e => e.stopPropagation());

  shadow.appendChild(style);
  shadow.appendChild(cb);

  if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
  card.style.overflow = 'visible';
  card.prepend(wrapper);
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function updateToolbar() {
  const newCount = document.querySelectorAll(`[${BADGE_ATTR}="new"]`).length;
  const count = selectedCards.size;

  if (count === 0 && newCount === 0) {
    document.getElementById(TOOLBAR_ID)?.remove();
    return;
  }

  let toolbar = document.getElementById(TOOLBAR_ID);
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
      .count    { color: #34d399; font-weight: 700; }
      button {
        padding: 6px 16px;
        border-radius: 8px;
        border: none;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
      }
      .save-btn        { background: #059669; color: white; }
      .save-btn:hover  { background: #047857; }
      .save-btn:disabled { background: #6b7280; cursor: wait; }
      .all-btn         { background: #2563eb; color: white; }
      .all-btn:hover   { background: #1d4ed8; }
      .clear-btn       { background: transparent; color: #94a3b8; border: 1px solid #475569; }
      .clear-btn:hover { color: white; border-color: #94a3b8; }
      .result          { color: #34d399; font-size: 13px; }
    `;
    toolbar.shadowRoot!.appendChild(style);
    makeDraggable(toolbar, toolbar);
  }

  renderToolbarContent(toolbar);
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
    bar.innerHTML = `<span><span class="count">${newCount}</span> new jobs</span>`;
    const allBtn = document.createElement('button');
    allBtn.className = 'all-btn';
    allBtn.textContent = `Select All (${newCount})`;
    allBtn.addEventListener('click', selectAllNew);
    bar.appendChild(allBtn);
  } else {
    bar.innerHTML = `<span><span class="count">${count}</span> selected</span>`;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'save-btn';
    saveBtn.textContent = 'Save to FirstIn';
    saveBtn.addEventListener('click', () => handleBatchSave(saveBtn, bar));
    bar.appendChild(saveBtn);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'clear-btn';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', clearAll);
    bar.appendChild(clearBtn);
  }

  shadow.appendChild(bar);
}

// ── Batch save ────────────────────────────────────────────────────────────────

async function handleBatchSave(btn: HTMLButtonElement, bar: HTMLElement) {
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const payloads: JobPayload[] = [];
  for (const card of selectedCards) {
    const payload = extractCardPayload(card);
    if (payload) payloads.push(payload);
  }

  if (payloads.length === 0) { btn.textContent = 'No data'; return; }

  const result = await saveBatch(payloads);

  if (result.success && result.data) {
    const { imported, duplicates, filtered } = result.data;

    for (const card of selectedCards) {
      card.querySelector('[data-firstin-cb-wrap]')?.remove();
      card.style.backgroundColor = '';
      card.style.borderLeft = '3px solid #3b82f6';
      card.querySelector('.firstin-badge')?.remove();
      card.setAttribute(BADGE_ATTR, 'exists');
      injectBadge(card, 'Saved', 'exists');
    }

    selectedCards.clear();

    const msg = document.createElement('span');
    msg.className = 'result';
    msg.textContent = `${imported} saved, ${duplicates} dups${filtered ? `, ${filtered} filtered` : ''}`;
    bar.querySelector('.save-btn')?.remove();
    bar.querySelector('.clear-btn')?.remove();
    bar.appendChild(msg);

    setTimeout(() => document.getElementById(TOOLBAR_ID)?.remove(), 3000);
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

// ── Card data extraction ──────────────────────────────────────────────────────

function extractCardPayload(card: HTMLElement): JobPayload | null {
  const link = card.querySelector('a[data-jk]') as HTMLAnchorElement | null;
  if (!link) return null;

  const jobKey = link.getAttribute('data-jk') || undefined;
  const rawTitle = link.textContent?.trim() || '';
  const title = rawTitle.replace(/\s*-\s*(job post|job ad|job listing)\s*$/i, '').trim();
  const company = card.querySelector('[data-testid="company-name"]')?.textContent?.trim() || '';
  const locationText = card.querySelector('[data-testid="text-location"]')?.textContent?.trim() || null;

  if (!title || !company) return null;

  return {
    title,
    company_name: company,
    location: locationText ? [locationText] : [],
    jd_url:    link.href || undefined,
    apply_url: link.href || undefined,
    source:    'indeed',
    source_id: jobKey,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function selectAllNew() {
  const newCards = document.querySelectorAll(`[${BADGE_ATTR}="new"]`);
  for (const el of newCards) {
    const card = el as HTMLElement;
    if (selectedCards.has(card)) continue;
    selectedCards.add(card);
    card.style.backgroundColor = 'rgba(5,150,105,0.05)';
    const wrap = card.querySelector('[data-firstin-cb-wrap]');
    if (wrap?.shadowRoot) {
      const cb = wrap.shadowRoot.querySelector('input') as HTMLInputElement | null;
      if (cb) cb.checked = true;
    }
  }
  updateToolbar();
}

function clearAll() {
  for (const card of selectedCards) {
    const wrap = card.querySelector('[data-firstin-cb-wrap]');
    if (wrap?.shadowRoot) {
      const cb = wrap.shadowRoot.querySelector('input') as HTMLInputElement | null;
      if (cb) cb.checked = false;
    }
    card.style.backgroundColor = '';
  }
  selectedCards.clear();
  updateToolbar();
}
