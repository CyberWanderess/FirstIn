import type Database from 'better-sqlite3';

export function migration013(db: Database.Database): void {
  db.exec(`ALTER TABLE jobs ADD COLUMN salary_currency TEXT NOT NULL DEFAULT 'USD'`);
}
