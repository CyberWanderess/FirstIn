import { getDb } from '@/lib/db';
import type { SearchConfig, SearchConfigInsert, SearchConfigUpdate } from '@/types';

function deserializeConfig(row: Record<string, unknown>): SearchConfig {
  return {
    ...row,
    query_params: JSON.parse(row.query_params as string || '{}'),
    last_run_result: row.last_run_result ? JSON.parse(row.last_run_result as string) : null,
  } as SearchConfig;
}

export function listSearchConfigs(onlyEnabled = false): SearchConfig[] {
  const db = getDb();
  const where = onlyEnabled ? 'WHERE enabled = 1' : '';
  const rows = db.prepare(`SELECT * FROM search_configs ${where} ORDER BY name`).all() as Record<string, unknown>[];
  return rows.map(deserializeConfig);
}

export function findSearchConfigById(id: number): SearchConfig | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM search_configs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? deserializeConfig(row) : null;
}

export function insertSearchConfig(data: SearchConfigInsert): SearchConfig {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO search_configs (name, platform, query_params, schedule, enabled)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    data.name,
    data.platform ?? 'hiring_cafe',
    JSON.stringify(data.query_params),
    data.schedule ?? null,
    data.enabled ?? 1,
  );
  return findSearchConfigById(result.lastInsertRowid as number)!;
}

export function updateSearchConfig(id: number, data: SearchConfigUpdate): SearchConfig | null {
  const db = getDb();
  const existing = findSearchConfigById(id);
  if (!existing) return null;

  const fields: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
  if (data.platform !== undefined) { fields.push('platform = ?'); params.push(data.platform); }
  if (data.query_params !== undefined) { fields.push('query_params = ?'); params.push(JSON.stringify(data.query_params)); }
  if (data.schedule !== undefined) { fields.push('schedule = ?'); params.push(data.schedule); }
  if (data.enabled !== undefined) { fields.push('enabled = ?'); params.push(data.enabled); }
  if (data.last_run_at !== undefined) { fields.push('last_run_at = ?'); params.push(data.last_run_at); }
  if (data.last_run_result !== undefined) {
    fields.push('last_run_result = ?');
    params.push(data.last_run_result ? JSON.stringify(data.last_run_result) : null);
  }

  if (fields.length === 0) return existing;

  fields.push(`updated_at = datetime('now')`);
  params.push(id);
  db.prepare(`UPDATE search_configs SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return findSearchConfigById(id);
}

export function deleteSearchConfig(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM search_configs WHERE id = ?').run(id);
  return result.changes > 0;
}
