import { cleanJdText, splitLongLines, buildBatchJdCleanupPrompt, numberLines } from '../src/lib/jd-cleaner';
import { getDb, runWithUser } from '../src/lib/db';
import { execSync } from 'child_process';

const db = runWithUser(1, () => getDb());
const rows = db.prepare(`
  SELECT id, title, jd_full_text FROM jobs
  WHERE id IN (8282, 8284, 8285, 8286, 8288)
`).all() as { id: number; title: string; jd_full_text: string }[];

const jobData = rows.map(row => {
  const plaintext = splitLongLines(cleanJdText(row.jd_full_text));
  return { id: row.id, numberedText: numberLines(plaintext) };
});

const prompt = buildBatchJdCleanupPrompt(jobData);
console.log(`Prompt length: ${prompt.length} chars`);

const tmpFile = `/tmp/jd-debug.md`;
require('fs').writeFileSync(tmpFile, prompt, 'utf-8');

try {
  const stdout = execSync(
    `cat "${tmpFile}" | claude -p --no-session-persistence --output-format json --model haiku --max-turns 1`,
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 60000 }
  );
  const result = JSON.parse(stdout);
  console.log(`\nHaiku raw response (first 500 chars):`);
  console.log(result.result.slice(0, 500));
  console.log(`\nTokens: ${result.usage.input_tokens} in / ${result.usage.output_tokens} out`);
  
  // Try extractJson
  let cleaned = result.result.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  console.log(`\narrayMatch: ${arrayMatch ? 'yes' : 'no'}`);
  console.log(`objMatch: ${objMatch ? 'yes' : 'no'}`);
  if (objMatch) {
    try {
      JSON.parse(objMatch[0]);
      console.log('objMatch parses OK');
    } catch (e: any) {
      console.log(`objMatch parse error: ${e.message.slice(0, 200)}`);
    }
  }
} catch (err: any) {
  console.log(`Error: ${err.message?.slice(0, 300)}`);
} finally {
  try { require('fs').unlinkSync(tmpFile); } catch {}
}
