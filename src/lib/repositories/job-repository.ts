import { getDb } from '@/lib/db';
import { getSettingNumber } from '@/lib/repositories/settings-repository';
import type { Job, JobInsert, JobUpdate, JobWithCompany } from '@/types';

/** Statuses that are eligible for expiration (user hasn't taken action) */
const EXPIRABLE_STATUSES = [
  'pending_eval', 'flagged', 'ready_to_apply', 'ready_to_apply_tailored', 'pending_deep_analysis',
];

function serializeLocation(location: string[]): string {
  return JSON.stringify(location);
}

function deserializeJob(row: Record<string, unknown>): JobWithCompany {
  let location: string[];
  try { location = JSON.parse(row.location as string || '[]'); } catch { location = []; }
  let score_tags: string[] | null = null;
  if (row.score_tags) {
    try { score_tags = JSON.parse(row.score_tags as string); } catch { score_tags = null; }
  }
  return { ...row, location, score_tags } as JobWithCompany;
}

export function findJobById(id: number): JobWithCompany | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT j.*, c.name as company_name, c.display_name as company_display_name,
           c.industry as company_industry, c.size as company_size, c.description as company_description, c.ai_summary as company_ai_summary,
           c.application_strategy, c.strategy_reason, c.application_limit, c.limit_period_months, c.cooldown_months, c.funding_round, c.chinese_affinity
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
  tags?: string;
  excludeTags?: string;
  sort?: string;
  order?: string;
  sort2?: string;
  order2?: string;
  sort3?: string;
  order3?: string;
  limit?: number;
  offset?: number;
  excludeExpired?: boolean;
  companyInfoStatus?: string;
}): { jobs: JobWithCompany[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.status) {
    const statuses = options.status.split(',').map(s => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      conditions.push('j.status = ?');
      params.push(statuses[0]);
    } else {
      conditions.push(`j.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
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

  // Tag include filter (OR: show jobs with ANY of these tags)
  if (options.tags) {
    const tagList = options.tags.split(',').map(t => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      const tagConditions = tagList.map(() => `EXISTS (SELECT 1 FROM json_each(j.score_tags) WHERE json_each.value = ?)`);
      conditions.push(`(${tagConditions.join(' OR ')})`);
      params.push(...tagList);
    }
  }

  // Tag exclude filter (AND: hide jobs with ANY of these tags)
  if (options.excludeTags) {
    const tagList = options.excludeTags.split(',').map(t => t.trim()).filter(Boolean);
    for (const tag of tagList) {
      conditions.push(`NOT EXISTS (SELECT 1 FROM json_each(j.score_tags) WHERE json_each.value = ?)`);
      params.push(tag);
    }
  }

  if (options.companyInfoStatus) {
    conditions.push('c.info_status = ?');
    params.push(options.companyInfoStatus);
  }

  // Expiry filter: exclude old jobs in inactive statuses
  if (options.excludeExpired !== false) {
    const expiryDays = getSettingNumber('expiry_days', 30);
    if (expiryDays > 0) {
      const placeholders = EXPIRABLE_STATUSES.map(() => '?').join(',');
      conditions.push(
        `NOT (j.status IN (${placeholders}) AND COALESCE(j.posted_at, j.created_at) < datetime('now', '-' || ? || ' days'))`
      );
      params.push(...EXPIRABLE_STATUSES, expiryDays);
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (db.prepare(`
    SELECT COUNT(*) as count FROM jobs j JOIN companies c ON j.company_id = c.id ${where}
  `).get(...params) as { count: number }).count;

  const allowedSorts = ['created_at', 'updated_at', 'title', 'salary_max', 'score', 'score_success', 'status_changed_at', 'company_name'];
  const resolveSortCol = (key: string) => key === 'company_name' ? 'c.display_name' : `j.${key}`;
  const resolveOrder = (o?: string) => o === 'ASC' ? 'ASC' : 'DESC';

  const sortKey = allowedSorts.includes(options.sort || '') ? options.sort! : 'created_at';
  const orderByClauses = [`${resolveSortCol(sortKey)} ${resolveOrder(options.order)}`];

  if (options.sort2 && allowedSorts.includes(options.sort2)) {
    orderByClauses.push(`${resolveSortCol(options.sort2)} ${resolveOrder(options.order2)}`);
  }
  if (options.sort3 && allowedSorts.includes(options.sort3)) {
    orderByClauses.push(`${resolveSortCol(options.sort3)} ${resolveOrder(options.order3)}`);
  }

  const orderByStr = orderByClauses.join(', ');
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const rows = db.prepare(`
    WITH company_counts AS (
      SELECT company_id,
             COUNT(*) as company_total_jobs,
             COUNT(*) FILTER (WHERE status NOT LIKE 'archived%' AND status != 'rejected_resume') as company_active_jobs
      FROM jobs
      GROUP BY company_id
    )
    SELECT j.*, c.name as company_name, c.display_name as company_display_name,
           c.industry as company_industry, c.size as company_size, c.description as company_description, c.ai_summary as company_ai_summary,
           c.application_strategy, c.strategy_reason, c.application_limit, c.limit_period_months, c.cooldown_months, c.funding_round, c.chinese_affinity,
           cc.company_active_jobs, cc.company_total_jobs
    FROM jobs j
    JOIN companies c ON j.company_id = c.id
    LEFT JOIN company_counts cc ON cc.company_id = j.company_id
    ${where}
    ORDER BY ${orderByStr}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as Record<string, unknown>[];

  return { jobs: rows.map(deserializeJob), total };
}

export function insertJob(data: JobInsert & { company_id: number }): Job {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO jobs (company_id, title, location, salary_min, salary_max, salary_currency,
      work_mode, commitment, jd_url, apply_url, jd_full_text, jd_fetch_status,
      jd_content_hash, source, source_id, status, score, score_success, score_reason, notes,
      visa_sponsorship, deep_analysis, posted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.company_id,
    data.title,
    serializeLocation(data.location),
    data.salary_min ?? null,
    data.salary_max ?? null,
    data.salary_currency ?? 'USD',
    data.work_mode ?? null,
    data.commitment ?? null,
    data.jd_url ?? null,
    data.apply_url ?? null,
    data.jd_full_text ?? null,
    data.jd_fetch_status ?? 'pending',
    data.jd_content_hash ?? null,
    data.source,
    data.source_id ?? null,
    data.status ?? 'pending_eval',
    data.score ?? null,
    data.score_success ?? null,
    data.score_reason ?? null,
    data.notes ?? null,
    data.visa_sponsorship ?? null,
    data.deep_analysis ?? null,
    data.posted_at ?? null,
  );

  const job = findJobById(result.lastInsertRowid as number)! as Job;

  // Also write to job_source_ids association table
  if (data.source_id && data.source) {
    addJobSourceId(job.id, data.source, data.source_id);
  }

  return job;
}

/**
 * Add a source_id mapping for a job (e.g., when merging multi-location LinkedIn postings).
 * Uses INSERT OR IGNORE to skip if the (source, source_id) pair already exists.
 */
export function addJobSourceId(jobId: number, source: string, sourceId: string): void {
  const db = getDb();
  db.prepare(
    'INSERT OR IGNORE INTO job_source_ids (job_id, source, source_id) VALUES (?, ?, ?)'
  ).run(jobId, source, sourceId);
}

/**
 * Find a job by source + source_id via the association table.
 * Returns the job_id if found, null otherwise.
 */
export function findJobBySourceId(source: string, sourceId: string): number | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT job_id FROM job_source_ids WHERE source = ? AND source_id = ?'
  ).get(source, sourceId) as { job_id: number } | undefined;
  return row?.job_id ?? null;
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
      } else if (key === 'score_tags') {
        fields.push('score_tags = ?');
        params.push(value ? JSON.stringify(value) : null);
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

/**
 * Merge two jobs: keep primary, absorb data from secondary, delete secondary.
 * Merges locations, inherits missing JD/salary, transfers source_ids.
 */
export function mergeJobs(primaryId: number, secondaryId: number): Job | null {
  const db = getDb();
  const primary = findJobById(primaryId);
  const secondary = findJobById(secondaryId);
  if (!primary || !secondary) return null;

  const updates: Partial<Record<string, unknown>> = {};

  // Merge locations (union, case-insensitive dedup)
  const existingSet = new Set((primary.location || []).map(l => l.toLowerCase().trim()));
  const newLocs = (secondary.location || []).filter(l => !existingSet.has(l.toLowerCase().trim()));
  if (newLocs.length > 0) {
    updates.location = [...primary.location, ...newLocs];
  }

  // Inherit JD if primary is missing
  if (!primary.jd_full_text && secondary.jd_full_text) {
    updates.jd_full_text = secondary.jd_full_text;
    updates.jd_content_hash = secondary.jd_content_hash;
    updates.jd_fetch_status = secondary.jd_fetch_status;
  }

  // Inherit salary if primary is missing
  if (primary.salary_min == null && secondary.salary_min != null) {
    updates.salary_min = secondary.salary_min;
  }
  if (primary.salary_max == null && secondary.salary_max != null) {
    updates.salary_max = secondary.salary_max;
  }
  if (!primary.salary_currency && secondary.salary_currency) {
    updates.salary_currency = secondary.salary_currency;
  }

  // Inherit posted_at if primary is missing
  if (!primary.posted_at && secondary.posted_at) {
    updates.posted_at = secondary.posted_at;
  }

  // Apply updates to primary
  if (Object.keys(updates).length > 0) {
    updateJob(primaryId, updates as Parameters<typeof updateJob>[1]);
  }

  // Transfer secondary's source_ids to primary
  const sourceIds = db.prepare(
    'SELECT source, source_id FROM job_source_ids WHERE job_id = ?'
  ).all(secondaryId) as { source: string; source_id: string }[];
  for (const { source, source_id } of sourceIds) {
    addJobSourceId(primaryId, source, source_id);
  }
  // Also transfer the secondary's own source/source_id
  if (secondary.source_id) {
    addJobSourceId(primaryId, secondary.source, secondary.source_id);
  }

  // Delete secondary
  deleteJob(secondaryId);

  return findJobById(primaryId) as Job | null;
}

export function countJobsByStatus(excludeExpired = true): Record<string, number> {
  const db = getDb();
  let sql = `SELECT status, COUNT(*) as count FROM jobs`;
  const params: (string | number)[] = [];

  if (excludeExpired) {
    const expiryDays = getSettingNumber('expiry_days', 30);
    if (expiryDays > 0) {
      const placeholders = EXPIRABLE_STATUSES.map(() => '?').join(',');
      sql += ` WHERE NOT (status IN (${placeholders}) AND COALESCE(posted_at, created_at) < datetime('now', '-' || ? || ' days'))`;
      params.push(...EXPIRABLE_STATUSES, expiryDays);
    }
  }

  sql += ` GROUP BY status`;
  const rows = db.prepare(sql).all(...params) as { status: string; count: number }[];

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
           c.industry as company_industry, c.size as company_size, c.description as company_description, c.ai_summary as company_ai_summary,
           c.application_strategy, c.strategy_reason, c.application_limit, c.limit_period_months, c.cooldown_months, c.funding_round, c.chinese_affinity
    FROM jobs j
    JOIN companies c ON j.company_id = c.id
    ORDER BY j.created_at DESC
    LIMIT ?
  `).all(limit) as Record<string, unknown>[];

  return rows.map(deserializeJob);
}
