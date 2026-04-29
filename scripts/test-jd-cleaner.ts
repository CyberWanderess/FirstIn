import { cleanJdText, splitLongLines } from '../src/lib/jd-cleaner';
import { getDb, runWithUser } from '../src/lib/db';

const db = runWithUser(1, () => getDb());

// Test on single-paragraph JDs
for (const id of [101, 5540, 658]) {
  const row = db.prepare('SELECT title, jd_full_text FROM jobs WHERE id = ?').get(id) as any;
  if (!row) { console.log(`#${id} not found`); continue; }
  
  const cleaned = cleanJdText(row.jd_full_text);
  const split = splitLongLines(cleaned);
  const linesBefore = cleaned.split('\n').length;
  const linesAfter = split.split('\n').length;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`#${id} "${row.title.slice(0, 50)}"`);
  console.log(`Lines: ${linesBefore} → ${linesAfter} | Chars: ${cleaned.length} → ${split.length}`);
  console.log(`First 500 chars after split:`);
  console.log(split.slice(0, 500));
  console.log('...');
}
