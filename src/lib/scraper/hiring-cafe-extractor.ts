import type { Page } from 'playwright';

export interface ExtractedJob {
  title: string;
  company: string;
  location: string[];
  salary_min: number | null;
  salary_max: number | null;
  work_mode: string | null;
  commitment: string | null;
  jd_url: string;
  source_id: string;
}

interface CardInfo {
  company: string;
  viewJobId: string;
  viewAllHref: string | null;
  hasCarousel: boolean;
}

/**
 * Build hiring.cafe search URL from query params.
 * hiring.cafe uses /?searchState={JSON} format.
 */
export function buildSearchUrl(queryParams: Record<string, unknown>): string {
  const searchState = {
    ...queryParams,
    dateFetchedPastNDays: queryParams.dateFetchedPastNDays ?? 3,
  };
  return `https://hiring.cafe/?searchState=${encodeURIComponent(JSON.stringify(searchState))}`;
}

/**
 * Fix View All URL — hiring.cafe resets dateFetchedPastNDays to -1
 * when generating "View all" links. We need to restore the original value.
 */
export function fixViewAllUrl(href: string, originalDays: number): string {
  try {
    const url = new URL(href, 'https://hiring.cafe');
    const stateStr = url.searchParams.get('searchState');
    if (!stateStr) return href;
    const state = JSON.parse(stateStr);
    if (state.dateFetchedPastNDays === -1) {
      state.dateFetchedPastNDays = originalDays;
    }
    url.searchParams.set('searchState', JSON.stringify(state));
    return url.pathname + url.search;
  } catch {
    return href;
  }
}

/**
 * Scroll to load all cards on the page.
 * Uses scrollBy instead of scrollTo for more reliable lazy-loading trigger.
 */
async function scrollToLoadAll(page: Page, scrollCount = 15, delay = 1200): Promise<void> {
  for (let i = 0; i < scrollCount; i++) {
    await page.evaluate(() => window.scrollBy(0, 3000));
    await page.waitForTimeout(delay);
  }
  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);
}

/**
 * Parse salary text like "$150,000 - $200,000" or "$150k-200k"
 */
function parseSalary(text: string): { min: number | null; max: number | null } {
  if (!text || text === 'Undisclosed') return { min: null, max: null };
  const numbers: number[] = [];
  const matches = text.matchAll(/\$?([\d,]+)k?/gi);
  for (const match of matches) {
    let num = parseInt(match[1].replace(/,/g, ''), 10);
    if (text.toLowerCase().includes('k') && num < 1000) num *= 1000;
    numbers.push(num);
  }
  if (numbers.length >= 2) return { min: numbers[0], max: numbers[1] };
  if (numbers.length === 1) return { min: numbers[0], max: numbers[0] };
  return { min: null, max: null };
}

/**
 * Parse location text — split by " or " / ", " into array.
 */
function parseLocation(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\s+or\s+|,\s*/)
    .map((l) => l.trim())
    .filter(Boolean);
}

interface RawJob {
  viewJobId: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  workMode: string;
  commitment: string;
}

/**
 * Extract job data from the current page using proven DOM selectors from M00 probe.
 * Works for both main search page and "View all" company pages.
 */
async function extractRawJobsFromPage(page: Page, fallbackCompany = ''): Promise<RawJob[]> {
  return page.evaluate((fbCompany) => {
    // Find the list container: the div with the most children containing viewjob links
    const allDivs = document.querySelectorAll('div');
    let listContainer: Element | null = null;
    let maxJobChildren = 0;
    allDivs.forEach((div) => {
      const jobChildren = Array.from(div.children).filter((child) =>
        child.querySelector('a[href*="/viewjob/"]')
      );
      if (jobChildren.length > maxJobChildren) {
        maxJobChildren = jobChildren.length;
        listContainer = div;
      }
    });
    if (!listContainer) return [];

    const cards = Array.from((listContainer as HTMLElement).children).filter((child) =>
      child.querySelector('a[href*="/viewjob/"]')
    );

    return cards.map((card) => {
      const el = card as HTMLElement;

      // viewJobId from the /viewjob/ link
      const jpLink = el.querySelector('a[href*="/viewjob/"]');
      const href = (jpLink as HTMLAnchorElement)?.getAttribute('href') || '';
      const viewJobId = href.replace('/viewjob/', '');

      // Title: span.font-bold inside .mr-10 or span.w-full.font-bold
      const titleEl =
        el.querySelector('.mr-10 span.font-bold') || el.querySelector('span.w-full.font-bold');
      const title = titleEl?.textContent?.trim() || '';

      // Company: span.font-bold inside .line-clamp-3.font-light
      const companySection = el.querySelector('.line-clamp-3.font-light');
      const companyBold = companySection?.querySelector('span.font-bold');
      const company = companyBold?.textContent?.trim() || fbCompany;

      // Location: span.line-clamp-2
      const locationEl = el.querySelector('span.line-clamp-2');
      const location = locationEl?.textContent?.trim() || '';

      // Tags: salary, workMode, commitment from flex-wrap gap-1.5
      const tags = el.querySelectorAll('.flex.flex-wrap.gap-1\\.5 span');
      const tagTexts = Array.from(tags).map((t) => t.textContent?.trim() || '');
      let salary = '',
        workMode = '',
        commitment = '';
      for (const t of tagTexts) {
        if (t.includes('$') || t.includes('Undisclosed')) salary = t;
        else if (['Remote', 'Hybrid', 'Onsite'].includes(t)) workMode = t;
        else if (
          ['Full Time', 'Part Time', 'Contract', 'Temporary'].includes(t) ||
          t.includes('Commitments')
        )
          commitment = t;
      }

      return { viewJobId, title, company, location, salary, workMode, commitment };
    });
  }, fallbackCompany);
}

/**
 * Extract card info for identifying carousel companies that need "View all" expansion.
 */
async function extractCardsInfo(page: Page): Promise<CardInfo[]> {
  return page.evaluate(() => {
    const allDivs = document.querySelectorAll('div');
    let listContainer: Element | null = null;
    let maxJobChildren = 0;
    allDivs.forEach((div) => {
      const jobChildren = Array.from(div.children).filter((child) =>
        child.querySelector('a[href*="/viewjob/"]')
      );
      if (jobChildren.length > maxJobChildren) {
        maxJobChildren = jobChildren.length;
        listContainer = div;
      }
    });
    if (!listContainer) return [];

    const cards = Array.from((listContainer as HTMLElement).children).filter((child) =>
      child.querySelector('a[href*="/viewjob/"]')
    );

    return cards.map((card) => {
      const el = card as HTMLElement;
      const jpLink = el.querySelector('a[href*="/viewjob/"]');
      const viewJobId = jpLink
        ? (jpLink as HTMLAnchorElement).getAttribute('href')?.replace('/viewjob/', '') || ''
        : '';

      const viewAllLink = Array.from(el.querySelectorAll('a')).find((a) =>
        a.textContent?.includes('View all')
      );
      const viewAllHref = viewAllLink
        ? (viewAllLink as HTMLAnchorElement).getAttribute('href')
        : null;

      const companySection = el.querySelector('.line-clamp-3.font-light');
      const companyBold = companySection?.querySelector('span.font-bold');
      const company = companyBold?.textContent?.trim() || '';

      const buttons = el.querySelectorAll('button');

      return {
        company,
        viewJobId,
        viewAllHref,
        hasCarousel: buttons.length > 2,
      };
    });
  });
}

/**
 * Full extraction pipeline: main page + carousel expansion via "View all".
 * Returns deduplicated list of all extracted jobs.
 */
export async function extractAllJobs(
  page: Page,
  queryParams: Record<string, unknown>,
): Promise<ExtractedJob[]> {
  const searchUrl = buildSearchUrl(queryParams);
  const dateFetchedDays = (queryParams.dateFetchedPastNDays as number) ?? 3;

  // Load search results
  await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(8000);

  // Scroll to load all cards
  await scrollToLoadAll(page);

  // Extract main page jobs
  const allJobsMap = new Map<string, RawJob>();
  const mainJobs = await extractRawJobsFromPage(page);
  for (const job of mainJobs) {
    allJobsMap.set(job.viewJobId, job);
  }

  // Identify carousel companies and expand them
  const cardInfos = await extractCardsInfo(page);
  const carouselCards = cardInfos.filter((c) => c.hasCarousel && c.viewAllHref);

  for (const card of carouselCards) {
    if (!card.viewAllHref) continue;

    const fixedHref = fixViewAllUrl(card.viewAllHref, dateFetchedDays);
    const fullUrl = `https://hiring.cafe${fixedHref}`;

    await page.waitForTimeout(2000);

    try {
      await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(4000);

      // Scroll to load all
      await scrollToLoadAll(page, 5, 1000);

      const expandedJobs = await extractRawJobsFromPage(page, card.company);
      for (const job of expandedJobs) {
        if (!allJobsMap.has(job.viewJobId)) {
          allJobsMap.set(job.viewJobId, job);
        }
      }
    } catch {
      // Continue on failure
    }
  }

  // Convert raw jobs to ExtractedJob format
  const jobs = Array.from(allJobsMap.values());
  return jobs
    .filter((j) => j.title && j.viewJobId)
    .map((j) => {
      const salary = parseSalary(j.salary);
      return {
        title: j.title,
        company: j.company || 'Unknown',
        location: parseLocation(j.location),
        salary_min: salary.min,
        salary_max: salary.max,
        work_mode: j.workMode?.toLowerCase() || null,
        commitment: j.commitment || null,
        jd_url: `https://hiring.cafe/viewjob/${j.viewJobId}`,
        source_id: j.viewJobId,
      };
    });
}

/**
 * Navigate to /viewjob/{id} and extract the full JD text.
 */
export async function extractJobDescription(
  page: Page,
  jobUrl: string,
): Promise<string | null> {
  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    const text = await page.evaluate(() => {
      // Try to find the JD content container
      const selectors = [
        '[class*="description"]',
        '[class*="job-detail"]',
        '[class*="content"]',
        'article',
        'main',
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.length > 200) {
          return el.textContent.trim();
        }
      }

      // Fallback: get all text from body
      return document.body?.innerText?.trim() || null;
    });

    return text || null;
  } catch {
    return null;
  }
}
