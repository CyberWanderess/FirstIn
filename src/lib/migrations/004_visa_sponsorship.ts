import type Database from 'better-sqlite3';

export function migration004(db: Database.Database): void {
  db.exec(`ALTER TABLE jobs ADD COLUMN visa_sponsorship TEXT DEFAULT NULL`);
}
