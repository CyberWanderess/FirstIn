import type Database from 'better-sqlite3';

export function migration015(db: Database.Database): void {
  db.exec(`ALTER TABLE jobs ADD COLUMN posted_at TEXT`);
  db.prepare(
    `INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)`
  ).run('expiry_days', '30', 'Days before inactive jobs are considered expired');
}
