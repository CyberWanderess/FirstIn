import type Database from 'better-sqlite3';

export function migration003(db: Database.Database): void {
  db.exec(`ALTER TABLE jobs ADD COLUMN deep_analysis TEXT DEFAULT NULL`);
}
