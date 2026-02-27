import { getDb } from '@/lib/db';
import type { Setting } from '@/types';

export function getSetting(key: string, defaultValue: string): string {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? defaultValue;
}

export function getSettingNumber(key: string, defaultValue: number): number {
  const value = getSetting(key, String(defaultValue));
  const num = parseFloat(value);
  return isNaN(num) ? defaultValue : num;
}

export function listSettings(): Setting[] {
  const db = getDb();
  return db.prepare('SELECT * FROM settings ORDER BY key').all() as Setting[];
}

export function getSettingByKey(key: string): Setting | null {
  const db = getDb();
  return db.prepare('SELECT * FROM settings WHERE key = ?').get(key) as Setting | undefined ?? null;
}

export function upsertSetting(key: string, value: string, description?: string | null): Setting {
  const db = getDb();
  const existing = getSettingByKey(key);

  if (existing) {
    db.prepare(`
      UPDATE settings SET value = ?, description = COALESCE(?, description), updated_at = datetime('now')
      WHERE key = ?
    `).run(value, description ?? null, key);
  } else {
    db.prepare(`
      INSERT INTO settings (key, value, description) VALUES (?, ?, ?)
    `).run(key, value, description ?? null);
  }

  return getSettingByKey(key)!;
}
