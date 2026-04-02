/**
 * One-time script: clean HTML from existing jd_full_text in the database.
 * Usage: npx tsx scripts/clean-jd-html.ts [--dry-run]
 */
import Database from 'better-sqlite3';
import { join } from 'path';
import { cleanJdText } from '../src/lib/jd-cleaner';
import { hashContent } from '../src/lib/dedup';

const dbPath = join(process.cwd(), 'data', 'jobhq.db');
const dryRun = process.argv.includes('--dry-run');

const db = new Database(dbPath);

const rows = db.prepare(
  `SELECT id, title, jd_full_text FROM jobs WHERE jd_full_text LIKE '%<%'`
).all() as { id: number; title: string; jd_full_text: string }[];

console.log(`Found ${rows.length} jobs with HTML in jd_full_text`);
if (dryRun) console.log('(dry run — no changes will be made)\n');

const update = db.prepare(
  `UPDATE jobs SET jd_full_text = ?, jd_content_hash = ? WHERE id = ?`
);

let cleaned = 0;
const run = db.transaction(() => {
  for (const row of rows) {
    const before = row.jd_full_text;
    const after = cleanJdText(before);

    if (before === after) continue;

    const reduction = ((1 - after.length / before.length) * 100).toFixed(1);
    console.log(`#${row.id} ${row.title}: ${before.length} → ${after.length} chars (-${reduction}%)`);

    if (!dryRun) {
      update.run(after, hashContent(after), row.id);
    }
    cleaned++;
  }
});

run();

console.log(`\n${dryRun ? 'Would clean' : 'Cleaned'}: ${cleaned}/${rows.length} jobs`);
db.close();
