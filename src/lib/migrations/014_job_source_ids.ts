import type Database from 'better-sqlite3';

export function migration014(db: Database.Database): void {
  // Create the job_source_ids association table
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_source_ids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      UNIQUE(source, source_id)
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_job_source_ids_lookup ON job_source_ids(source, source_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_job_source_ids_job ON job_source_ids(job_id)');

  // Migrate existing source_id data from jobs table
  db.exec(`
    INSERT OR IGNORE INTO job_source_ids (job_id, source, source_id)
    SELECT id, source, source_id FROM jobs
    WHERE source_id IS NOT NULL AND source_id != ''
  `);
}
