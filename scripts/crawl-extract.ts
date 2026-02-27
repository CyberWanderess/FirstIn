#!/usr/bin/env npx tsx
/**
 * Standalone crawl script — runs Playwright outside of Next.js runtime.
 *
 * Usage:
 *   npx tsx scripts/crawl-extract.ts '{"query_params": {...}, "dateFetchedPastNDays": 3}'
 *
 * Input: JSON string as first CLI argument with query_params
 * Output: JSON array of extracted jobs to stdout
 * Logs go to stderr so they don't interfere with JSON output
 */

import { chromium, type Page, type BrowserContext, type Browser } from 'playwright';

interface ExtractedJob {
  title: string;
  company: string;
  location: string;
  salary: string;
  workMode: string;
  commitment: string;
  viewJobId: string;
  jdText: string | null;
}

interface CardInfo {
  company: string;
  viewJobId: string;
  viewAllHref: string | null;
  hasCarousel: boolean;
}

function log(msg: string) {
  process.stderr.write(`[${new Date().toISOString()}] ${msg}\n`);
}

async function createStealthContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    colorScheme: 'light',
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' },
      ],
    });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    (window as any).chrome = {
      runtime: { onMessage: { addListener: () => {} }, sendMessage: () => {} },
      loadTimes: () => ({}),
      csi: () => ({}),
    };
  });

  return context;
}

function fixViewAllUrl(href: string, originalDays: number): string {
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

async function extractRawJobsFromPage(page: Page, fallbackCompany = ''): Promise<ExtractedJob[]> {
  return page.evaluate((fbCompany) => {
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
      const href = (jpLink as HTMLAnchorElement)?.getAttribute('href') || '';
      const viewJobId = href.replace('/viewjob/', '');

      const titleEl =
        el.querySelector('.mr-10 span.font-bold') || el.querySelector('span.w-full.font-bold');
      const title = titleEl?.textContent?.trim() || '';

      const companySection = el.querySelector('.line-clamp-3.font-light');
      const companyBold = companySection?.querySelector('span.font-bold');
      const company = companyBold?.textContent?.trim() || fbCompany;

      const locationEl = el.querySelector('span.line-clamp-2');
      const location = locationEl?.textContent?.trim() || '';

      const tags = el.querySelectorAll('.flex.flex-wrap.gap-1\\.5 span');
      const tagTexts = Array.from(tags).map((t) => t.textContent?.trim() || '');
      let salary = '', workMode = '', commitment = '';
      for (const t of tagTexts) {
        if (t.includes('$') || t.includes('Undisclosed')) salary = t;
        else if (['Remote', 'Hybrid', 'Onsite'].includes(t)) workMode = t;
        else if (['Full Time', 'Part Time', 'Contract', 'Temporary'].includes(t) || t.includes('Commitments'))
          commitment = t;
      }

      return { viewJobId, title, company, location, salary, workMode, commitment, jdText: null };
    });
  }, fallbackCompany);
}

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

      return { company, viewJobId, viewAllHref, hasCarousel: buttons.length > 2 };
    });
  });
}

async function extractJobDescription(page: Page, jobUrl: string): Promise<string | null> {
  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    return page.evaluate(() => {
      const selectors = ['[class*="description"]', '[class*="job-detail"]', '[class*="content"]', 'article', 'main'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.length > 200) {
          return el.textContent.trim();
        }
      }
      return document.body?.innerText?.trim() || null;
    });
  } catch {
    return null;
  }
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    log('Usage: npx tsx scripts/crawl-extract.ts \'{"query_params": {...}}\'');
    process.exit(1);
  }

  let config: { query_params: Record<string, any>; fetch_jd?: boolean; delay_ms?: number };
  try {
    config = JSON.parse(input);
  } catch {
    log('Invalid JSON input');
    process.exit(1);
  }

  const queryParams = config.query_params;
  const fetchJd = config.fetch_jd !== false;
  const delayMs = config.delay_ms ?? 5000;
  const dateFetchedDays = (queryParams.dateFetchedPastNDays as number) ?? 2;

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1920,1080'],
  });

  try {
    const context = await createStealthContext(browser);
    const page = await context.newPage();

    // Step 1: Bypass Vercel checkpoint
    log('Bypassing Vercel checkpoint...');
    await page.goto('https://hiring.cafe', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(12000);
    const title = await page.title();
    if (title.toLowerCase().includes('vercel')) {
      // Try waiting more
      log('Still on checkpoint, waiting 10 more seconds...');
      await page.waitForTimeout(10000);
      const title2 = await page.title();
      if (title2.toLowerCase().includes('vercel')) {
        log('BLOCKED by Vercel Security Checkpoint');
        console.log(JSON.stringify([]));
        process.exit(0);
      }
    }
    log('Checkpoint passed.');
    await page.waitForTimeout(2000);

    // Step 2: Load search
    const searchUrl = `https://hiring.cafe/?searchState=${encodeURIComponent(JSON.stringify(queryParams))}`;
    log('Loading search results...');
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(8000);

    // Step 3: Scroll to load all cards
    log('Scrolling to load all cards...');
    for (let i = 0; i < 15; i++) {
      await page.evaluate(() => window.scrollBy(0, 3000));
      await page.waitForTimeout(1200);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    // Step 4: Extract main page
    const allJobsMap = new Map<string, ExtractedJob>();
    const mainJobs = await extractRawJobsFromPage(page);
    log(`Main page: ${mainJobs.length} cards`);
    for (const job of mainJobs) {
      allJobsMap.set(job.viewJobId, job);
    }

    // Step 5: Expand carousel companies
    const cardInfos = await extractCardsInfo(page);
    const carouselCards = cardInfos.filter((c) => c.hasCarousel && c.viewAllHref);
    log(`Companies with carousel: ${carouselCards.length}`);

    let expandIdx = 0;
    for (const card of carouselCards) {
      if (!card.viewAllHref) continue;
      expandIdx++;

      const fixedHref = fixViewAllUrl(card.viewAllHref, dateFetchedDays);
      const fullUrl = `https://hiring.cafe${fixedHref}`;

      log(`[${expandIdx}/${carouselCards.length}] Expanding: ${card.company}...`);
      await page.waitForTimeout(2000);

      try {
        await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(4000);

        for (let i = 0; i < 5; i++) {
          await page.evaluate(() => window.scrollBy(0, 2000));
          await page.waitForTimeout(1000);
        }

        const expandedJobs = await extractRawJobsFromPage(page, card.company);
        const newJobs = expandedJobs.filter((j) => !allJobsMap.has(j.viewJobId));
        for (const job of expandedJobs) {
          if (!allJobsMap.has(job.viewJobId)) {
            allJobsMap.set(job.viewJobId, job);
          }
        }
        log(`  Extracted ${expandedJobs.length} cards (${newJobs.length} new). Total: ${allJobsMap.size}`);
      } catch (err: any) {
        log(`  ERROR: ${err.message}`);
      }
    }

    log(`Total unique jobs: ${allJobsMap.size}`);

    // Step 6: Fetch JD for each job
    const jobs = Array.from(allJobsMap.values()).filter((j) => j.title && j.viewJobId);

    if (fetchJd) {
      log(`Fetching JD for ${jobs.length} jobs (delay: ${delayMs}ms)...`);
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const url = `https://hiring.cafe/viewjob/${job.viewJobId}`;
        try {
          const jdText = await extractJobDescription(page, url);
          job.jdText = jdText;
          log(`  [${i + 1}/${jobs.length}] ${job.title} — ${jdText ? jdText.length + ' chars' : 'no JD'}`);
        } catch {
          log(`  [${i + 1}/${jobs.length}] ${job.title} — FAILED`);
        }
        if (delayMs > 0 && i < jobs.length - 1) {
          await page.waitForTimeout(delayMs);
        }
      }
    }

    await context.close();

    // Output JSON to stdout
    console.log(JSON.stringify(jobs));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  console.log(JSON.stringify([]));
  process.exit(1);
});
