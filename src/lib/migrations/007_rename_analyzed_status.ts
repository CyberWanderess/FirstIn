import type Database from 'better-sqlite3';

export function migration007(db: Database.Database): void {
  // Rename analyzed → ready_to_apply_tailored
  db.exec(`UPDATE jobs SET status = 'ready_to_apply_tailored' WHERE status = 'analyzed'`);

  // Reset score 5-6 jobs back to pending_eval for re-evaluation with new prompt (mass_apply tier)
  db.exec(`
    UPDATE jobs
    SET status = 'pending_eval', score = NULL, score_reason = NULL,
        status_changed_at = datetime('now')
    WHERE status = 'archived_low_match' AND score BETWEEN 5 AND 6
  `);
}
