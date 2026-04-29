import type Database from 'better-sqlite3';
import { migration001 } from './001_initial_schema';
import { migration002 } from './002_chinese_affinity';
import { migration003 } from './003_deep_analysis';
import { migration004 } from './004_visa_sponsorship';
import { migration005 } from './005_apply_url';
import { migration006 } from './006_company_cooldown';
import { migration007 } from './007_rename_analyzed_status';
import { migration008 } from './008_reset_mass_apply_candidates';
import { migration009 } from './009_score_tags';
import { migration010 } from './010_score_success';
import { migration011 } from './011_limit_period';
import { migration012 } from './012_funding_round';
import { migration013 } from './013_salary_currency';
import { migration014 } from './014_job_source_ids';
import { migration015 } from './015_posted_at';
import { migration016 } from './016_rename_rejected';
import { migration017 } from './017_application_meta';
import { migration018 } from './018_auto_eval_log';
import { migration019 } from './019_jd_cleaned_text';
import { migration020 } from './020_qa_flagged';
import { migration021 } from './021_perf_indexes';
import { migration022 } from './022_prompt_templates';

interface Migration {
  id: number;
  name: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  { id: 1, name: '001_initial_schema', up: migration001 },
  { id: 2, name: '002_chinese_affinity', up: migration002 },
  { id: 3, name: '003_deep_analysis', up: migration003 },
  { id: 4, name: '004_visa_sponsorship', up: migration004 },
  { id: 5, name: '005_apply_url', up: migration005 },
  { id: 6, name: '006_company_cooldown', up: migration006 },
  { id: 7, name: '007_rename_analyzed_status', up: migration007 },
  { id: 8, name: '008_reset_mass_apply_candidates', up: migration008 },
  { id: 9, name: '009_score_tags', up: migration009 },
  { id: 10, name: '010_score_success', up: migration010 },
  { id: 11, name: '011_limit_period', up: migration011 },
  { id: 12, name: '012_funding_round', up: migration012 },
  { id: 13, name: '013_salary_currency', up: migration013 },
  { id: 14, name: '014_job_source_ids', up: migration014 },
  { id: 15, name: '015_posted_at', up: migration015 },
  { id: 16, name: '016_rename_rejected', up: migration016 },
  { id: 17, name: '017_application_meta', up: migration017 },
  { id: 18, name: '018_auto_eval_log', up: migration018 },
  { id: 19, name: '019_jd_cleaned_text', up: migration019 },
  { id: 20, name: '020_qa_flagged', up: migration020 },
  { id: 21, name: '021_perf_indexes', up: migration021 },
  { id: 22, name: '022_prompt_templates', up: migration022 },
];

export function runMigrations(db: Database.Database): void {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db.prepare('SELECT id FROM _migrations').all().map((r) => (r as { id: number }).id)
  );

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;

    db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)').run(
        migration.id,
        migration.name
      );
    })();

    console.log(`Migration applied: ${migration.name}`);
  }
}
