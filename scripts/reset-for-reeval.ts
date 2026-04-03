/**
 * Reset single-scored jobs (score only, no score_success) back to pending_eval
 * for re-evaluation with the dual scoring system.
 * Usage: npx tsx scripts/reset-for-reeval.ts [--dry-run]
 */
import Database from 'better-sqlite3';
import { join } from 'path';

const dbPath = join(process.cwd(), 'data', 'jobhq.db');
const dryRun = process.argv.includes('--dry-run');

const db = new Database(dbPath);

// Find all jobs that were scored with single system only (have score but no score_success)
const singleScored = db.prepare(
  `SELECT id, title, status, score, score_success FROM jobs WHERE score IS NOT NULL AND score_success IS NULL`
).all() as { id: number; title: string; status: string; score: number; score_success: number | null }[];

console.log(`Found ${singleScored.length} single-scored jobs (need dual scoring)`);
if (dryRun) console.log('(dry run — no changes will be made)\n');

// Group by status
const byStatus: Record<string, number> = {};
for (const job of singleScored) {
  byStatus[job.status] = (byStatus[job.status] || 0) + 1;
}
console.log('Current status distribution:', byStatus);

const pendingEval = db.prepare(
  `SELECT count(*) as cnt FROM jobs WHERE status = 'pending_eval'`
).get() as { cnt: number };
console.log(`Currently pending_eval: ${pendingEval.cnt}\n`);

const resetStmt = db.prepare(`
  UPDATE jobs
  SET status = 'pending_eval',
      score = NULL,
      score_success = NULL,
      score_reason = NULL,
      score_tags = NULL,
      status_changed_at = datetime('now')
  WHERE id = ?
`);

let resetCount = 0;
const run = db.transaction(() => {
  for (const job of singleScored) {
    console.log(`  #${job.id} ${job.title}: ${job.status} (${job.score}/${job.score_success}) → pending_eval`);
    if (!dryRun) {
      resetStmt.run(job.id);
    }
    resetCount++;
  }
});

run();

const newPendingEval = dryRun
  ? pendingEval.cnt + resetCount
  : (db.prepare(`SELECT count(*) as cnt FROM jobs WHERE status = 'pending_eval'`).get() as { cnt: number }).cnt;

console.log(`\n${dryRun ? 'Would reset' : 'Reset'}: ${resetCount} jobs`);
console.log(`Total pending_eval: ${newPendingEval}`);

db.close();
