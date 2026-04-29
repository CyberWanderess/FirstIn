import type Database from 'better-sqlite3';

export function migration022(db: Database.Database): void {
  // Append-only prompt version history. Latest row per key is the live value;
  // empty table for a key means "fall back to the DEFAULT_* constant in code".
  db.exec(`
    CREATE TABLE prompt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      label TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(
    `CREATE INDEX idx_prompt_templates_key_created
     ON prompt_templates(key, created_at DESC)`
  );
}
