/**
 * One-off experiment: does appending a "context dilution guard" paragraph
 * to the recheck prompt change the model's score on big-AI-co jobs that the
 * user manually archived as "not actually a match"?
 *
 * Single-agent, serial, read-only on DB. No DB writes.
 *
 * Usage: tsx scripts/smoke-dilution-test.ts
 */
import Database from 'better-sqlite3';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildRecheckPrompt, parseRecheckResult } from '../src/lib/export/evaluation-recheck';
import { SHARED_SCORING_RULES } from '../src/lib/export/scoring-rules';

const execAsync = promisify(exec);
const dbPath = path.join(process.cwd(), 'data/user-1.db');
const db = new Database(dbPath, { readonly: true });

// 10 jobs user manually archived after the 112-job recheck — all at score 7+ with strong_match
const ids = [12763, 12551, 12708, 12509, 12199, 12157, 11759, 11922, 11723, 12607];

const DILUTION_GUARD = `

## CONTEXT DILUTION GUARD (mandatory check before strong_match at FAANG / top AI / big-tech)

Big AI / tech companies' JDs naturally contain AI / ML / cloud / infrastructure keywords as company boilerplate ("About the team / We're at the frontier of AI / Join us to build the future") and "ways to stand out" sections. These keywords alone are NOT evidence the role matches candidate's concrete experience.

**Before tagging \`strong_match\` or invoking rule 1 (software infra strength):**

1. Re-read the JD's TOP 3-5 PRIMARY responsibilities ("you will", "primary duties"). **Ignore** "About the team / company", "ways to stand out", "nice to have".
2. Verify those primary duties specifically require candidate's CONCRETE background: cloud migration (= moving applications to cloud), AI/ML research-to-product delivery (= shipping research into production), PMO governance (virtual PMO across engineers), ads monetization pipeline (recall/ranking, data warehouse, A/B), compliance frameworks (GDPR / EO 14117 / content safety), XR / on-device / SLAM.
3. If the core work is a narrow sub-specialty, do NOT tag \`strong_match\` and do NOT invoke rule 1. Tag \`domain_gap:minor\` or \`domain_gap:major\` appropriately.

**Narrow sub-specialties that do NOT qualify as strong_match (regardless of AI context in company boilerplate):**
- SRE / Site Reliability Engineering (on-call, SLO/SLI, incident response, chaos engineering)
- Specific cloud DB / data product TPM (Redshift, BigQuery, Snowflake product internals, Azure Storage product)
- Storage / compute COGS / cost-of-goods optimization (finance-adjacent infra ops)
- Autonomous vehicles / automotive functional safety (ISO 26262 / ASPICE / DRIVE OS)
- Customer-success / customer-facing / professional-services PM (external customer ops)
- Executive-in-Residence / advisory / strategy roles (require specific executive networks)
- Device / hardware product teams when the JD's primary duties are hardware lifecycle (not candidate's "3 gen XR" adjacency)

Rule 1 (software infra = strength) applies to **generic** cloud / AI / ML / data infrastructure TPM program management — NOT to the narrow sub-specialties above.`;

const modifiedRules = SHARED_SCORING_RULES + DILUTION_GUARD;

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

const byId = new Map(jobs.map((j) => [j.id, j]));
const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as any[];

(async () => {
  let totalCost = 0;
  const results: Array<{ id: number; old: number | null; neu: number | null; delta: number | string }> = [];
  for (const j of ordered) {
    const prompt = buildRecheckPrompt(j, { sharedScoringRules: modifiedRules } as any);
    const tmp = join(tmpdir(), `dilution-${j.id}-${Date.now()}.md`);
    writeFileSync(tmp, prompt);
    const cmd = `cat "${tmp}" | claude -p --no-session-persistence --output-format json --model opus --max-turns 3`;
    const t0 = Date.now();
    try {
      const { stdout } = await execAsync(cmd, { maxBuffer: 20 * 1024 * 1024 });
      const outer = JSON.parse(stdout);
      totalCost += outer.total_cost_usd || 0;
      const parsed = parseRecheckResult(outer.result);
      const dt = ((Date.now() - t0) / 1000).toFixed(0);
      const oldSS = j.score_success as number | null;
      const newSS = (parsed?.score_success ?? null) as number | null;
      const delta: number | string = newSS != null && oldSS != null ? newSS - oldSS : '?';
      const titleSlim = (j.title as string).substring(0, 42).padEnd(42);
      const coSlim = (j.company_display_name as string).substring(0, 14).padEnd(14);
      console.log(`#${j.id} | ${titleSlim} | ${coSlim} | ${oldSS} → ${newSS} (Δ${delta}, ${dt}s)`);
      if (parsed?.score_reason) {
        console.log(`   reason: ${(parsed.score_reason as string).substring(0, 240)}`);
      }
      results.push({ id: j.id, old: oldSS, neu: newSS, delta });
    } catch (e) {
      console.log(`#${j.id} FAILED: ${(e as Error).message.substring(0, 160)}`);
    } finally {
      try {
        unlinkSync(tmp);
      } catch {}
    }
  }
  const rose = results.filter((r) => typeof r.delta === 'number' && (r.delta as number) > 0).length;
  const fell = results.filter((r) => typeof r.delta === 'number' && (r.delta as number) < 0).length;
  const same = results.filter((r) => typeof r.delta === 'number' && (r.delta as number) === 0).length;
  const avg = results
    .filter((r) => typeof r.delta === 'number')
    .reduce((a, r) => a + (r.delta as number), 0) / Math.max(1, results.filter((r) => typeof r.delta === 'number').length);
  console.log(`\n=== summary ===`);
  console.log(`rose ${rose}, fell ${fell}, same ${same} | avg Δ = ${avg.toFixed(2)} | cost $${totalCost.toFixed(2)}`);
})();
