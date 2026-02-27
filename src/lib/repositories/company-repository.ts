import { getDb } from '@/lib/db';
import type { Company, CompanyInsert, CompanyUpdate } from '@/types';

function normalizeCompanyName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function findCompanyById(id: number): Company | null {
  const db = getDb();
  return db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as Company | undefined ?? null;
}

export function findCompanyByName(name: string): Company | null {
  const db = getDb();
  return db.prepare('SELECT * FROM companies WHERE name = ?').get(normalizeCompanyName(name)) as Company | undefined ?? null;
}

export function findOrCreateCompany(displayName: string): Company {
  const name = normalizeCompanyName(displayName);
  const existing = findCompanyByName(displayName);
  if (existing) return existing;

  const db = getDb();
  const result = db.prepare(
    `INSERT INTO companies (name, display_name) VALUES (?, ?)`
  ).run(name, displayName.trim());

  return findCompanyById(result.lastInsertRowid as number)!;
}

export function listCompanies(options: {
  strategy?: string;
  infoStatus?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): { companies: Company[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.strategy) {
    conditions.push('application_strategy = ?');
    params.push(options.strategy);
  }
  if (options.infoStatus) {
    conditions.push('info_status = ?');
    params.push(options.infoStatus);
  }
  if (options.q) {
    conditions.push('(display_name LIKE ? OR industry LIKE ?)');
    const like = `%${options.q}%`;
    params.push(like, like);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (db.prepare(`SELECT COUNT(*) as count FROM companies ${where}`).get(...params) as { count: number }).count;

  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const companies = db.prepare(
    `SELECT * FROM companies ${where} ORDER BY display_name ASC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as Company[];

  return { companies, total };
}

export function updateCompany(id: number, data: CompanyUpdate): Company | null {
  const db = getDb();
  const fields: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
  }

  if (fields.length === 0) return findCompanyById(id);

  fields.push(`updated_at = datetime('now')`);
  params.push(id);

  db.prepare(`UPDATE companies SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return findCompanyById(id);
}

export function insertCompany(data: CompanyInsert): Company {
  const db = getDb();
  const name = normalizeCompanyName(data.name);
  const result = db.prepare(`
    INSERT INTO companies (name, display_name, website, industry, size, description, ai_summary,
      application_strategy, strategy_reason, application_limit, info_status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    data.display_name,
    data.website ?? null,
    data.industry ?? null,
    data.size ?? null,
    data.description ?? null,
    data.ai_summary ?? null,
    data.application_strategy ?? 'open',
    data.strategy_reason ?? null,
    data.application_limit ?? null,
    data.info_status ?? 'pending',
    data.notes ?? null,
  );

  return findCompanyById(result.lastInsertRowid as number)!;
}

export function deleteCompany(id: number): boolean {
  const db = getDb();
  const jobCount = (db.prepare('SELECT COUNT(*) as count FROM jobs WHERE company_id = ?').get(id) as { count: number }).count;
  if (jobCount > 0) return false;
  db.prepare('DELETE FROM companies WHERE id = ?').run(id);
  return true;
}

export function countActiveApplications(companyId: number): number {
  const db = getDb();
  return (db.prepare(
    `SELECT COUNT(*) as count FROM jobs WHERE company_id = ? AND status IN ('applied', 'interviewing')`
  ).get(companyId) as { count: number }).count;
}
