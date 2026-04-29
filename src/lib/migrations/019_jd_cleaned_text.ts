import type Database from 'better-sqlite3';

export function migration019(db: Database.Database): void {
  // Add column for Haiku-cleaned JD text (boilerplate stripped)
  const cols = db.prepare(`PRAGMA table_info(jobs)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === 'jd_cleaned_text')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN jd_cleaned_text TEXT`);
  }
}
