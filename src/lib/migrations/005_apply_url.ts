import type Database from 'better-sqlite3';

export function migration005(db: Database.Database): void {
  db.exec(`ALTER TABLE jobs ADD COLUMN apply_url TEXT`);
}
