import type Database from 'better-sqlite3';

export function migration016(db: Database.Database): void {
  // Rename rejected → rejected_resume to clarify it means resume-screen rejection
  db.exec(`UPDATE jobs SET status = 'rejected_resume' WHERE status = 'rejected'`);
}
