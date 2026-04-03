#!/usr/bin/env npx tsx
/**
 * Standalone JD fetch script — runs Playwright outside of Next.js runtime.
 *
 * Usage:
 *   npx tsx scripts/fetch-jd.ts '{"job_ids": ["abc123", ...], "delay_ms": 5000}'
 *
 * Input: JSON string with array of hiring.cafe viewJobIds
 * Output: JSON array of { viewJobId, jdText } to stdout
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

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
    log('Usage: npx tsx scripts/fetch-jd.ts \'{"job_ids": [...], "delay_ms": 5000}\'');
    process.exit(1);
  }

  let config: { job_ids: string[]; delay_ms?: number };
  try {
    config = JSON.parse(input);
  } catch {
    log('Invalid JSON input');
    process.exit(1);
  }

  const jobIds = config.job_ids;
  const delayMs = config.delay_ms ?? 5000;

  if (!jobIds || jobIds.length === 0) {
    console.log(JSON.stringify([]));
    process.exit(0);
  }

  log(`Fetching JD for ${jobIds.length} jobs (delay: ${delayMs}ms)...`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1920,1080'],
  });

  try {
    const context = await createStealthContext(browser);
    const page = await context.newPage();

    // Bypass Vercel checkpoint
    log('Bypassing Vercel checkpoint...');
    await page.goto('https://hiring.cafe', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(12000);
    const title = await page.title();
    if (title.toLowerCase().includes('vercel')) {
      log('Still on checkpoint, waiting 10 more seconds...');
      await page.waitForTimeout(10000);
    }
    log('Checkpoint phase done.');

    const results: Array<{ viewJobId: string; jdText: string | null }> = [];

    for (let i = 0; i < jobIds.length; i++) {
      const jobId = jobIds[i];
      const url = `https://hiring.cafe/viewjob/${jobId}`;
      try {
        const jdText = await extractJobDescription(page, url);
        results.push({ viewJobId: jobId, jdText });
        log(`  [${i + 1}/${jobIds.length}] ${jobId} — ${jdText ? jdText.length + ' chars' : 'no JD'}`);
      } catch {
        results.push({ viewJobId: jobId, jdText: null });
        log(`  [${i + 1}/${jobIds.length}] ${jobId} — FAILED`);
      }
      if (delayMs > 0 && i < jobIds.length - 1) {
        await page.waitForTimeout(delayMs);
      }
    }

    await context.close();
    console.log(JSON.stringify(results));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  console.log(JSON.stringify([]));
  process.exit(1);
});
