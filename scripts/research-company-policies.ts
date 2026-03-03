/**
 * Research and update company application policies (cooldown, limits).
 *
 * Usage:
 *   DATABASE_PATH=./data/jobhq.db npx tsx scripts/research-company-policies.ts export [--all]
 *   DATABASE_PATH=./data/jobhq.db npx tsx scripts/research-company-policies.ts import < results.json
 *
 * export: outputs companies needing research as JSON
 *   --all: include all companies with active jobs (not just missing data)
 * import: reads JSON array from stdin and updates the database
 */

import { getDb, closeDb } from '../src/lib/db';
import { runMigrations } from '../src/lib/migrations/runner';

const command = process.argv[2];
const flags = process.argv.slice(3);

if (!command || !['export', 'import'].includes(command)) {
  console.error('Usage: npx tsx scripts/research-company-policies.ts <export|import> [--all]');
  process.exit(1);
}

const db = getDb();
runMigrations(db);

if (command === 'export') {
  const includeAll = flags.includes('--all');

  const query = includeAll
    ? `SELECT c.id, c.display_name, c.application_limit, c.cooldown_months,
              COUNT(j.id) as job_count
       FROM companies c
       JOIN jobs j ON j.company_id = c.id
       WHERE j.status NOT LIKE 'archived%'
       GROUP BY c.id
       ORDER BY job_count DESC`
    : `SELECT c.id, c.display_name, c.application_limit, c.cooldown_months,
              COUNT(j.id) as job_count
       FROM companies c
       JOIN jobs j ON j.company_id = c.id
       WHERE j.status NOT LIKE 'archived%'
         AND (c.cooldown_months IS NULL OR c.application_limit IS NULL)
       GROUP BY c.id
       ORDER BY job_count DESC`;

  const rows = db.prepare(query).all() as {
    id: number;
    display_name: string;
    application_limit: number | null;
    cooldown_months: number | null;
    job_count: number;
  }[];

  const output = rows.map((r) => ({
    id: r.id,
    name: r.display_name,
    jobs: r.job_count,
    current_limit: r.application_limit,
    current_cooldown: r.cooldown_months,
  }));

  console.log(JSON.stringify(output, null, 2));
  console.error(`\nExported ${rows.length} companies.`);
} else {
  // import mode
  const chunks: Buffer[] = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    const input = Buffer.concat(chunks).toString('utf-8').trim();

    let items: { id: number; application_limit: number | null; cooldown_months: number | null }[];
    try {
      items = JSON.parse(input);
    } catch {
      console.error('Failed to parse JSON input');
      closeDb();
      process.exit(1);
    }

    if (!Array.isArray(items)) {
      console.error('Expected a JSON array');
      closeDb();
      process.exit(1);
    }

    const stmt = db.prepare(
      `UPDATE companies SET application_limit = ?, cooldown_months = ?, updated_at = datetime('now') WHERE id = ?`
    );

    let updated = 0;
    const errors: string[] = [];

    const run = db.transaction(() => {
      for (const item of items) {
        if (typeof item.id !== 'number') {
          errors.push('Invalid item: missing id');
          continue;
        }
        const limit = item.application_limit;
        const cooldown = item.cooldown_months;
        if (limit !== null && typeof limit !== 'number') {
          errors.push(`Company #${item.id}: application_limit must be number or null`);
          continue;
        }
        if (cooldown !== null && typeof cooldown !== 'number') {
          errors.push(`Company #${item.id}: cooldown_months must be number or null`);
          continue;
        }
        stmt.run(limit, cooldown, item.id);
        updated++;
      }
    });

    run();

    console.log(`Updated ${updated} companies.`);
    if (errors.length > 0) {
      console.log(`\nErrors (${errors.length}):`);
      for (const e of errors) console.log(`  - ${e}`);
    }

    closeDb();
  });
}
