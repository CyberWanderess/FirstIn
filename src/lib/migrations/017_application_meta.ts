import type Database from 'better-sqlite3';

export function migration017(db: Database.Database): void {
  db.exec(`
    ALTER TABLE jobs ADD COLUMN resume_tailored INTEGER DEFAULT NULL;
    ALTER TABLE jobs ADD COLUMN has_referral    INTEGER DEFAULT NULL;
  `);
}
