import Database from 'better-sqlite3';
import { AsyncLocalStorage } from 'async_hooks';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

// --- User context via AsyncLocalStorage ---

interface UserContext {
  userId: number;
}

export const userContext = new AsyncLocalStorage<UserContext>();

/**
 * Run a callback with a user context set. All getDb() calls within will
 * return the user's database.
 */
export function runWithUser<T>(userId: number, fn: () => T): T {
  return userContext.run({ userId }, fn);
}

/**
 * Async version for API route handlers.
 */
export async function runWithUserAsync<T>(userId: number, fn: () => Promise<T>): Promise<T> {
  return userContext.run({ userId }, fn);
}

// --- Per-user DB connections ---

const dbCache = new Map<number, Database.Database>();

function getUserDbPath(userId: number): string {
  return resolve(`./data/user-${userId}.db`);
}

export function getDb(): Database.Database {
  const ctx = userContext.getStore();
  if (!ctx) {
    throw new Error('getDb() called without user context. Wrap in runWithUser().');
  }

  const { userId } = ctx;
  const cached = dbCache.get(userId);
  if (cached) return cached;

  const dbPath = getUserDbPath(userId);
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  dbCache.set(userId, db);
  return db;
}

export function closeDb(userId?: number): void {
  if (userId !== undefined) {
    const db = dbCache.get(userId);
    if (db) {
      db.close();
      dbCache.delete(userId);
    }
    return;
  }
  // Close all
  for (const [id, db] of dbCache) {
    db.close();
    dbCache.delete(id);
  }
}
