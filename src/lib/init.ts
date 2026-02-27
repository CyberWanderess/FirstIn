import { getDb } from './db';
import { runMigrations } from './migrations/runner';

let initialized = false;

export function ensureInitialized(): void {
  if (initialized) return;
  const db = getDb();
  runMigrations(db);
  initialized = true;
}
