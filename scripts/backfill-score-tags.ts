/**
 * Backfill score_tags for jobs that have score_reason but no tags.
 *
 * Usage:
 *   npx tsx scripts/backfill-score-tags.ts export > /tmp/backfill-prompt.md
 *   # Paste prompt into AI, copy JSON result
 *   npx tsx scripts/backfill-score-tags.ts import < /tmp/ai-result.json
 */

import { getDb, closeDb } from '../src/lib/db';
import { runMigrations } from '../src/lib/migrations/runner';
import { SCORE_TAGS } from '../src/types/job';

const command = process.argv[2];

if (!command || !['export', 'import'].includes(command)) {
  console.error('Usage: npx tsx scripts/backfill-score-tags.ts <export|import>');
  process.exit(1);
}

const db = getDb();
runMigrations(db);

if (command === 'export') {
  const rows = db.prepare(`
    SELECT id, score, score_reason FROM jobs
    WHERE score_reason IS NOT NULL AND score_reason != '' AND score_tags IS NULL
    ORDER BY id
  `).all() as { id: number; score: number; score_reason: string }[];

  if (rows.length === 0) {
    console.log('No jobs need backfilling.');
    closeDb();
    process.exit(0);
  }

  const lines: string[] = [
    '# Backfill Score Tags',
    '',
    'For each job below, based on the score and score_reason, assign 1-3 tags from:',
    '',
    'Negative: downpay, down_level, skill_gap, domain_gap, exp_gap',
    'Positive: strong_match, rare_opportunity',
    'Risk: cooldown_risk, overqualified',
    '',
    'Output a JSON array:',
    '```json',
    '[{"id": 42, "score_tags": ["skill_gap"]}]',
    '```',
    '',
    `Total: ${rows.length} jobs`,
    '',
    '---',
    '',
  ];

  for (const row of rows) {
    lines.push(`**Job #${row.id}** (score: ${row.score}): ${row.score_reason}`);
    lines.push('');
  }

  console.log(lines.join('\n'));
} else {
  // import mode: read JSON from stdin
  let input = '';
  const chunks: Buffer[] = [];

  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    input = Buffer.concat(chunks).toString('utf-8').trim();

    // Extract JSON from markdown code blocks if present
    const codeBlockMatch = input.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    const jsonStr = codeBlockMatch ? codeBlockMatch[1] : input;

    let items: { id: number; score_tags: string[] }[];
    try {
      items = JSON.parse(jsonStr);
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

    const stmt = db.prepare('UPDATE jobs SET score_tags = ?, updated_at = datetime(\'now\') WHERE id = ?');
    let updated = 0;
    const errors: string[] = [];

    const run = db.transaction(() => {
      for (const item of items) {
        if (typeof item.id !== 'number') {
          errors.push(`Invalid item: missing id`);
          continue;
        }
        if (!Array.isArray(item.score_tags)) {
          errors.push(`Job #${item.id}: score_tags must be an array`);
          continue;
        }
        const validTags = item.score_tags.filter(t => SCORE_TAGS.includes(t));
        if (validTags.length === 0) {
          errors.push(`Job #${item.id}: no valid tags found in [${item.score_tags.join(', ')}]`);
          continue;
        }
        stmt.run(JSON.stringify(validTags), item.id);
        updated++;
      }
    });

    run();

    console.log(`Updated ${updated} jobs.`);
    if (errors.length > 0) {
      console.log(`\nWarnings (${errors.length}):`);
      for (const e of errors) console.log(`  - ${e}`);
    }

    closeDb();
  });
}
