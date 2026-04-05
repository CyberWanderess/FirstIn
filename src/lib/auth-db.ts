import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto';

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
      role TEXT NOT NULL DEFAULT 'user',
      disabled INTEGER NOT NULL DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id),
      used_by INTEGER REFERENCES users(id),
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Safe migration: add columns if they don't exist (for existing databases)
  const columns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  const columnNames = new Set(columns.map(c => c.name));
  if (!columnNames.has('role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  }
  if (!columnNames.has('disabled')) {
    db.exec("ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0");
  }

  // Ensure first user is admin
  db.exec("UPDATE users SET role = 'admin' WHERE id = (SELECT MIN(id) FROM users) AND role = 'user'");
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

// --- Helper to coerce SQLite row to AuthUser ---

interface RawAuthUser {
  id: number;
  email: string;
  display_name: string | null;
  role: string;
  disabled: number;
  created_at: string;
  password_hash?: string;
}

function toAuthUser(row: RawAuthUser): AuthUser {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    role: row.role as 'admin' | 'user',
    disabled: !!row.disabled,
    created_at: row.created_at,
  };
}

// --- User operations ---

export interface AuthUser {
  id: number;
  email: string;
  display_name: string | null;
  role: 'admin' | 'user';
  disabled: boolean;
  created_at: string;
}

const AUTH_USER_COLS = 'id, email, display_name, role, disabled, created_at';

export function createUser(email: string, password: string, displayName?: string): AuthUser {
  const db = getAuthDb();
  const passwordHash = hashPassword(password);
  const count = getUserCount();
  const role = count === 0 ? 'admin' : 'user';
  const result = db.prepare(
    'INSERT INTO users (email, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
  ).run(email.toLowerCase().trim(), passwordHash, displayName?.trim() || null, role);
  const row = db.prepare(`SELECT ${AUTH_USER_COLS} FROM users WHERE id = ?`)
    .get(result.lastInsertRowid) as RawAuthUser;
  return toAuthUser(row);
}

export function findUserByEmail(email: string): (AuthUser & { password_hash: string }) | null {
  const db = getAuthDb();
  const row = db.prepare('SELECT * FROM users WHERE email = ?')
    .get(email.toLowerCase().trim()) as RawAuthUser | null;
  if (!row) return null;
  return { ...toAuthUser(row), password_hash: row.password_hash! };
}

export function findUserById(id: number): AuthUser | null {
  const db = getAuthDb();
  const row = db.prepare(`SELECT ${AUTH_USER_COLS} FROM users WHERE id = ?`)
    .get(id) as RawAuthUser | null;
  return row ? toAuthUser(row) : null;
}

export function getUserCount(): number {
  const db = getAuthDb();
  return (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
}

export function listAllUsers(): AuthUser[] {
  const db = getAuthDb();
  const rows = db.prepare(`SELECT ${AUTH_USER_COLS} FROM users ORDER BY created_at`).all() as RawAuthUser[];
  return rows.map(toAuthUser);
}

export function setUserDisabled(userId: number, disabled: boolean): void {
  const db = getAuthDb();
  db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, userId);
  if (disabled) {
    deleteUserSessions(userId);
  }
}

export function deleteUser(userId: number): void {
  const db = getAuthDb();
  db.transaction(() => {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM extension_tokens WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM invites WHERE created_by = ? AND used_by IS NULL').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  })();
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
    SELECT u.id, u.email, u.display_name, u.role, u.disabled, u.created_at
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now') AND u.disabled = 0
  `).get(token) as RawAuthUser | null;
  return row ? toAuthUser(row) : null;
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

/** Hash a token with SHA-256 for storage (fast, one-way) */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function registerExtensionToken(token: string, userId: number): void {
  const db = getAuthDb();
  const hashed = hashToken(token);
  db.prepare('DELETE FROM extension_tokens WHERE user_id = ?').run(userId);
  db.prepare('INSERT INTO extension_tokens (token, user_id) VALUES (?, ?)')
    .run(hashed, userId);
}

export function findUserByExtensionToken(token: string): AuthUser | null {
  const db = getAuthDb();
  const hashed = hashToken(token);
  const row = db.prepare(`
    SELECT u.id, u.email, u.display_name, u.role, u.disabled, u.created_at
    FROM extension_tokens et JOIN users u ON et.user_id = u.id
    WHERE et.token = ? AND u.disabled = 0
  `).get(hashed) as RawAuthUser | null;
  return row ? toAuthUser(row) : null;
}

export function deleteExtensionToken(userId: number): void {
  const db = getAuthDb();
  db.prepare('DELETE FROM extension_tokens WHERE user_id = ?').run(userId);
}

// --- Invite operations ---

export interface Invite {
  id: number;
  code: string;
  created_by: number;
  creator_email: string;
  used_by: number | null;
  expires_at: string | null;
  created_at: string;
}

export function createInvite(createdBy: number, expiresInHours?: number): { code: string } {
  const db = getAuthDb();
  const code = randomBytes(16).toString('hex');
  const expiresAt = expiresInHours
    ? new Date(Date.now() + expiresInHours * 3600_000).toISOString()
    : null;
  db.prepare('INSERT INTO invites (code, created_by, expires_at) VALUES (?, ?, ?)')
    .run(code, createdBy, expiresAt);
  return { code };
}

export function validateInviteCode(code: string): { id: number; code: string } | null {
  const db = getAuthDb();
  return db.prepare(`
    SELECT id, code FROM invites
    WHERE code = ? AND used_by IS NULL
    AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).get(code) as { id: number; code: string } | null;
}

export function markInviteUsed(code: string, userId: number): void {
  const db = getAuthDb();
  db.prepare('UPDATE invites SET used_by = ? WHERE code = ?').run(userId, code);
}

export function listInvites(): Invite[] {
  const db = getAuthDb();
  return db.prepare(`
    SELECT i.id, i.code, i.created_by, u.email as creator_email,
           i.used_by, i.expires_at, i.created_at
    FROM invites i JOIN users u ON i.created_by = u.id
    ORDER BY i.created_at DESC
  `).all() as Invite[];
}

export function deleteInvite(id: number): void {
  const db = getAuthDb();
  db.prepare('DELETE FROM invites WHERE id = ? AND used_by IS NULL').run(id);
}
