import type Database from 'better-sqlite3';

export function migration012(db: Database.Database): void {
  db.exec(`ALTER TABLE companies ADD COLUMN funding_round TEXT`);
}
