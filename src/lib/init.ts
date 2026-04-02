import { getDb, userContext } from './db';
import { runMigrations } from './migrations/runner';

const initializedUsers = new Set<number>();

export function ensureInitialized(): void {
  const ctx = userContext.getStore();
  if (!ctx) {
    throw new Error('ensureInitialized() called without user context.');
  }

  const { userId } = ctx;
  if (initializedUsers.has(userId)) return;

  const db = getDb();
  runMigrations(db);
  initializedUsers.add(userId);
}
