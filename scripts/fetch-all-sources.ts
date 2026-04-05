#!/usr/bin/env npx tsx
/**
 * Unified job fetcher — runs all configured ATS sources in sequence.
 *
 * Usage:
 *   npx tsx scripts/fetch-all-sources.ts                    # all sources
 *   npx tsx scripts/fetch-all-sources.ts --dry-run          # no DB writes
 *   npx tsx scripts/fetch-all-sources.ts --sources gh,ashby # subset only
 *   RAPIDAPI_KEY=xxx npx tsx scripts/fetch-all-sources.ts   # include jsearch
 *
 * Sources: gh (Greenhouse), lever, ashby, jsearch
 */

import './lib/load-env'; // must be first — sets RAPIDAPI_KEY etc. before env checks
import { execFileSync } from 'child_process';
import { join } from 'path';
import { getDb } from '../src/lib/db';
import { runMigrations } from '../src/lib/migrations/runner';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sourcesArg = args.includes('--sources') ? args[args.indexOf('--sources') + 1] : null;

const ALL_SOURCES = ['gh', 'lever', 'ashby', 'jsearch'];
const activeSources = sourcesArg ? sourcesArg.split(',').map((s) => s.trim()) : ALL_SOURCES;

const SCRIPT_MAP: Record<string, string> = {
  gh: 'fetch-greenhouse.ts',
  lever: 'fetch-lever.ts',
  ashby: 'fetch-ashby.ts',
  jsearch: 'fetch-jsearch.ts',
};

function runScript(scriptName: string): void {
  const scriptPath = join(process.cwd(), 'scripts', scriptName);
  const extraArgs = dryRun ? ['--dry-run'] : [];

  try {
    execFileSync('npx', ['tsx', scriptPath, ...extraArgs], {
      stdio: 'inherit',
      env: process.env,
      cwd: process.cwd(),
    });
  } catch (e) {
    console.error(`[fetch-all] Script ${scriptName} exited with error`);
  }
}

console.log(`[fetch-all] Running sources: ${activeSources.join(', ')}${dryRun ? ' (dry-run)' : ''}`);

for (const source of activeSources) {
  const script = SCRIPT_MAP[source];
  if (!script) {
    console.warn(`[fetch-all] Unknown source: "${source}" — skipping`);
    continue;
  }

  if (source === 'jsearch') {
    // Check DB setting for jsearch enabled
    try {
      const db = getDb();
      runMigrations(db);
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('jsearch_enabled') as { value: string } | undefined;
      if (row?.value !== 'true') {
        console.warn('[fetch-all] Skipping jsearch: disabled in settings');
        continue;
      }
    } catch {
      // DB not available — fall through to script which will handle it
    }
    const hasKey = process.env.RAPIDAPI_KEY || (() => {
      try {
        const db = getDb();
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('jsearch_api_key') as { value: string } | undefined;
        return row?.value || '';
      } catch { return ''; }
    })();
    if (!hasKey) {
      console.warn('[fetch-all] Skipping jsearch: no API key configured');
      continue;
    }
  }

  console.log(`\n[fetch-all] === ${source.toUpperCase()} ===`);
  runScript(script);
}

console.log('\n[fetch-all] Done.');
