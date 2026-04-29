import { getDb, userContext } from './db';
import { runMigrations } from './migrations/runner';

// Use globalThis so the Set survives HMR module re-evaluation in dev mode.
// A plain module-level Set gets cleared on every hot reload, causing runMigrations()
// to re-run (and query the DB) on the next request after each file save.
const g = globalThis as typeof globalThis & { __firstin_initialized?: Set<number> };
if (!g.__firstin_initialized) g.__firstin_initialized = new Set<number>();
const initializedUsers = g.__firstin_initialized;

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
