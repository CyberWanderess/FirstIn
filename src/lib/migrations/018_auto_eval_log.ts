import type Database from 'better-sqlite3';

export function migration018(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auto_eval_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_type TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      entity_name TEXT,
      status TEXT NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cost_usd REAL,
      duration_ms INTEGER,
      result_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_auto_eval_log_created_at ON auto_eval_log(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_auto_eval_log_run_type ON auto_eval_log(run_type)`);
}
