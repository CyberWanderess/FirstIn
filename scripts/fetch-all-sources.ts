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

  if (source === 'jsearch' && !process.env.RAPIDAPI_KEY) {
    console.warn('[fetch-all] Skipping jsearch: RAPIDAPI_KEY not set');
    continue;
  }

  console.log(`\n[fetch-all] === ${source.toUpperCase()} ===`);
  runScript(script);
}

console.log('\n[fetch-all] Done.');
