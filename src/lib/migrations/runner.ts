import type Database from 'better-sqlite3';
import { migration001 } from './001_initial_schema';
import { migration002 } from './002_chinese_affinity';
import { migration003 } from './003_deep_analysis';
import { migration004 } from './004_visa_sponsorship';
import { migration005 } from './005_apply_url';
import { migration006 } from './006_company_cooldown';
import { migration007 } from './007_rename_analyzed_status';
import { migration008 } from './008_reset_mass_apply_candidates';

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
