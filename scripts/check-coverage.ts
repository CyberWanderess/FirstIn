#!/usr/bin/env npx tsx
/**
 * Coverage verification tool — checks which major H1B-sponsoring tech companies
 * have listings on hiring.cafe.
 *
 * Strategy: first check local DB (fast), then Playwright-check companies not found in DB.
 *
 * Usage:
 *   npx tsx scripts/check-coverage.ts
 *   npx tsx scripts/check-coverage.ts --db-only          # skip Playwright, DB check only
 *   npx tsx scripts/check-coverage.ts --start-from "Netflix"
 *   npx tsx scripts/check-coverage.ts --output json
 *
 * Output: coverage report (table to stderr, JSON to stdout)
 */

import { resolve } from 'path';
import { chromium, type Page, type Browser, type BrowserContext } from 'playwright';

// Must set DATABASE_PATH before config.ts is loaded (it reads env at module init)
if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = resolve(process.cwd(), 'data', 'jobhq.db');
}

// Lazy-load db module (dynamic import deferred to first use so env is set first)
let _db: typeof import('../src/lib/db') | null = null;
async function loadDb() {
  if (!_db) _db = await import('../src/lib/db');
  return _db;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface CompanyEntry {
  name: string;
  aliases?: string[];
  tier: string;
}

interface CheckResult {
  name: string;
  tier: string;
  found: boolean;
  source: 'db' | 'playwright' | 'not_found';
  jobCount: number;
  dbDisplayName?: string;
}

// ─── Company list (top H1B sponsors, organized by tier) ─────────────────────

const COMPANIES: CompanyEntry[] = [
  // Magnificent 7
  { name: 'Google', aliases: ['Alphabet'], tier: 'mag7' },
  { name: 'Apple', tier: 'mag7' },
  { name: 'Meta', aliases: ['Facebook'], tier: 'mag7' },
  { name: 'Amazon', aliases: ['AWS'], tier: 'mag7' },
  { name: 'Microsoft', tier: 'mag7' },
  { name: 'NVIDIA', tier: 'mag7' },
  { name: 'Tesla', tier: 'mag7' },

  // Big Tech / Enterprise
  { name: 'Netflix', tier: 'big_tech' },
  { name: 'Salesforce', tier: 'big_tech' },
  { name: 'Adobe', tier: 'big_tech' },
  { name: 'Oracle', tier: 'big_tech' },
  { name: 'IBM', tier: 'big_tech' },
  { name: 'Intel', tier: 'big_tech' },
  { name: 'Cisco', tier: 'big_tech' },
  { name: 'SAP', tier: 'big_tech' },
  { name: 'Qualcomm', tier: 'big_tech' },
  { name: 'AMD', tier: 'big_tech' },
  { name: 'ServiceNow', tier: 'big_tech' },
  { name: 'Workday', tier: 'big_tech' },
  { name: 'Intuit', tier: 'big_tech' },
  { name: 'VMware', tier: 'big_tech' },

  // Cloud / SaaS
  { name: 'Snowflake', tier: 'cloud' },
  { name: 'Databricks', tier: 'cloud' },
  { name: 'Datadog', tier: 'cloud' },
  { name: 'MongoDB', tier: 'cloud' },
  { name: 'Cloudflare', tier: 'cloud' },
  { name: 'Elastic', tier: 'cloud' },
  { name: 'HashiCorp', tier: 'cloud' },
  { name: 'Confluent', tier: 'cloud' },
  { name: 'Twilio', tier: 'cloud' },

  // AI / ML
  { name: 'OpenAI', tier: 'ai' },
  { name: 'Anthropic', tier: 'ai' },
  { name: 'Palantir', tier: 'ai' },
  { name: 'Scale AI', tier: 'ai' },
  { name: 'Cohere', tier: 'ai' },
  { name: 'Hugging Face', tier: 'ai' },

  // Unicorn / Growth
  { name: 'Stripe', tier: 'unicorn' },
  { name: 'Figma', tier: 'unicorn' },
  { name: 'Notion', tier: 'unicorn' },
  { name: 'Discord', tier: 'unicorn' },
  { name: 'Canva', tier: 'unicorn' },
  { name: 'Plaid', tier: 'unicorn' },
  { name: 'Ramp', tier: 'unicorn' },
  { name: 'Rippling', tier: 'unicorn' },
  { name: 'Brex', tier: 'unicorn' },

  // Social / Media / Gaming
  { name: 'Spotify', tier: 'media' },
  { name: 'Pinterest', tier: 'media' },
  { name: 'Snap', aliases: ['Snapchat'], tier: 'media' },
  { name: 'Reddit', tier: 'media' },
  { name: 'LinkedIn', tier: 'media' },
  { name: 'TikTok', aliases: ['ByteDance'], tier: 'media' },
  { name: 'Roblox', tier: 'media' },
  { name: 'Epic Games', tier: 'media' },

  // E-commerce / Marketplace
  { name: 'Shopify', tier: 'ecommerce' },
  { name: 'eBay', tier: 'ecommerce' },
  { name: 'Etsy', tier: 'ecommerce' },
  { name: 'Instacart', tier: 'ecommerce' },
  { name: 'DoorDash', tier: 'ecommerce' },
  { name: 'Airbnb', tier: 'ecommerce' },

  // Mobility
  { name: 'Uber', tier: 'mobility' },
  { name: 'Lyft', tier: 'mobility' },
  { name: 'Waymo', tier: 'mobility' },
  { name: 'Cruise', tier: 'mobility' },

  // Finance / Fintech
  { name: 'Goldman Sachs', tier: 'finance' },
  { name: 'JPMorgan', aliases: ['JP Morgan', 'JPMorgan Chase'], tier: 'finance' },
  { name: 'Capital One', tier: 'finance' },
  { name: 'Robinhood', tier: 'finance' },
  { name: 'Square', tier: 'finance' },
  { name: 'Coinbase', tier: 'finance' },
  { name: 'Visa', tier: 'finance' },
  { name: 'Mastercard', tier: 'finance' },
  { name: 'PayPal', tier: 'finance' },

  // Cybersecurity
  { name: 'CrowdStrike', tier: 'security' },
  { name: 'Palo Alto Networks', tier: 'security' },
  { name: 'Zscaler', tier: 'security' },
  { name: 'Fortinet', tier: 'security' },

  // Defense / Aerospace
  { name: 'SpaceX', tier: 'defense' },
  { name: 'Anduril', tier: 'defense' },
  { name: 'Lockheed Martin', tier: 'defense' },
  { name: 'Northrop Grumman', tier: 'defense' },
  { name: 'Boeing', tier: 'defense' },
  { name: 'Raytheon', tier: 'defense' },

  // Consulting / IT Services (top H1B sponsors)
  { name: 'Deloitte', tier: 'consulting' },
  { name: 'Accenture', tier: 'consulting' },
  { name: 'Infosys', tier: 'consulting' },
  { name: 'Tata Consultancy', aliases: ['TCS'], tier: 'consulting' },
  { name: 'Wipro', tier: 'consulting' },
  { name: 'Cognizant', tier: 'consulting' },

  // Other notable
  { name: 'Dropbox', tier: 'other' },
  { name: 'Zillow', tier: 'other' },
  { name: 'Splunk', tier: 'other' },
  { name: 'Twitter', aliases: ['X Corp'], tier: 'other' },
  { name: 'Roku', tier: 'other' },
  { name: 'Atlassian', tier: 'other' },
  { name: 'Zoom', tier: 'other' },
  { name: 'DocuSign', tier: 'other' },
];

// ─── Tier display names ─────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
  mag7: 'Magnificent 7',
  big_tech: 'Big Tech / Enterprise',
  cloud: 'Cloud / SaaS',
  ai: 'AI / ML',
  unicorn: 'Unicorn / Growth',
  media: 'Social / Media / Gaming',
  ecommerce: 'E-commerce / Marketplace',
  mobility: 'Mobility',
  finance: 'Finance / Fintech',
  security: 'Cybersecurity',
  defense: 'Defense / Aerospace',
  consulting: 'Consulting / IT Services',
  other: 'Other Notable',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stderr.write(`[${new Date().toISOString()}] ${msg}\n`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let startFrom: string | null = null;
  let outputJson = false;
  let dbOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start-from' && args[i + 1]) {
      startFrom = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1] === 'json') {
      outputJson = true;
      i++;
    } else if (args[i] === '--db-only') {
      dbOnly = true;
    }
  }

  return { startFrom, outputJson, dbOnly };
}

// ─── DB check ────────────────────────────────────────────────────────────────

interface DbMatch {
  displayName: string;
  jobCount: number;
}

function isWordBoundaryMatch(displayName: string, target: string): boolean {
  // Require target to appear as a whole word (word boundary on both sides)
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(displayName);
}

async function checkCompanyInDb(company: CompanyEntry): Promise<DbMatch | null> {
  const { getDb } = await loadDb();
  const db = getDb();
  const names = [company.name, ...(company.aliases || [])];

  for (const name of names) {
    // Fuzzy match on display_name, then validate with word boundary
    const rows = db.prepare(`
      SELECT c.id, c.display_name, COUNT(j.id) as job_count
      FROM companies c
      LEFT JOIN jobs j ON j.company_id = c.id
      WHERE c.display_name LIKE ?
      GROUP BY c.id
      ORDER BY job_count DESC
    `).all(`%${name}%`) as { id: number; display_name: string; job_count: number }[];

    for (const row of rows) {
      if (isWordBoundaryMatch(row.display_name, name)) {
        return { displayName: row.display_name, jobCount: row.job_count };
      }
    }
  }

  return null;
}

// ─── Playwright check ────────────────────────────────────────────────────────

async function createStealthContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
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

async function bypassVercelCheckpoint(page: Page): Promise<boolean> {
  log('Bypassing Vercel checkpoint...');
  await page.goto('https://hiring.cafe', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(12000);

  const title = await page.title();
  if (title.toLowerCase().includes('vercel')) {
    log('Still on checkpoint, waiting 10 more seconds...');
    await page.waitForTimeout(10000);
    const title2 = await page.title();
    if (title2.toLowerCase().includes('vercel')) {
      log('BLOCKED by Vercel Security Checkpoint');
      return false;
    }
  }

  log('Checkpoint passed.');
  await page.waitForTimeout(2000);
  return true;
}

async function checkCompanyOnHiringCafe(
  page: Page,
  company: CompanyEntry
): Promise<{ found: boolean; jobCount: number }> {
  const searchState = {
    jobTitleQuery: company.name,
    dateFetchedPastNDays: -1,
  };
  const url = `https://hiring.cafe/?searchState=${encodeURIComponent(JSON.stringify(searchState))}`;

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  // Scroll a few times to load more cards
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 3000));
    await page.waitForTimeout(800);
  }

  const aliases = company.aliases || [];
  const result = await page.evaluate(
    ({ targetName, aliasList }: { targetName: string; aliasList: string[] }) => {
      const cardCompanies: string[] = [];
      document.querySelectorAll('.line-clamp-3.font-light').forEach((section) => {
        const bold = section.querySelector('span.font-bold');
        if (bold?.textContent) cardCompanies.push(bold.textContent.trim());
      });

      const allTargets = [targetName, ...aliasList].map((n) => n.toLowerCase());
      const matching = cardCompanies.filter((cn) => {
        const lower = cn.toLowerCase();
        return allTargets.some((t) => lower.includes(t) || t.includes(lower));
      });

      return { matchingCards: matching.length };
    },
    { targetName: company.name, aliasList: aliases }
  );

  return { found: result.matchingCards > 0, jobCount: result.matchingCards };
}

// ─── Report ──────────────────────────────────────────────────────────────────

function printReport(results: CheckResult[]) {
  const tiers = [...new Set(COMPANIES.map((c) => c.tier))];

  log('');
  log('═══════════════════════════════════════════════════');
  log('       Hiring.cafe Coverage Report');
  log('═══════════════════════════════════════════════════');
  log('');

  let totalFound = 0;
  let totalChecked = 0;

  for (const tier of tiers) {
    const tierResults = results.filter((r) => r.tier === tier);
    if (tierResults.length === 0) continue;

    const tierLabel = TIER_LABELS[tier] || tier;
    const tierFound = tierResults.filter((r) => r.found).length;
    log(`--- ${tierLabel} (${tierFound}/${tierResults.length}) ---`);

    for (const r of tierResults) {
      const status = r.found ? '  [FOUND]  ' : '  [MISSING]';
      const src = r.source === 'db' ? '(DB)' : r.source === 'playwright' ? '(web)' : '';
      const detail = r.found
        ? `— ${r.jobCount} jobs ${src}${r.dbDisplayName ? ` as "${r.dbDisplayName}"` : ''}`
        : '';
      log(`${status} ${r.name.padEnd(22)} ${detail}`);
    }
    log('');

    totalFound += tierFound;
    totalChecked += tierResults.length;
  }

  log('═══════════════════════════════════════════════════');
  const pct = totalChecked > 0 ? ((totalFound / totalChecked) * 100).toFixed(1) : '0';
  log(`  Coverage: ${totalFound} / ${totalChecked} (${pct}%)`);
  log(`  Missing:  ${totalChecked - totalFound} companies`);
  log('═══════════════════════════════════════════════════');

  const missing = results.filter((r) => !r.found).map((r) => r.name);
  if (missing.length > 0) {
    log('');
    log('Missing companies:');
    log(`  ${missing.join(', ')}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { startFrom, outputJson, dbOnly } = parseArgs();

  let companies = [...COMPANIES];
  if (startFrom) {
    const idx = companies.findIndex(
      (c) => c.name.toLowerCase() === startFrom.toLowerCase()
    );
    if (idx === -1) {
      log(`Company "${startFrom}" not found in list.`);
      process.exit(1);
    }
    companies = companies.slice(idx);
    log(`Resuming from "${startFrom}" (${companies.length} remaining)`);
  }

  // Phase 1: Check local DB
  log(`Phase 1: Checking ${companies.length} companies in local DB...`);
  const results: CheckResult[] = [];
  const needPlaywright: CompanyEntry[] = [];

  for (const company of companies) {
    const dbMatch = await checkCompanyInDb(company);
    if (dbMatch) {
      results.push({
        name: company.name,
        tier: company.tier,
        found: true,
        source: 'db',
        jobCount: dbMatch.jobCount,
        dbDisplayName: dbMatch.displayName,
      });
      log(`  [DB] ${company.name} — found as "${dbMatch.displayName}" (${dbMatch.jobCount} jobs)`);
    } else {
      needPlaywright.push(company);
    }
  }

  (await loadDb()).closeDb();
  log(`Phase 1 done: ${results.length} found in DB, ${needPlaywright.length} need web check.`);

  // Phase 2: Playwright check for companies not in DB
  if (needPlaywright.length > 0 && !dbOnly) {
    log('');
    log(`Phase 2: Checking ${needPlaywright.length} companies on hiring.cafe...`);

    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
      ],
    });

    try {
      const context = await createStealthContext(browser);
      const page = await context.newPage();

      const passed = await bypassVercelCheckpoint(page);
      if (!passed) {
        log('Blocked by Vercel. Marking remaining companies as not checked.');
        for (const company of needPlaywright) {
          results.push({
            name: company.name,
            tier: company.tier,
            found: false,
            source: 'not_found',
            jobCount: 0,
          });
        }
      } else {
        let pwFound = 0;
        for (let i = 0; i < needPlaywright.length; i++) {
          const company = needPlaywright[i];
          const progress = `[${i + 1}/${needPlaywright.length}]`;

          try {
            const check = await checkCompanyOnHiringCafe(page, company);
            results.push({
              name: company.name,
              tier: company.tier,
              found: check.found,
              source: check.found ? 'playwright' : 'not_found',
              jobCount: check.jobCount,
            });

            const status = check.found ? 'FOUND' : 'MISSING';
            log(`  ${progress} ${company.name}: ${status} — ${check.jobCount} jobs`);
            if (check.found) pwFound++;

            // Early warning after 3 checks
            if (i === 2 && pwFound === 0) {
              const allHadResults = true; // simplified check
              log('');
              log('WARNING: First 3 companies not found. jobTitleQuery may not search company names.');
              log('Results may be unreliable — consider verifying manually.');
              log('');
            }
          } catch (err: any) {
            log(`  ${progress} ${company.name}: ERROR — ${err.message}`);
            results.push({
              name: company.name,
              tier: company.tier,
              found: false,
              source: 'not_found',
              jobCount: 0,
            });
          }

          if (i < needPlaywright.length - 1) {
            await page.waitForTimeout(3000);
          }
        }
      }

      await context.close();
    } finally {
      await browser.close();
    }
  } else if (needPlaywright.length > 0 && dbOnly) {
    log(`Skipping ${needPlaywright.length} companies (--db-only mode)`);
    for (const company of needPlaywright) {
      results.push({
        name: company.name,
        tier: company.tier,
        found: false,
        source: 'not_found',
        jobCount: 0,
      });
    }
  }

  // Output
  printReport(results);

  const found = results.filter((r) => r.found).length;
  console.log(
    JSON.stringify(
      {
        date: new Date().toISOString(),
        totalChecked: results.length,
        foundInDb: results.filter((r) => r.source === 'db').length,
        foundOnWeb: results.filter((r) => r.source === 'playwright').length,
        missing: results.filter((r) => !r.found).length,
        coverage: `${((found / results.length) * 100).toFixed(1)}%`,
        results,
      },
      null,
      2
    )
  );
}

main().catch(async (err) => {
  log(`FATAL: ${err.message}`);
  if (_db) _db.closeDb();
  console.log(JSON.stringify({ error: err.message, results: [] }));
  process.exit(1);
});
