#!/usr/bin/env npx tsx
/**
 * Lightweight search verification script.
 * Loads the first enabled search config from the database,
 * opens the hiring.cafe search URL, counts cards, and reports.
 * No carousel expansion or JD fetch. Runs in ~2 minutes.
 *
 * Usage: DATABASE_PATH=data/jobhq.db npx tsx scripts/test-search.ts
 */

import { resolve } from 'path';
import { chromium } from 'playwright';

// Default DATABASE_PATH to data/jobhq.db (relative to project root) if not set
if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = resolve(process.cwd(), 'data', 'jobhq.db');
}

import { getDb, closeDb } from '../src/lib/db';

function log(msg: string) {
  process.stderr.write(`[${new Date().toISOString()}] ${msg}\n`);
}

function loadSearchUrl(): string {
  const db = getDb();
  const row = db.prepare(
    'SELECT query_params FROM search_configs WHERE enabled = 1 ORDER BY id LIMIT 1'
  ).get() as { query_params: string } | undefined;
  closeDb();

  if (!row) {
    throw new Error('No enabled search config found in database. Create one via the Settings UI first.');
  }

  const queryParams = JSON.parse(row.query_params);
  return `https://hiring.cafe/?searchState=${encodeURIComponent(JSON.stringify(queryParams))}`;
}

async function main() {
  const searchUrl = loadSearchUrl();

  log('=== Search Verification Test ===');
  log(`URL: ${searchUrl.substring(0, 80)}...`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1920,1080'],
  });

  try {
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

    const page = await context.newPage();

    // Bypass Vercel checkpoint
    log('Bypassing Vercel checkpoint...');
    await page.goto('https://hiring.cafe', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(12000);
    const title = await page.title();
    if (title.toLowerCase().includes('vercel')) {
      log('Still on checkpoint, waiting 10 more seconds...');
      await page.waitForTimeout(10000);
      const title2 = await page.title();
      if (title2.toLowerCase().includes('vercel')) {
        log('BLOCKED by Vercel Security Checkpoint. Aborting.');
        console.log(JSON.stringify({ error: 'blocked', cards: 0 }));
        return;
      }
    }
    log('Checkpoint passed.');
    await page.waitForTimeout(2000);

    // Load search
    log('Loading search results...');
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(8000);

    // Read page's claimed count (e.g., "113 jobs · 83 companies")
    const claimedText = await page.evaluate(() => {
      const allText = document.body.innerText;
      const match = allText.match(/(\d+)\s+jobs?\s*·\s*(\d+)\s+companies?/i);
      return match ? { jobs: parseInt(match[1]), companies: parseInt(match[2]), raw: match[0] } : null;
    });
    if (claimedText) {
      log(`Page claims: ${claimedText.raw}`);
    } else {
      log('Could not find page claimed count.');
    }

    // Scroll to load all cards
    log('Scrolling to load all cards...');
    for (let i = 0; i < 15; i++) {
      await page.evaluate(() => window.scrollBy(0, 3000));
      await page.waitForTimeout(1200);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    // Count cards
    const result = await page.evaluate(() => {
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
      if (!listContainer) return { cards: 0, companies: [], carouselCount: 0 };

      const cards = Array.from((listContainer as HTMLElement).children).filter((child) =>
        child.querySelector('a[href*="/viewjob/"]')
      );

      const companies: string[] = [];
      let carouselCount = 0;

      cards.forEach((card) => {
        const el = card as HTMLElement;
        const companySection = el.querySelector('.line-clamp-3.font-light');
        const companyBold = companySection?.querySelector('span.font-bold');
        const company = companyBold?.textContent?.trim() || '(unknown)';
        companies.push(company);

        const buttons = el.querySelectorAll('button');
        if (buttons.length > 2) carouselCount++;
      });

      return { cards: cards.length, companies, carouselCount };
    });

    log('');
    log('=== RESULTS ===');
    log(`Main page cards: ${result.cards}`);
    log(`Companies with carousel: ${result.carouselCount}`);
    if (claimedText) {
      log(`Page claimed: ${claimedText.jobs} jobs / ${claimedText.companies} companies`);
    }
    log(`Unique companies: ${new Set(result.companies).size}`);

    // Output JSON to stdout
    console.log(JSON.stringify({
      claimedJobs: claimedText?.jobs ?? null,
      claimedCompanies: claimedText?.companies ?? null,
      mainPageCards: result.cards,
      carouselCompanies: result.carouselCount,
      uniqueCompanies: new Set(result.companies).size,
      companies: result.companies,
    }, null, 2));

    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  console.log(JSON.stringify({ error: err.message }));
  process.exit(1);
});
