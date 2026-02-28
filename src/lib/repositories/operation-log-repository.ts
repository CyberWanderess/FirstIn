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

export function getRecentOperations(operation?: string, limit = 20): OperationLog[] {
  const db = getDb();
  let sql = 'SELECT * FROM operation_log';
  const params: unknown[] = [];

  if (operation) {
    sql += ' WHERE operation = ?';
    params.push(operation);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(deserializeLog);
}
