/**
 * Live recheck smoke test — calls `claude -p` on 1-2 jobs to verify the
 * new SHARED_SCORING_RULES actually flip scores correctly. Read-only on the DB.
 *
 * Usage: tsx scripts/smoke-recheck.ts <jobId1> [jobId2]
 */
import Database from 'better-sqlite3';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildRecheckPrompt, parseRecheckResult } from '../src/lib/export/evaluation-recheck';

const execAsync = promisify(exec);
const dbPath = path.join(process.cwd(), 'data/user-1.db');
const db = new Database(dbPath, { readonly: true });

const ids = process.argv.slice(2).map(Number).filter(Boolean);
if (!ids.length) {
  console.error('Usage: tsx scripts/smoke-recheck.ts <jobId1> [jobId2]');
  process.exit(1);
}

const jobs = db
  .prepare(
    `SELECT j.*, c.name AS company_display_name,
            c.industry AS company_industry,
            c.size AS company_size,
            c.description AS company_description,
            c.ai_summary AS company_ai_summary,
            c.cooldown_months,
            c.funding_round AS company_funding_round
     FROM jobs j JOIN companies c ON c.id=j.company_id
     WHERE j.id IN (${ids.map(() => '?').join(',')})`
  )
  .all(...ids) as any[];

for (const j of jobs) {
  if (typeof j.location === 'string') {
    try { j.location = JSON.parse(j.location); } catch { j.location = []; }
  }
}

async function main() {
for (const job of jobs) {
  console.log(`\n━━━ Job #${job.id} ${job.company_display_name} | ${job.title} ━━━`);
  console.log(`Original score_success: ${job.score_success}, tags: ${job.score_tags}`);

  const prompt = buildRecheckPrompt(job as any);
  const tmpFile = join(tmpdir(), `recheck-${job.id}.txt`);
  writeFileSync(tmpFile, prompt);

  try {
    const start = Date.now();
    const { stdout } = await execAsync(
      `cat "${tmpFile}" | claude -p --no-session-persistence --output-format json --model opus`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const parsed = JSON.parse(stdout);
    const result = parseRecheckResult(parsed.result || '');

    if (!result) {
      console.log(`  FAILED to parse. Raw: ${(parsed.result || '').slice(0, 300)}`);
    } else {
      const delta = result.score_success - (job.score_success ?? 0);
      const arrow = delta > 0.5 ? '↑' : delta < -0.5 ? '↓' : '=';
      console.log(`  NEW score_success: ${result.score_success} ${arrow} (was ${job.score_success}, Δ ${delta > 0 ? '+' : ''}${delta.toFixed(1)}, ${elapsed}s)`);
      console.log(`  Daily work: ${result.daily_work_summary}`);
      console.log(`  Reason: ${result.reason}`);
    }
  } catch (e: any) {
    console.error(`  Error: ${e.message?.slice(0, 200)}`);
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}
}
main();
