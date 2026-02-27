import type Database from 'better-sqlite3';

export function migration002(db: Database.Database): void {
  db.exec(`ALTER TABLE companies ADD COLUMN chinese_affinity INTEGER DEFAULT NULL`);
}
