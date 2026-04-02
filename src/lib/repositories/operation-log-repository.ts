import { getDb } from '@/lib/db';
import type { OperationLog, OperationLogInsert } from '@/types';

export function logOperation(data: OperationLogInsert): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO operation_log (operation, entity_type, entity_id, trigger, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    data.operation,
    data.entity_type,
    data.entity_id ?? null,
    data.trigger,
    JSON.stringify(data.details ?? {}),
  );
}

function deserializeLog(row: Record<string, unknown>): OperationLog {
  let details: Record<string, unknown>;
  try { details = JSON.parse(row.details as string || '{}'); } catch { details = {}; }
  return { ...row, details } as OperationLog;
}

export function getEntityHistory(entityType: string, entityId: number, limit = 50): OperationLog[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM operation_log
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(entityType, entityId, limit) as Record<string, unknown>[];

  return rows.map(deserializeLog);
}

export function getRecentOperations(operation?: string, limit = 20, entityType?: string): OperationLog[] {
  const db = getDb();
  let sql = `
    SELECT ol.*, j.title AS job_title, c.display_name AS company_name
    FROM operation_log ol
    LEFT JOIN jobs j ON ol.entity_type = 'job' AND ol.entity_id = j.id
    LEFT JOIN companies c ON j.company_id = c.id
  `;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (operation) {
    conditions.push('ol.operation = ?');
    params.push(operation);
  }
  if (entityType) {
    conditions.push('ol.entity_type = ?');
    params.push(entityType);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += ' ORDER BY ol.created_at DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(deserializeLog);
}
