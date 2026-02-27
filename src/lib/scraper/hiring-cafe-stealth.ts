import type { Browser, BrowserContext, Page } from 'playwright';

/**
 * Create a stealth browser context with anti-detection measures.
 * Based on proven M00 probe results against Vercel Security Checkpoint.
 */
export async function createStealthContext(browser: Browser): Promise<BrowserContext> {
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
    (window as unknown as Record<string, unknown>).chrome = {
      runtime: { onMessage: { addListener: () => {} }, sendMessage: () => {} },
      loadTimes: () => ({}),
      csi: () => ({}),
    };
  });

  return context;
}

/**
 * Bypass Vercel Security Checkpoint by visiting the homepage first.
 * Must be called before navigating to the search URL.
 * Returns true if challenge passed, false if still blocked after max retries.
 */
export async function bypassVercelChallenge(page: Page): Promise<boolean> {
  await page.goto('https://hiring.cafe', { waitUntil: 'load', timeout: 30000 });

  // Wait and check repeatedly — the checkpoint may take varying amounts of time
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.waitForTimeout(5000);
    const title = await page.title();
    const url = page.url();
    // Check if we've moved past the challenge
    if (!title.toLowerCase().includes('vercel') && !url.includes('/_vercel/')) {
      await page.waitForTimeout(2000);
      return true;
    }
  }

  // One last check after 20+ seconds total
  const finalTitle = await page.title();
  return !finalTitle.toLowerCase().includes('vercel');
}
