/**
 * LinkedIn DOM selectors — isolated for easy maintenance when LinkedIn changes their DOM.
 *
 * As of 2026-04, LinkedIn uses obfuscated CSS class names (e.g. _6442cfcd).
 * We rely on stable attributes: data-testid, aria-label, href patterns,
 * DOM structure, and document.title as ultimate fallback.
 *
 * Last verified: 2026-04-02
 */

/**
 * Try multiple selectors and return first match
 */
export function querySelector(selectors: string[], root: Element | Document = document): Element | null {
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (el) return el;
  }
  return null;
}

/**
 * Extract job title.
 */
export function findTitle(): string | null {
  // Strategy 1: aria-label based (jobs/view detail page)
  const companyDiv = document.querySelector('div[aria-label^="Company,"]');
  if (companyDiv) {
    const wrapper = companyDiv.closest('a[componentkey]')?.parentElement?.parentElement;
    if (wrapper) {
      const paragraphs = wrapper.querySelectorAll('p');
      for (const p of paragraphs) {
        const text = p.textContent?.trim() || '';
        if (text.length > 3 && !text.includes('Promoted') && !text.includes('ago') && !text.includes('applicant')) {
          // Avoid returning the company name
          const ariaLabel = companyDiv.getAttribute('aria-label') || '';
          const companyFromAria = ariaLabel.match(/^Company,\s*(.+?)\.?$/)?.[1]?.trim();
          if (companyFromAria && text === companyFromAria) continue;
          return text.replace(/\s+/g, ' ').trim();
        }
      }
    }
  }

  // Strategy 2: h1/h2 elements — search page detail panel often has the title in an h1 or h2
  const headings = document.querySelectorAll('h1, h2');
  for (const h of headings) {
    const text = h.textContent?.trim() || '';
    // Title is usually 5+ chars, and not a generic heading
    if (text.length > 4 && text.length < 200
        && !text.toLowerCase().includes('linkedin')
        && !text.toLowerCase().includes('sign in')
        && !text.toLowerCase().includes('job search')
        && !text.toLowerCase().includes('people also viewed')) {
      // On search pages, the right panel title h2 is usually the first meaningful h1/h2
      // Verify it's in the detail/right panel area, not the sidebar
      const rect = (h as HTMLElement).getBoundingClientRect?.();
      // If the heading is in the right half of the page, it's likely the detail title
      if (rect && rect.left > window.innerWidth * 0.3) {
        return text.replace(/\s+/g, ' ').trim();
      }
    }
  }

  // Strategy 3: document.title — "Job Title | Company | LinkedIn" or "Title - Company | LinkedIn"
  const titleMatch2Pipe = document.title.match(/^(.+?)\s*\|\s*.+\|\s*LinkedIn$/);
  if (titleMatch2Pipe) return titleMatch2Pipe[1].trim();

  const titleMatchDash = document.title.match(/^(.+?)\s*[-–]\s*.+\|\s*LinkedIn$/);
  if (titleMatchDash) return titleMatchDash[1].trim();

  return null;
}

/**
 * Extract company name from aria-label, company link, or document.title
 */
export function findCompany(): string | null {
  // aria-label="Company, BrightAI."
  const companyDiv = document.querySelector('div[aria-label^="Company,"]');
  if (companyDiv) {
    const label = companyDiv.getAttribute('aria-label') || '';
    const match = label.match(/^Company,\s*(.+?)\.?$/);
    if (match) return match[1].trim();
  }

  // Link to /company/ page — prefer one in the right/detail panel area
  const companyLinks = document.querySelectorAll('a[href*="/company/"]');
  for (const link of companyLinks) {
    const text = link.textContent?.trim();
    if (!text || text.length <= 1) continue;
    // On search pages, company links appear in both left (job cards) and right (detail) panels
    // Prefer the one in the right panel (x > 30% of viewport)
    const rect = (link as HTMLElement).getBoundingClientRect?.();
    if (rect && rect.left > window.innerWidth * 0.3) {
      return text;
    }
  }
  // If no right-panel link found, take the first one
  for (const link of companyLinks) {
    const text = link.textContent?.trim();
    if (text && text.length > 1) return text;
  }

  // document.title: "Title | Company | LinkedIn"
  const titleMatch = document.title.match(/\|\s*(.+?)\s*\|\s*LinkedIn$/);
  if (titleMatch) return titleMatch[1].trim();

  return null;
}

/**
 * Click "...more" / "Show more" buttons to expand truncated JD text.
 * Must be called before extracting description.
 */
export function expandDescription(): void {
  // Strategy 1: known aria-labels and data attributes
  const expandSelectors = [
    'button[aria-label*="see more description"]',
    'button[aria-label*="Show more"]',
    'button[aria-label*="show more"]',
    'a[data-tracking-control-name*="show-more"]',
  ];
  for (const sel of expandSelectors) {
    const btn = document.querySelector(sel) as HTMLElement | null;
    if (btn) {
      console.log('[FirstIn] clicking expand button:', sel);
      btn.click();
      return;
    }
  }

  // Strategy 2: find any button/a/span whose text is exactly "more" or "Show more"
  // near the JD area or anywhere on the detail panel
  const allClickable = document.querySelectorAll('button, a, span[role="button"]');
  for (const el of allClickable) {
    const text = (el.textContent || '').trim().toLowerCase();
    if (text === 'more' || text === '…more' || text === '\u2026more'
        || text === '... more' || text === 'show more' || text === 'see more') {
      // Make sure it's not a "Show more jobs" or navigation button
      if (text.includes('jobs') || text.includes('result')) continue;
      console.log('[FirstIn] clicking text-matched expand:', el.textContent?.trim());
      (el as HTMLElement).click();
      return;
    }
  }

  console.log('[FirstIn] no expand button found');
}

/**
 * Extract job description from the expandable text box
 */
export function findDescription(): string | null {
  // data-testid="expandable-text-box" is the JD container
  const el = document.querySelector('span[data-testid="expandable-text-box"]');
  if (el) return el.textContent?.trim() || null;

  // Fallback selectors
  const fallback = querySelector([
    '#job-details',
    '.jobs-description__content',
    '.jobs-description-content__text',
    '.jobs-box__html-content',
  ]);
  if (fallback) return fallback.textContent?.trim() || null;

  // Last resort: find a large text block that looks like a JD
  // JDs typically have 200+ characters with keywords like "responsibilities", "qualifications", "experience"
  const allDivs = document.querySelectorAll('div, section, article');
  let bestCandidate: Element | null = null;
  let bestLength = 0;
  for (const div of allDivs) {
    const text = div.textContent?.trim() || '';
    if (text.length > 300 && text.length < 20000) {
      const lower = text.toLowerCase();
      const jdSignals = ['responsibilit', 'qualificat', 'experience', 'requirement', 'about the role', 'what you'];
      const matchCount = jdSignals.filter(s => lower.includes(s)).length;
      if (matchCount >= 2 && text.length > bestLength) {
        bestLength = text.length;
        bestCandidate = div;
      }
    }
  }
  if (bestCandidate) return bestCandidate.textContent?.trim() || null;

  return null;
}

/**
 * Extract location and work mode from the metadata line below company.
 * Handles both /jobs/view/ and /jobs/search/ layouts.
 */
export function findLocationMeta(): { location: string | null; workMode: string | null } {
  let location: string | null = null;
  let workMode: string | null = null;

  // Collect candidate containers
  const candidates: Element[] = [];

  // Strategy 1: aria-label wrapper (jobs/view)
  const companyDiv = document.querySelector('div[aria-label^="Company,"]');
  const wrapper = companyDiv?.closest('a[componentkey]')?.parentElement?.parentElement;
  if (wrapper) candidates.push(wrapper);

  // Strategy 2: look for elements with "·" separator near company/title area
  // These contain "City, State · Remote · 2 days ago" type text
  const allSpans = document.querySelectorAll('span, p, div');
  for (const el of allSpans) {
    const text = el.textContent?.trim() || '';
    if (text.includes('·') && text.length < 300
        && (text.includes('ago') || text.includes('applicant') || text.includes('click'))) {
      // Check it's in the right/detail panel
      const rect = (el as HTMLElement).getBoundingClientRect?.();
      if (rect && rect.left > window.innerWidth * 0.3) {
        candidates.push(el);
        break;
      }
    }
  }

  for (const container of candidates) {
    const text = container.textContent?.trim() || '';
    if (!text.includes('·')) continue;

    const parts = text.split('·').map(s => s.trim());
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (!workMode) {
        if (lower.includes('remote')) workMode = 'remote';
        else if (lower.includes('hybrid')) workMode = 'hybrid';
        else if (lower.includes('on-site') || lower.includes('onsite')) workMode = 'onsite';
      }
      if (!location && part.length > 2 && part.length < 60
          && !lower.includes('ago') && !lower.includes('applicant') && !lower.includes('click')
          && !lower.includes('remote') && !lower.includes('hybrid') && !lower.includes('on-site')
          && !lower.includes('reposted') && !lower.includes('promoted')) {
        location = part;
      }
    }
    if (location || workMode) break;
  }

  return { location, workMode };
}

/**
 * Extract salary from page text
 */
export function findSalary(): { min?: number; max?: number; currency?: string } | null {
  const body = document.body.textContent || '';

  // Match patterns like "$120,000/yr - $180,000/yr" or "$50/hr - $75/hr"
  const match = body.match(/\$(\d[\d,]*)\s*(?:\/\w+)?\s*-\s*\$(\d[\d,]*)/);
  if (match) {
    const min = parseInt(match[1].replace(/,/g, ''), 10);
    const max = parseInt(match[2].replace(/,/g, ''), 10);
    return { min, max, currency: 'USD' };
  }

  return null;
}

/**
 * Extract posted date from LinkedIn metadata line.
 * Parses relative times like "2 days ago", "1 week ago", "Reposted 3 days ago"
 * and converts to an ISO date string (YYYY-MM-DD).
 */
export function findPostedDate(): string | null {
  const allEls = document.querySelectorAll('span, p, div');
  for (const el of allEls) {
    const text = el.textContent?.trim() || '';
    const match = text.match(/(?:reposted\s+)?(\d+)\s+(second|minute|hour|day|week|month)s?\s+ago/i);
    if (match) {
      const rect = (el as HTMLElement).getBoundingClientRect?.();
      if (rect && rect.left < window.innerWidth * 0.3) continue;

      const amount = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      const now = new Date();

      switch (unit) {
        case 'second': now.setSeconds(now.getSeconds() - amount); break;
        case 'minute': now.setMinutes(now.getMinutes() - amount); break;
        case 'hour': now.setHours(now.getHours() - amount); break;
        case 'day': now.setDate(now.getDate() - amount); break;
        case 'week': now.setDate(now.getDate() - amount * 7); break;
        case 'month': now.setMonth(now.getMonth() - amount); break;
      }

      return now.toISOString().split('T')[0];
    }
  }

  return null;
}
