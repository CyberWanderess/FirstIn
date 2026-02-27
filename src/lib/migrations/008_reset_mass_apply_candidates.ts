import type Database from 'better-sqlite3';

export function migration008(db: Database.Database): void {
  // Reset score 5-6 jobs back to pending_eval for re-evaluation with new prompt (mass_apply tier)
  const result = db.prepare(`
    UPDATE jobs
    SET status = 'pending_eval', score = NULL, score_reason = NULL,
        status_changed_at = datetime('now')
    WHERE status = 'archived_low_match' AND score BETWEEN 5 AND 6
  `).run();
  if (result.changes > 0) {
    console.log(`Reset ${result.changes} score 5-6 jobs to pending_eval`);
  }
}
