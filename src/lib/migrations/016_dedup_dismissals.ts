import type Database from 'better-sqlite3';

export function migration016(db: Database.Database): void {
  db.exec(`
    CREATE TABLE dedup_dismissals (
      job_id_lo INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      job_id_hi INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (job_id_lo, job_id_hi)
    )
  `);
}
