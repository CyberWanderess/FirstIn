import type Database from 'better-sqlite3';

export function migration006(db: Database.Database): void {
  db.exec(`ALTER TABLE companies ADD COLUMN cooldown_months INTEGER DEFAULT NULL`);
}
