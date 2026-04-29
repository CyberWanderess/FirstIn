import type Database from 'better-sqlite3';

export function migration020(db: Database.Database): void {
  // QA review columns: qa_flagged=1 when QA agent disagrees with original scoring,
  // qa_notes stores a short reason so the UI can surface it for human review.
  const cols = db.prepare(`PRAGMA table_info(jobs)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === 'qa_flagged')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN qa_flagged INTEGER DEFAULT 0`);
  }
  if (!cols.some((c) => c.name === 'qa_notes')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN qa_notes TEXT`);
  }

  // Same for companies — QA also spot-checks company research outputs.
  const companyCols = db.prepare(`PRAGMA table_info(companies)`).all() as { name: string }[];
  if (!companyCols.some((c) => c.name === 'qa_flagged')) {
    db.exec(`ALTER TABLE companies ADD COLUMN qa_flagged INTEGER DEFAULT 0`);
  }
  if (!companyCols.some((c) => c.name === 'qa_notes')) {
    db.exec(`ALTER TABLE companies ADD COLUMN qa_notes TEXT`);
  }
}
