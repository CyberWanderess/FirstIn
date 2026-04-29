import { getDb } from '@/lib/db';

export interface PromptVersion {
  id: number;
  key: string;
  value: string;
  label: string | null;
  created_at: string;
}

/** Latest row for a key, or null if the user has never customized it. */
export function getCurrentPromptValue(key: string): string | null {
  const db = getDb();
  const row = db
    .prepare('SELECT value FROM prompt_templates WHERE key = ? ORDER BY created_at DESC, id DESC LIMIT 1')
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

/** All versions for a key, newest first. */
export function listPromptVersions(key: string): PromptVersion[] {
  const db = getDb();
  return db
    .prepare('SELECT id, key, value, label, created_at FROM prompt_templates WHERE key = ? ORDER BY created_at DESC, id DESC')
    .all(key) as PromptVersion[];
}

export function getPromptVersion(id: number): PromptVersion | null {
  const db = getDb();
  const row = db
    .prepare('SELECT id, key, value, label, created_at FROM prompt_templates WHERE id = ?')
    .get(id) as PromptVersion | undefined;
  return row ?? null;
}

/** Append a new version. Always inserts, never updates. */
export function savePromptVersion(key: string, value: string, label?: string | null): PromptVersion {
  const db = getDb();
  const result = db
    .prepare('INSERT INTO prompt_templates (key, value, label) VALUES (?, ?, ?)')
    .run(key, value, label ?? null);
  return getPromptVersion(Number(result.lastInsertRowid))!;
}

/** Restore a historical version by appending it as a new row. */
export function restorePromptVersion(id: number, label?: string | null): PromptVersion | null {
  const source = getPromptVersion(id);
  if (!source) return null;
  const restoreLabel = label ?? `Restored from v${id}${source.label ? ` (${source.label})` : ''}`;
  return savePromptVersion(source.key, source.value, restoreLabel);
}

/** Delete a single version. */
export function deletePromptVersion(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM prompt_templates WHERE id = ?').run(id);
  return result.changes > 0;
}

/** Delete all versions for a key → falls back to code default on next read. */
export function resetPromptToDefault(key: string): number {
  const db = getDb();
  const result = db.prepare('DELETE FROM prompt_templates WHERE key = ?').run(key);
  return result.changes;
}

/** Map of all keys that have at least one stored version (for UI badges). */
export function getCustomizedKeys(): Set<string> {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT key FROM prompt_templates').all() as { key: string }[];
  return new Set(rows.map((r) => r.key));
}
