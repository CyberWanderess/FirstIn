import type Database from 'better-sqlite3';

export function migration010(db: Database.Database): void {
  db.exec(`ALTER TABLE jobs ADD COLUMN score_success INTEGER`);
}
