import type Database from 'better-sqlite3';
import { config } from '@/lib/config';

export function migration001(db: Database.Database): void {
  const defaultPlatform = config.enableCrawler ? 'hiring_cafe' : 'general';
  // Companies table
  db.exec(`
    CREATE TABLE companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      website TEXT,
      industry TEXT,
      size TEXT,
      description TEXT,
      ai_summary TEXT,
      application_strategy TEXT NOT NULL DEFAULT 'open',
      strategy_reason TEXT,
      application_limit INTEGER,
      info_status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`CREATE INDEX idx_companies_strategy ON companies(application_strategy)`);
  db.exec(`CREATE INDEX idx_companies_info_status ON companies(info_status)`);

  // Jobs table
  db.exec(`
    CREATE TABLE jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      title TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '[]',
      salary_min INTEGER,
      salary_max INTEGER,
      work_mode TEXT,
      commitment TEXT,
      jd_url TEXT,
      jd_full_text TEXT,
      jd_fetch_status TEXT NOT NULL DEFAULT 'pending',
      jd_content_hash TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      source_id TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      score INTEGER,
      score_reason TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      status_changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`CREATE INDEX idx_jobs_company_title ON jobs(company_id, title)`);
  db.exec(`CREATE INDEX idx_jobs_status ON jobs(status)`);
  db.exec(`CREATE INDEX idx_jobs_created_at ON jobs(created_at)`);
  db.exec(`CREATE INDEX idx_jobs_jd_content_hash ON jobs(jd_content_hash)`);
  db.exec(`CREATE INDEX idx_jobs_source ON jobs(source, source_id)`);

  // Filter rules table
  db.exec(`
    CREATE TABLE filter_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      field TEXT NOT NULL,
      operator TEXT NOT NULL,
      value TEXT NOT NULL,
      action TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Settings table
  db.exec(`
    CREATE TABLE settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Search configs table
  db.exec(`
    CREATE TABLE search_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT '${defaultPlatform}',
      query_params TEXT NOT NULL DEFAULT '{}',
      schedule TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      last_run_result TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Operation log table
  db.exec(`
    CREATE TABLE operation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      trigger TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`CREATE INDEX idx_oplog_entity ON operation_log(entity_type, entity_id)`);
  db.exec(`CREATE INDEX idx_oplog_operation ON operation_log(operation, created_at)`);

  // Insert default settings
  const insertSetting = db.prepare(
    `INSERT INTO settings (key, value, description) VALUES (?, ?, ?)`
  );

  insertSetting.run('eval_score_threshold', '7', 'Minimum score for deep analysis');
  insertSetting.run('archive_no_response_days', '14', 'Days before auto-archiving no-response jobs');
  insertSetting.run('scrape_delay_ms', '5000', 'Delay between scrape requests in milliseconds');
  insertSetting.run('scrape_batch_size', '20', 'Max jobs per batch scrape');
  insertSetting.run('no_h1b_action', 'auto_exclude', 'Action for no-H1B companies: auto_exclude or warn');
  insertSetting.run('blocked_action', 'auto_exclude', 'Action for blocked companies: auto_exclude or warn');
}
