/**
 * Indeed DOM selectors and JS state extraction.
 *
 * Strategy: try window._initialData (structured JS state) first, fall back to DOM.
 * Indeed is a React/federated-module app — class names can be obfuscated, but:
 *   1. window._initialData contains structured job data (jobKey, title, company, location)
 *   2. #jobDescriptionText ID has been stable for 5+ years
 *   3. data-testid attributes are reasonably stable
 *
 * NOTE: The exact key paths in _initialData for /viewjob pages must be confirmed by
 * running `window._initialData` in DevTools on a live Indeed job page.
 *
 * Last verified selectors: 2026-04 (best-effort, needs live testing)
 */

// ─── JS State Extraction ────────────────────────────────────────────────────

interface IndeedStateJob {
  // GraphQL "Job" shape (confirmed from live _initialData)
  key?: string;
  title?: string;
  sourceEmployerName?: string;
  datePublished?: number;   // Unix timestamp in milliseconds
  description?: { html?: string };
  location?: { formatted?: { short?: string }; city?: string; state?: string };
  compensation?: { baseSalary?: { range?: { min?: number; max?: number } }; currencyCode?: string };
  remoteWorkModel?: { type?: string };
  // Legacy viewjob-page shape
  jobKey?: string;
  pubDate?: string;
  createDate?: string;
}

export interface StateExtraction {
  source_id?: string;
  title?: string;
  company_name?: string;
  location?: string;
  work_mode?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  posted_at?: string;
  jd_full_text?: string;  // extracted from job.description.html when available
}

export function extractFromState(): StateExtraction | null {
  const data = (window as any)._initialData;
  if (!data) return null;

  const currentKey = new URLSearchParams(window.location.search).get('jk')
    ?? new URLSearchParams(window.location.search).get('vjk')
    ?? null;

  // ── Search results page: use autoOpenTwoPaneViewjobResponse ──────────────
  // autoOpenJobAttributes.jobKey = currently selected job key
  const openKey: string | undefined = data?.autoOpenJobAttributes?.jobKey;
  if (openKey) {
    // If state jobKey doesn't match URL (user navigated away), skip state
    if (currentKey && openKey !== currentKey) {
      console.log('[FirstIn/Indeed] _initialData jobKey mismatch, using DOM only');
      return null;
    }
    // autoOpenTwoPaneViewjobResponse contains the full viewjob data for the right panel
    const vjResp = data?.autoOpenTwoPaneViewjobResponse;
    if (vjResp) {
      const result = parseViewjobResponse(vjResp, openKey);
      if (result) return result;
    }
  }

  // ── viewjob page: try known paths ─────────────────────────────────────────
  const job: IndeedStateJob | null =
    data?.jobInfoWrapperModel?.jobInfoModel ??
    data?.viewJobData?.jobInfoWrapperModel?.jobInfoModel ??
    data?.job ??
    null;

  if (!job) {
    console.log('[FirstIn/Indeed] no job model in _initialData, using DOM');
    return null;
  }

  const result: StateExtraction = {};

  // Source ID — validate against URL
  const stateKey = job.jobKey ?? (data.jobKey as string | undefined);
  if (currentKey && stateKey && stateKey !== currentKey) {
    console.log('[FirstIn/Indeed] viewjob state jobKey mismatch, using DOM only');
    return null;
  }
  result.source_id = stateKey ?? currentKey ?? undefined;

  // Title
  if (job.title) result.title = job.title;

  // Company
  if (job.sourceEmployerName) result.company_name = job.sourceEmployerName;

  // Location
  const locStr = job.location?.formatted?.short;
  if (locStr) result.location = locStr;

  // Work mode from remoteWorkModel
  const remoteType = job.remoteWorkModel?.type?.toLowerCase();
  if (remoteType) {
    if (remoteType.includes('remote')) result.work_mode = 'remote';
    else if (remoteType.includes('hybrid')) result.work_mode = 'hybrid';
    else result.work_mode = 'onsite';
  }

  // Salary
  const baseSalary = job.compensation?.baseSalary;
  if (baseSalary?.range) {
    if (baseSalary.range.min != null) result.salary_min = baseSalary.range.min;
    if (baseSalary.range.max != null) result.salary_max = baseSalary.range.max;
    result.salary_currency = job.compensation?.currencyCode ?? 'USD';
  }

  // Posted date
  const dateStr = job.pubDate ?? job.createDate;
  if (dateStr) {
    try {
      result.posted_at = new Date(dateStr).toISOString().split('T')[0];
    } catch {
      // ignore bad date
    }
  }

  return result;
}

/**
 * Parse a viewjob response object (used for both autoOpenTwoPaneViewjobResponse
 * and standard /viewjob page responses). The exact structure depends on the
 * Indeed API version — we try multiple known paths.
 *
 * Run `JSON.stringify(window._initialData.autoOpenTwoPaneViewjobResponse, null, 2)`
 * in DevTools to inspect the live structure and refine these paths if needed.
 */
/**
 * Parse a viewjob response object.
 *
 * Indeed's two-pane viewjob response is a GraphQL payload with the shape:
 *   resp.body.hostQueryExecutionResult.data.jobData.results[0]
 *
 * The response also has hiringInsightsModel.age for posted date.
 * Run `JSON.stringify(window._initialData.autoOpenTwoPaneViewjobResponse?.body
 *   ?.hostQueryExecutionResult?.data?.jobData?.results?.[0], null, 2)`
 * in DevTools to inspect the live structure.
 */
function parseViewjobResponse(resp: any, fallbackKey?: string): StateExtraction | null {
  if (!resp) return null;

  const body = resp?.body ?? resp;
  const result: StateExtraction = {};

  // ── GraphQL path (confirmed from live _initialData inspection) ─────────────
  const gqlJob = body?.hostQueryExecutionResult?.data?.jobData?.results?.[0];
  if (gqlJob) {
    extractFromGqlJob(gqlJob, result, fallbackKey);
    if (result.title || result.company_name) {
      // posted_at from hiringInsightsModel (available in body, not in gqlJob)
      if (!result.posted_at) {
        const insights = body?.hiringInsightsModel;
        if (insights?.postedToday) {
          result.posted_at = new Date().toISOString().split('T')[0];
        } else if (insights?.age) {
          result.posted_at = parseRelativeAge(insights.age) ?? undefined;
        }
      }
      return result;
    }
  }

  // ── Older/viewjob-page paths ───────────────────────────────────────────────
  const legacyJob: IndeedStateJob | null =
    body?.jobInfoWrapperModel?.jobInfoModel ??
    body?.jobInfoModel ??
    body?.job ??
    null;

  if (!legacyJob || typeof legacyJob !== 'object') return null;
  if (!legacyJob.title && !legacyJob.sourceEmployerName) return null;

  result.source_id = legacyJob.jobKey ?? fallbackKey;
  if (legacyJob.title) result.title = legacyJob.title;
  if (legacyJob.sourceEmployerName) result.company_name = legacyJob.sourceEmployerName;

  const locStr = legacyJob.location?.formatted?.short;
  if (locStr) result.location = locStr;

  const remoteType = legacyJob.remoteWorkModel?.type?.toLowerCase();
  if (remoteType) {
    if (remoteType.includes('remote')) result.work_mode = 'remote';
    else if (remoteType.includes('hybrid')) result.work_mode = 'hybrid';
    else result.work_mode = 'onsite';
  }

  const baseSalary = legacyJob.compensation?.baseSalary;
  if (baseSalary?.range) {
    if (baseSalary.range.min != null) result.salary_min = baseSalary.range.min;
    if (baseSalary.range.max != null) result.salary_max = baseSalary.range.max;
    result.salary_currency = legacyJob.compensation?.currencyCode ?? 'USD';
  }

  const dateStr = legacyJob.pubDate ?? legacyJob.createDate;
  if (dateStr) {
    try { result.posted_at = new Date(dateStr).toISOString().split('T')[0]; } catch { /* ignore */ }
  }

  return result;
}

/**
 * Extract fields from a GraphQL JobDataResult node.
 *
 * Confirmed live structure (2026-04):
 *   jobDataResult.__typename = "JobDataResult"
 *   jobDataResult.job.key              → source_id
 *   jobDataResult.job.title            → title (no suffix)
 *   jobDataResult.job.sourceEmployerName → company
 *   jobDataResult.job.datePublished    → Unix ms timestamp
 *   jobDataResult.job.description.html → full HTML job description
 *   jobDataResult.job.location         → location object (structure TBD)
 *   jobDataResult.job.compensation     → salary (structure TBD)
 *   jobDataResult.job.remoteWorkModel  → work mode (structure TBD)
 */
function extractFromGqlJob(jobDataResult: any, result: StateExtraction, fallbackKey?: string): void {
  // The actual job fields are nested under .job
  const job: IndeedStateJob = jobDataResult?.job ?? jobDataResult;

  result.source_id = job.key ?? job.jobKey ?? fallbackKey;

  if (job.title) result.title = job.title;
  if (job.sourceEmployerName) result.company_name = job.sourceEmployerName;

  // Location
  const loc = job.location;
  if (typeof loc === 'string') {
    result.location = loc;
  } else if (loc?.formatted?.short) {
    result.location = loc.formatted.short;
  } else if (loc?.city && loc?.state) {
    result.location = `${loc.city}, ${loc.state}`;
  }

  // Work mode
  const remoteType = (job.remoteWorkModel?.type ?? '').toLowerCase();
  if (remoteType.includes('remote')) result.work_mode = 'remote';
  else if (remoteType.includes('hybrid')) result.work_mode = 'hybrid';
  else if (remoteType) result.work_mode = 'onsite';

  // Salary
  const comp = job.compensation;
  if (comp) {
    const range = comp.baseSalary?.range;
    if (range?.min != null) result.salary_min = range.min;
    if (range?.max != null) result.salary_max = range.max;
    if (result.salary_min || result.salary_max) {
      result.salary_currency = comp.currencyCode ?? 'USD';
    }
  }

  // Posted date: datePublished is a Unix timestamp in milliseconds
  if (job.datePublished) {
    try { result.posted_at = new Date(job.datePublished).toISOString().split('T')[0]; } catch { /* ignore */ }
  } else {
    const dateStr = job.pubDate ?? job.createDate;
    if (dateStr) {
      try { result.posted_at = new Date(dateStr).toISOString().split('T')[0]; } catch { /* ignore */ }
    }
  }

  // JD text: strip HTML tags from description.html
  const html = job.description?.html;
  if (html) {
    try {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const text = tmp.textContent?.trim() || '';
      if (text.length > 50) result.jd_full_text = text;
    } catch { /* ignore */ }
  }
}

function parseRelativeAge(age: string): string | null {
  const match = age.match(/(\d+)\s+(day|hour|week|month)s?\s+ago/i);
  if (!match) return null;
  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const now = new Date();
  switch (unit) {
    case 'hour':  now.setHours(now.getHours() - amount); break;
    case 'day':   now.setDate(now.getDate() - amount); break;
    case 'week':  now.setDate(now.getDate() - amount * 7); break;
    case 'month': now.setMonth(now.getMonth() - amount); break;
  }
  return now.toISOString().split('T')[0];
}

// ─── DOM Selector Helpers ────────────────────────────────────────────────────

function querySelector(selectors: string[]): Element | null {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch {
      // ignore invalid selector
    }
  }
  return null;
}

// ─── DOM Fallbacks ────────────────────────────────────────────────────────────

/** Strip Indeed's " - job post" / " - job ad" suffix from title text. */
function cleanTitle(raw: string): string {
  return raw.replace(/\s*-\s*(job post|job ad|job listing)\s*$/i, '').trim();
}

export function findTitle(): string | null {
  // Strategy 1: data-testid (confirmed working from live page inspection)
  const byTestId = querySelector([
    'h1[data-testid="jobsearch-JobInfoHeader-title"]',
    'h2[data-testid="jobsearch-JobInfoHeader-title"]',
  ]);
  if (byTestId) {
    // Use firstChild text to avoid sub-element suffixes like "- job post"
    const firstText = (byTestId.firstChild as Text)?.nodeValue?.trim()
      || byTestId.textContent?.trim() || '';
    if (firstText.length > 3) return cleanTitle(firstText);
  }

  // Strategy 2: h1 with jobTitle in class name
  const headings = document.querySelectorAll('h1, h2');
  for (const h of headings) {
    const cls = (h as HTMLElement).className || '';
    if (cls.toLowerCase().includes('jobtitle') || cls.toLowerCase().includes('job-title')) {
      const text = h.textContent?.trim();
      if (text && text.length > 3 && text.length < 200) return cleanTitle(text);
    }
  }

  // Strategy 3: first meaningful h1/h2
  for (const h of headings) {
    const text = h.textContent?.trim() || '';
    if (text.length > 3 && text.length < 200
        && !text.toLowerCase().includes('indeed')
        && !text.toLowerCase().includes('sign in')
        && !text.toLowerCase().includes('find jobs')) {
      return cleanTitle(text);
    }
  }

  // Strategy 4: document.title — "Title - Company - Location | Indeed.com"
  const titleParts = document.title.split(' - ');
  if (titleParts.length >= 2) return cleanTitle(titleParts[0].trim());

  console.log('[FirstIn/Indeed] DOM fallback used for title');
  return null;
}

export function findCompany(): string | null {
  // Strategy 1: data-testid attributes
  const byTestId = querySelector([
    '[data-testid="inlineHeader-companyName"] a',
    '[data-testid="inlineHeader-companyName"]',
    '[data-company-name="true"]',
  ]);
  if (byTestId?.textContent?.trim()) {
    console.log('[FirstIn/Indeed] DOM fallback used for company');
    return byTestId.textContent.trim();
  }

  // Strategy 2: document.title — "Title - Company - Location | Indeed.com"
  const titleParts = document.title.split(' - ');
  if (titleParts.length >= 3) {
    // Last part is "Location | Indeed.com", middle part(s) are company
    const companyPart = titleParts.slice(1, -1).join(' - ').replace(/\s*\|.*$/, '').trim();
    if (companyPart.length > 1) return companyPart;
  }

  console.log('[FirstIn/Indeed] DOM fallback used for company');
  return null;
}

export function findLocation(): { location: string | null; workMode: string | null } {
  // Strategy 1: confirmed working selector (job-location doesn't exist on Indeed search panel)
  const locEl = querySelector([
    '[data-testid="inlineHeader-companyLocation"]',
    '[data-testid="job-location"]',
  ]);

  let rawLocation = locEl?.textContent?.trim() || null;

  // Strategy 2: class-name heuristic
  if (!rawLocation) {
    const allEls = document.querySelectorAll('[class*="location"], [class*="Location"]');
    for (const el of allEls) {
      const text = el.textContent?.trim() || '';
      if (text.length > 2 && text.length < 100) { rawLocation = text; break; }
    }
  }

  // Work mode — check attribute chips first (most reliable on search panel)
  const chips = getAllAttributeChips();
  let workMode: string | null = null;
  for (const chip of chips) {
    const lower = chip.toLowerCase();
    if (lower === 'remote' || lower.includes('fully remote') || lower.startsWith('remote work')) {
      workMode = 'remote'; break;
    }
    if (lower.includes('hybrid')) { workMode = 'hybrid'; break; }
    if (lower.includes('on-site') || lower === 'in person' || lower.includes('in-person')) {
      workMode = 'onsite'; break;
    }
  }

  // If not in chips, try parsing from location string
  if (!workMode && rawLocation) {
    const lower = rawLocation.toLowerCase();
    if (lower.includes('remote') && lower.includes('hybrid')) workMode = 'hybrid';
    else if (lower.includes('remote')) workMode = 'remote';
    else if (lower.includes('hybrid')) workMode = 'hybrid';
    else if (lower.includes('on-site') || lower.includes('in person')) workMode = 'onsite';
  }

  // Strip work mode labels from location string
  const locationClean = rawLocation
    ?.replace(/\s*[-–·]\s*(remote|hybrid|on-site|in person|in-person|temporarily remote)/gi, '')
    .replace(/^(remote|hybrid|on-site|in person|in-person)\s*[-–·]\s*/gi, '')
    .trim() || null;

  return { location: locationClean || rawLocation, workMode };
}

export function findDescription(): string | null {
  // Strategy 1: #jobDescriptionText — indeed's long-standing stable ID
  const byId = document.getElementById('jobDescriptionText');
  if (byId?.textContent?.trim()) return byId.textContent.trim();

  // Strategy 2: id contains "jobDescription"
  const byPartialId = querySelector([
    '[id*="jobDescription"]',
    '[class*="jobDescription"]',
    '.jobsearch-jobDescriptionText',
  ]);
  if (byPartialId?.textContent?.trim()) return byPartialId.textContent.trim();

  // Strategy 3: heuristic — largest text block > 300 chars with JD signals
  const allDivs = document.querySelectorAll('div, section, article');
  let best: Element | null = null;
  let bestLen = 0;
  for (const div of allDivs) {
    // Only direct children text to avoid nesting explosion
    if (div.children.length > 30) continue;
    const text = div.textContent?.trim() || '';
    if (text.length > 300 && text.length < 30000 && text.length > bestLen) {
      const lower = text.toLowerCase();
      const signals = ['responsibilit', 'qualificat', 'experience', 'requirement', 'about the role', 'what you'];
      if (signals.filter(s => lower.includes(s)).length >= 2) {
        best = div;
        bestLen = text.length;
      }
    }
  }
  if (best) return best.textContent?.trim() || null;

  console.log('[FirstIn/Indeed] DOM fallback used for description — not found');
  return null;
}

/**
 * Get all attribute chip texts (data-testid="attribute_snippet_testid").
 * Indeed shows multiple chips: salary, work mode, job type, benefits, etc.
 * We must iterate all of them, not just the first.
 */
function getAllAttributeChips(): string[] {
  return [...document.querySelectorAll('[data-testid="attribute_snippet_testid"]')]
    .map(el => el.textContent?.trim() || '')
    .filter(Boolean);
}

/** Parse a salary range from a text string. Handles $80,000, $80K, $80k/yr etc. */
function parseSalaryText(text: string): { min: number; max: number; currency: string } | null {
  // Normalize K notation: $80K → $80,000
  const normalized = text.replace(/\$(\d+(?:\.\d+)?)K/gi, (_, n) => `$${Math.round(parseFloat(n) * 1000)}`);
  const match = normalized.match(
    /(?:from\s+|up\s+to\s+)?\$(\d[\d,.]*)(?:\s*[-–to]\s*\$(\d[\d,.]*))?(?:\s*(?:a|per|\/)\s*(?:year|yr|hour|hr|annum))?/i
  );
  if (!match) return null;
  const parse = (s: string) => parseInt(s.replace(/[,.]/g, ''), 10);
  const min = parse(match[1]);
  const max = match[2] ? parse(match[2]) : min;
  // Sanity check: salary should be > $1,000 (not a zip code or some other number)
  if (min < 1000 || min > 10_000_000) return null;
  return { min, max, currency: 'USD' };
}

export function findSalary(stateHint?: StateExtraction): { min?: number; max?: number; currency?: string } | null {
  if (stateHint?.salary_min != null || stateHint?.salary_max != null) {
    return { min: stateHint.salary_min, max: stateHint.salary_max, currency: stateHint.salary_currency ?? 'USD' };
  }

  // Strategy 1: scan ALL attribute chips — salary is one of them
  for (const chip of getAllAttributeChips()) {
    const result = parseSalaryText(chip);
    if (result) return result;
  }

  // Strategy 2: dedicated salary element (viewjob page)
  const salaryEl = querySelector(['#salaryInfoAndJobType', '[data-testid="salary-snippet"]']);
  if (salaryEl) {
    const result = parseSalaryText(salaryEl.textContent || '');
    if (result) return result;
  }

  // Strategy 3: regex scan on visible page text
  // Scope to header/content area to avoid false positives (e.g. footer numbers)
  const contentEl = document.querySelector('#jobDescriptionText, main, [role="main"]') ?? document.body;
  return parseSalaryText(contentEl.textContent || '');
}

export function findPostedDate(): string | null {
  // Strategy 1: data-testid
  const dateEl = querySelector([
    '[data-testid="myJobsStateDate"]',
    '[class*="postedDate"], [class*="posted-date"]',
  ]);
  let text = dateEl?.textContent?.trim() || '';

  // Strip common prefixes
  text = text.replace(/^(posted|active|reposted)\s*/i, '').trim();

  // Strategy 2: scan all elements for relative date pattern
  if (!text) {
    const allEls = document.querySelectorAll('span, p, div');
    for (const el of allEls) {
      const t = el.textContent?.trim() || '';
      if (/^\s*(?:posted|active|reposted)?\s*\d+\s+(?:day|hour|week|month)s?\s+ago/i.test(t) && t.length < 50) {
        text = t.replace(/^(posted|active|reposted)\s*/i, '').trim();
        break;
      }
    }
  }

  if (!text) return null;

  const match = text.match(/(\d+)\s+(second|minute|hour|day|week|month)s?\s+ago/i);
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const now = new Date();

  switch (unit) {
    case 'second': now.setSeconds(now.getSeconds() - amount); break;
    case 'minute': now.setMinutes(now.getMinutes() - amount); break;
    case 'hour':   now.setHours(now.getHours() - amount); break;
    case 'day':    now.setDate(now.getDate() - amount); break;
    case 'week':   now.setDate(now.getDate() - amount * 7); break;
    case 'month':  now.setMonth(now.getMonth() - amount); break;
  }

  return now.toISOString().split('T')[0];
}

export function findSourceId(): string | null {
  const params = new URLSearchParams(window.location.search);
  // /viewjob?jk=... or /jobs?...&vjk=... (search results selected job)
  const jk = params.get('jk') ?? params.get('vjk');
  if (jk) return jk;

  // Fallback: data-jk attribute anywhere in page
  return document.querySelector('[data-jk]')?.getAttribute('data-jk') ?? null;
}

export function findApplyUrl(): string | null {
  const applyEl = querySelector([
    'a[data-testid="applyButton"]',
    'a#applyButton',
    'button[data-testid="applyButton"]',
    'a[id*="applyButton"]',
    'a[href*="smartapply"]',
    'a[href*="/apply/"]',
  ]);
  if (applyEl) {
    const href = (applyEl as HTMLAnchorElement).href;
    if (href && href !== '#') return href;
  }
  return null;
}
