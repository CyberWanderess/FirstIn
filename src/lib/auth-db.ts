import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const AUTH_DB_PATH = resolve(process.env.AUTH_DB_PATH || './data/auth.db');

let authDb: Database.Database | null = null;

export function getAuthDb(): Database.Database {
  if (authDb) return authDb;

  mkdirSync(dirname(AUTH_DB_PATH), { recursive: true });
  authDb = new Database(AUTH_DB_PATH);
  authDb.pragma('journal_mode = WAL');
  authDb.pragma('foreign_keys = ON');
  authDb.pragma('busy_timeout = 5000');

  initAuthSchema(authDb);
  return authDb;
}

function initAuthSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS extension_tokens (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// --- Password hashing ---

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, 'hex');
  const derivedBuffer = scryptSync(password, salt, KEY_LENGTH);
  return timingSafeEqual(hashBuffer, derivedBuffer);
}

// --- User operations ---

export interface AuthUser {
  id: number;
  email: string;
  display_name: string | null;
  created_at: string;
}

export function createUser(email: string, password: string, displayName?: string): AuthUser {
  const db = getAuthDb();
  const passwordHash = hashPassword(password);
  const result = db.prepare(
    'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)'
  ).run(email.toLowerCase().trim(), passwordHash, displayName?.trim() || null);
  return db.prepare('SELECT id, email, display_name, created_at FROM users WHERE id = ?')
    .get(result.lastInsertRowid) as AuthUser;
}

export function findUserByEmail(email: string): (AuthUser & { password_hash: string }) | null {
  const db = getAuthDb();
  return db.prepare('SELECT * FROM users WHERE email = ?')
    .get(email.toLowerCase().trim()) as (AuthUser & { password_hash: string }) | null;
}

export function findUserById(id: number): AuthUser | null {
  const db = getAuthDb();
  return db.prepare('SELECT id, email, display_name, created_at FROM users WHERE id = ?')
    .get(id) as AuthUser | null;
}

export function getUserCount(): number {
  const db = getAuthDb();
  return (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
}

// --- Session operations ---

const SESSION_DURATION_DAYS = 30;

export function createSession(userId: number): string {
  const db = getAuthDb();
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)')
    .run(userId, token, expiresAt);
  return token;
}

export function validateSession(token: string): AuthUser | null {
  const db = getAuthDb();
  const row = db.prepare(`
    SELECT u.id, u.email, u.display_name, u.created_at
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as AuthUser | null;
  return row;
}

export function deleteSession(token: string): void {
  const db = getAuthDb();
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function deleteUserSessions(userId: number): void {
  const db = getAuthDb();
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// --- Extension token operations ---

export function registerExtensionToken(token: string, userId: number): void {
  const db = getAuthDb();
  db.prepare('INSERT OR REPLACE INTO extension_tokens (token, user_id) VALUES (?, ?)')
    .run(token, userId);
}

export function findUserByExtensionToken(token: string): AuthUser | null {
  const db = getAuthDb();
  return db.prepare(`
    SELECT u.id, u.email, u.display_name, u.created_at
    FROM extension_tokens et JOIN users u ON et.user_id = u.id
    WHERE et.token = ?
  `).get(token) as AuthUser | null;
}

export function deleteExtensionToken(userId: number): void {
  const db = getAuthDb();
  db.prepare('DELETE FROM extension_tokens WHERE user_id = ?').run(userId);
}
