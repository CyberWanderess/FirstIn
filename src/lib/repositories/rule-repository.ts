import { getDb } from '@/lib/db';
import type { FilterRule, FilterRuleInsert, FilterRuleUpdate } from '@/types';

export function listRules(onlyEnabled = false): FilterRule[] {
  const db = getDb();
  const where = onlyEnabled ? 'WHERE enabled = 1' : '';
  return db.prepare(`SELECT * FROM filter_rules ${where} ORDER BY priority DESC, id`).all() as FilterRule[];
}

export function findRuleById(id: number): FilterRule | null {
  const db = getDb();
  return db.prepare('SELECT * FROM filter_rules WHERE id = ?').get(id) as FilterRule | undefined ?? null;
}

export function insertRule(data: FilterRuleInsert): FilterRule {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO filter_rules (name, field, operator, value, action, priority, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.name,
    data.field,
    data.operator,
    data.value,
    data.action,
    data.priority ?? 0,
    data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
  );
  return findRuleById(Number(result.lastInsertRowid))!;
}

export function updateRule(id: number, data: FilterRuleUpdate): FilterRule | null {
  const db = getDb();
  const existing = findRuleById(id);
  if (!existing) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.field !== undefined) { fields.push('field = ?'); values.push(data.field); }
  if (data.operator !== undefined) { fields.push('operator = ?'); values.push(data.operator); }
  if (data.value !== undefined) { fields.push('value = ?'); values.push(data.value); }
  if (data.action !== undefined) { fields.push('action = ?'); values.push(data.action); }
  if (data.priority !== undefined) { fields.push('priority = ?'); values.push(data.priority); }
  if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled ? 1 : 0); }

  if (fields.length === 0) return existing;

  values.push(id);
  db.prepare(`UPDATE filter_rules SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return findRuleById(id)!;
}

export function deleteRule(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM filter_rules WHERE id = ?').run(id);
  return result.changes > 0;
}
