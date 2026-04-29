import type Database from 'better-sqlite3';

export function migration021(db: Database.Database): void {
  // Performance indexes for extension save dedup hot path.
  // Previously /api/extension/save and /save-batch loaded every job (listJobs limit:10000)
  // for trigram dedup; these indexes support O(log n) source_id lookup and
  // per-company filtered scans.

  // Partial index on (source, source_id) skipping NULL source_id rows keeps the
  // index small (most rows have source_id). Base schema already has
  // idx_jobs_source ON jobs(source, source_id), but the partial variant is
  // narrower and preferred by the planner for the dedup fast path.
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_jobs_source_source_id
     ON jobs(source, source_id) WHERE source_id IS NOT NULL`
  );

  // Dedicated company_id index. The existing idx_jobs_company_title covers
  // (company_id, title) but a single-column index is smaller and faster for
  // the "load all jobs for this company" fallback dedup path.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id)`);

  // Expression index on LOWER(name) to speed up case-insensitive company
  // lookups from findCompanyByNameFuzzy. Companies.name is already normalized
  // (lowercased) at insert time, so plain equality on name uses the existing
  // UNIQUE index; this expression index helps any future LOWER()-based lookups
  // and is cheap (one row per company).
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_companies_name_lower
     ON companies(LOWER(name))`
  );

  // job_source_ids(source, source_id) already indexed via migration 014
  // (idx_job_source_ids_lookup) — no action needed.
}
