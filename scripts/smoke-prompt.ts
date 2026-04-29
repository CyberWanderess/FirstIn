/**
 * Smoke-test the eval prompt content (Pipeline A + B) without hitting the API.
 * Verifies the new SHARED_SCORING_RULES + revised calibration appear in both pipelines.
 *
 * Usage: tsx scripts/smoke-prompt.ts
 */
import Database from 'better-sqlite3';
import path from 'path';
import { exportJobsForEvaluation } from '../src/lib/export/evaluation-exporter';
import { buildRecheckPrompt } from '../src/lib/export/evaluation-recheck';

const dbPath = path.join(process.cwd(), 'data/user-1.db');
const db = new Database(dbPath, { readonly: true });

const ids = process.argv.slice(2).map(Number).filter(Boolean);
if (!ids.length) {
  console.error('Usage: tsx scripts/smoke-prompt.ts <jobId1> [jobId2 ...]');
  process.exit(1);
}

const jobs = db
  .prepare(
    `SELECT j.*, c.name AS company_display_name,
            c.industry AS company_industry,
            c.size AS company_size,
            c.description AS company_description,
            c.ai_summary AS company_ai_summary,
            c.cooldown_months,
            c.funding_round AS company_funding_round
     FROM jobs j JOIN companies c ON c.id=j.company_id
     WHERE j.id IN (${ids.map(() => '?').join(',')})`
  )
  .all(...ids) as any[];

for (const j of jobs) {
  if (typeof j.location === 'string') {
    try { j.location = JSON.parse(j.location); } catch { j.location = []; }
  }
}

console.log('━━━ PIPELINE A (manual eval) ━━━');
const aPrompt = exportJobsForEvaluation(jobs as any);
console.log(`Prompt length: ${aPrompt.length} chars`);
const aChecks = [
  ['SHARED_SCORING_RULES present', aPrompt.includes('Shared scoring rules')],
  ['Software-infra-strength rule', aPrompt.includes('Software infra is a STRENGTH')],
  ['Hardware trigger list', aPrompt.includes('silicon tape-out')],
  ['Healthy-startup boost rule', aPrompt.includes('Healthy-but-unfamous AI startup boost')],
  ['Top-tier reverse example', aPrompt.includes('OpenAI/Anthropic-tier')],
  ['Seniority neutral rule', aPrompt.includes('Seniority is score_success neutral')],
  ['Cloud strength in profile', aPrompt.includes('Cloud architecture & large-scale migration')],
  ['Old "Cloud platform ≤ 4" REMOVED', !aPrompt.includes('score_success ≤ 4 maximum')],
  ['Old "DevOps/SRE/networking" REMOVED', !aPrompt.includes('Pure DevOps/SRE/networking')],
  ['Series-B anchor present', aPrompt.includes('Series-B AI startup, AI Platform TPM')],
];
for (const [name, ok] of aChecks) console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${name}`);

console.log('\n━━━ PIPELINE B (recheck) ━━━');
for (const job of jobs) {
  const bPrompt = buildRecheckPrompt(job as any);
  console.log(`\n--- Job #${job.id} (${job.company_display_name}, ${job.title}) ---`);
  console.log(`Prompt length: ${bPrompt.length} chars`);
  const bChecks = [
    ['SHARED_SCORING_RULES present', bPrompt.includes('Shared scoring rules')],
    ['Software-infra-strength rule', bPrompt.includes('Software infra is a STRENGTH')],
    ['Healthy-startup boost rule', bPrompt.includes('Healthy-but-unfamous AI startup boost')],
    ['Seniority neutral rule', bPrompt.includes('Seniority is score_success neutral')],
    ['SIGNAL_STRENGTH_MAP intact', bPrompt.includes('Candidate Signal-to-Strength Mapping')],
    ['Software infra IS-strong section', bPrompt.includes('IS strong in — software infra')],
  ];
  for (const [name, ok] of bChecks) console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${name}`);
}
