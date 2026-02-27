import { getDb } from '@/lib/db';
import type { Job, JobInsert, JobUpdate, JobWithCompany } from '@/types';

function serializeLocation(location: string[]): string {
  return JSON.stringify(location);
}

function deserializeJob(row: Record<string, unknown>): JobWithCompany {
  return {
    ...row,
    location: JSON.parse(row.location as string || '[]'),
  } as JobWithCompany;
}

export function findJobById(id: number): JobWithCompany | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT j.*, c.name as company_name, c.display_name as company_display_name,
           c.application_strategy, c.strategy_reason, c.application_limit, c.chinese_affinity
    FROM jobs j
    JOIN companies c ON j.company_id = c.id
    WHERE j.id = ?
  `).get(id) as Record<string, unknown> | undefined;

  return row ? deserializeJob(row) : null;
}

export function listJobs(options: {
  status?: string;
  companyId?: number;
  workMode?: string;
  commitment?: string;
  jdFetchStatus?: string;
  q?: string;
  sort?: string;
  order?: string;
  limit?: number;
  offset?: number;
}): { jobs: JobWithCompany[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.status) {
    conditions.push('j.status = ?');
    params.push(options.status);
  }
  if (options.companyId) {
    conditions.push('j.company_id = ?');
    params.push(options.companyId);
  }
  if (options.workMode) {
    conditions.push('j.work_mode = ?');
    params.push(options.workMode);
  }
  if (options.commitment) {
    conditions.push('j.commitment = ?');
    params.push(options.commitment);
  }
  if (options.jdFetchStatus) {
    conditions.push('j.jd_fetch_status = ?');
    params.push(options.jdFetchStatus);
  }
  if (options.q) {
    conditions.push('(j.title LIKE ? OR c.display_name LIKE ?)');
    const like = `%${options.q}%`;
    params.push(like, like);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (db.prepare(`
    SELECT COUNT(*) as count FROM jobs j JOIN companies c ON j.company_id = c.id ${where}
  `).get(...params) as { count: number }).count;

  const allowedSorts = ['created_at', 'updated_at', 'title', 'salary_max', 'score', 'status_changed_at'];
  const sort = allowedSorts.includes(options.sort || '') ? `j.${options.sort}` : 'j.created_at';
  const order = options.order === 'ASC' ? 'ASC' : 'DESC';
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const rows = db.prepare(`
    SELECT j.*, c.name as company_name, c.display_name as company_display_name,
           c.application_strategy, c.strategy_reason, c.application_limit, c.chinese_affinity
    FROM jobs j
    JOIN companies c ON j.company_id = c.id
    ${where}
    ORDER BY ${sort} ${order}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as Record<string, unknown>[];

  return { jobs: rows.map(deserializeJob), total };
}

export function insertJob(data: JobInsert & { company_id: number }): Job {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO jobs (company_id, title, location, salary_min, salary_max,
      work_mode, commitment, jd_url, jd_full_text, jd_fetch_status,
      jd_content_hash, source, source_id, status, score, score_reason, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.company_id,
    data.title,
    serializeLocation(data.location),
    data.salary_min ?? null,
    data.salary_max ?? null,
    data.work_mode ?? null,
    data.commitment ?? null,
    data.jd_url ?? null,
    data.jd_full_text ?? null,
    data.jd_fetch_status ?? 'pending',
    data.jd_content_hash ?? null,
    data.source,
    data.source_id ?? null,
    data.status ?? 'new',
    data.score ?? null,
    data.score_reason ?? null,
    data.notes ?? null,
  );

  return findJobById(result.lastInsertRowid as number)! as Job;
}

export function updateJob(id: number, data: JobUpdate): Job | null {
  const db = getDb();
  const fields: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      if (key === 'location') {
        fields.push('location = ?');
        params.push(serializeLocation(value as string[]));
      } else if (key === 'status') {
        fields.push('status = ?', `status_changed_at = datetime('now')`);
        params.push(value);
      } else {
        fields.push(`${key} = ?`);
        params.push(value);
      }
    }
  }

  if (fields.length === 0) return findJobById(id) as Job | null;

  fields.push(`updated_at = datetime('now')`);
  params.push(id);

  db.prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return findJobById(id) as Job | null;
}

export function deleteJob(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
  return result.changes > 0;
}

export function countJobsByStatus(): Record<string, number> {
  const db = getDb();
  const rows = db.prepare(
    `SELECT status, COUNT(*) as count FROM jobs GROUP BY status`
  ).all() as { status: string; count: number }[];

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.status] = row.count;
  }
  return counts;
}

export function getRecentJobs(limit = 10): JobWithCompany[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT j.*, c.name as company_name, c.display_name as company_display_name,
           c.application_strategy, c.strategy_reason, c.application_limit, c.chinese_affinity
    FROM jobs j
    JOIN companies c ON j.company_id = c.id
    ORDER BY j.created_at DESC
    LIMIT ?
  `).all(limit) as Record<string, unknown>[];

  return rows.map(deserializeJob);
}
