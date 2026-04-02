import type Database from 'better-sqlite3';

export function migration011(db: Database.Database): void {
  db.exec(`ALTER TABLE companies ADD COLUMN limit_period_months INTEGER DEFAULT 12`);
}
