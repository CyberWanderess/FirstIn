#!/usr/bin/env npx tsx
/**
 * Refresh Cloudflare cookies for hiring.cafe API access.
 *
 * Launches Playwright browser (headed) to pass Cloudflare challenge,
 * extracts cf_clearance cookie, and writes to .cf-cookies file.
 *
 * Cloudflare detects headless browsers, so headed mode is required.
 * On headless servers, use: xvfb-run npx tsx scripts/refresh-cf-cookies.ts
 *
 * Usage:
 *   npx tsx scripts/refresh-cf-cookies.ts
 *
 * Output: JSON to stdout: {"success": true, "cookie": "..."} or {"success": false, "error": "..."}
 * Logs go to stderr.
 */

import { chromium, type Browser, type BrowserContext } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

function log(msg: string) {
  process.stderr.write(`[${new Date().toISOString()}] ${msg}\n`);
}

function hasDisplay(): boolean {
  return !!process.env.DISPLAY || !!process.env.WAYLAND_DISPLAY;
}

function hasXvfb(): boolean {
  try {
    execSync('which xvfb-run', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
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

async function refreshCookies(): Promise<void> {
  log('Starting Cloudflare cookie refresh...');

  // Cloudflare detects headless browsers — must use headed mode
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1920,1080'],
  });

  try {
    const context = await createStealthContext(browser);
    const page = await context.newPage();

    log('Navigating to hiring.cafe...');
    await page.goto('https://hiring.cafe', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for Cloudflare challenge to resolve
    let cfClearance = '';
    const maxWaitMs = 60000;
    const pollIntervalMs = 2000;
    let elapsed = 0;

    while (elapsed < maxWaitMs) {
      const cookies = await context.cookies('https://hiring.cafe');
      const cf = cookies.find(c => c.name === 'cf_clearance');
      if (cf) {
        cfClearance = cf.value;
        log(`cf_clearance obtained after ${elapsed}ms`);
        break;
      }

      const title = await page.title();
      if (!title.toLowerCase().includes('just a moment') && elapsed > 5000) {
        log(`Page loaded (title: "${title}"), no cf_clearance but challenge seems passed`);
        break;
      }

      if (elapsed % 10000 === 0) {
        log(`Waiting for Cloudflare challenge... (${elapsed / 1000}s, title: "${title}")`);
      }

      await page.waitForTimeout(pollIntervalMs);
      elapsed += pollIntervalMs;
    }

    const allCookies = await context.cookies('https://hiring.cafe');
    const cookieString = allCookies
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    await context.close();

    if (!cookieString) {
      log('ERROR: No cookies extracted from hiring.cafe');
      console.log(JSON.stringify({ success: false, error: 'No cookies extracted' }));
      process.exit(1);
    }

    const cookieFile = join(process.cwd(), '.cf-cookies');
    writeFileSync(cookieFile, cookieString, 'utf-8');
    log(`Cookies written to .cf-cookies (${allCookies.length} cookies, ${cfClearance ? 'includes cf_clearance' : 'no cf_clearance'})`);

    console.log(JSON.stringify({ success: true, cookie: cookieString }));
  } finally {
    await browser.close();
  }
}

async function main() {
  // If we're already running in a display environment, proceed directly
  if (hasDisplay()) {
    return refreshCookies();
  }

  // No display — try xvfb-run to create a virtual display
  if (hasXvfb()) {
    log('No display detected, using xvfb-run...');
    const scriptPath = join(process.cwd(), 'scripts', 'refresh-cf-cookies.ts');
    try {
      const output = execSync(
        `DISPLAY=:99 xvfb-run -a npx tsx "${scriptPath}"`,
        { timeout: 120000, maxBuffer: 1024 * 1024, cwd: process.cwd(), encoding: 'utf-8' },
      );
      // Forward the JSON output from the child process
      const lines = output.trim().split('\n');
      const jsonLine = lines[lines.length - 1];
      process.stdout.write(jsonLine + '\n');
    } catch (e: any) {
      log(`xvfb-run failed: ${e.message}`);
      console.log(JSON.stringify({ success: false, error: `xvfb-run failed: ${e.message}` }));
      process.exit(1);
    }
    return;
  }

  // No display and no xvfb — give clear instructions
  log('ERROR: Cannot refresh Cloudflare cookies automatically.');
  log('Cloudflare blocks headless browsers. Options:');
  log('  1. Install xvfb: sudo apt install xvfb');
  log('  2. Run on a machine with a display (desktop/GUI)');
  log('  3. Manually provide cookies:');
  log('     - Open hiring.cafe in your browser');
  log('     - DevTools > Application > Cookies > https://hiring.cafe');
  log('     - Copy all cookies and save to .cf-cookies file');
  console.log(JSON.stringify({
    success: false,
    error: 'No display available. Install xvfb (sudo apt install xvfb) or provide cookies manually in .cf-cookies',
  }));
  process.exit(1);
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  console.log(JSON.stringify({ success: false, error: err.message }));
  process.exit(1);
});
