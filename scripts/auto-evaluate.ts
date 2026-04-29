/**
 * Auto-Evaluation Background Worker
 *
 * Detects pending companies and jobs, processes them one-at-a-time via `claude -p`
 * for maximum evaluation accuracy (no batch attention dilution).
 *
 * Usage:
 *   DATABASE_PATH=./data/user-1.db npx tsx scripts/auto-evaluate.ts
 *
 * Environment:
 *   DATABASE_PATH      — path to SQLite database (required)
 *   AUTO_EVAL_MODEL    — claude model (default: opus)
 *   AUTO_EVAL_POLL     — seconds between cycles (default: 30)
 *   AUTO_EVAL_DELAY    — seconds between individual calls (default: 5)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, promises as fsp } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);
import { getDb, closeDb, runWithUser, runWithUserAsync } from '../src/lib/db';
import { runMigrations } from '../src/lib/migrations/runner';
import { exportCompaniesForResearch } from '../src/lib/export/company-exporter';
import { parseCompanyResearch, applyCompanyResearch } from '../src/lib/export/company-importer';
import { exportJobsForEvaluation } from '../src/lib/export/evaluation-exporter';
import { parseEvaluationResults, applyEvaluationResults } from '../src/lib/export/evaluation-importer';
import { buildRecheckPrompt, parseRecheckResult, computeDecision, type RecheckResult } from '../src/lib/export/evaluation-recheck';
import { resolvePrompt } from '../src/lib/export/prompt-registry';

// Prompt config resolvers — called per-batch so user edits take effect on the
// next cycle without restarting the worker.
const companyPromptConfig = () => ({ instructions: resolvePrompt('company.instructions') });
const evalPromptConfig = () => ({
  scoringGuidance: resolvePrompt('eval.scoring_guidance'),
  calibrationExamples: resolvePrompt('eval.calibration'),
  scoreTags: resolvePrompt('eval.score_tags'),
});
const recheckPromptConfig = () => ({
  taskFraming: resolvePrompt('recheck.task_framing'),
  signalStrengthMap: resolvePrompt('recheck.signal_strength'),
  sharedScoringRules: resolvePrompt('shared.scoring_rules'),
  outputFormat: resolvePrompt('recheck.output_format'),
});
import { cleanJdText, splitLongLines, buildBatchJdCleanupPrompt, numberLines, removeLineRanges } from '../src/lib/jd-cleaner';
import type { Company, JobWithCompany } from '../src/types';

// ── Config ──────────────────────────────────────────────────────────
const MODEL = process.env.AUTO_EVAL_MODEL || 'opus';
const POLL_INTERVAL = parseInt(process.env.AUTO_EVAL_POLL || '30', 10) * 1000;
const CALL_DELAY = parseInt(process.env.AUTO_EVAL_DELAY || '5', 10) * 1000;
const USER_ID = parseInt(process.env.AUTO_EVAL_USER_ID || '1', 10);
const COMPANY_BATCH_SIZE = parseInt(process.env.AUTO_EVAL_COMPANY_BATCH || '3', 10);
const JOB_BATCH_SIZE = parseInt(process.env.AUTO_EVAL_JOB_BATCH || '5', 10);

// Per-phase concurrency. Default 1 preserves current sequential behavior.
// Bump to 2-3 (or higher for Haiku) to dispatch multiple `claude -p` calls in parallel.
const COMPANY_CONCURRENCY = parseInt(process.env.COMPANY_CONCURRENCY || '1', 10);
const JD_CONCURRENCY = parseInt(process.env.JD_CONCURRENCY || '1', 10);
const EVAL_CONCURRENCY = parseInt(process.env.EVAL_CONCURRENCY || '1', 10);

// QA phase: Opus agent that spot-checks eval + company research outputs.
const QA_ENABLED = process.env.QA_ENABLED === 'true';
const QA_CONCURRENCY = parseInt(process.env.QA_CONCURRENCY || '1', 10);
const QA_BATCH = parseInt(process.env.QA_BATCH || '3', 10);
const QA_SAMPLE_RATE = parseFloat(process.env.QA_SAMPLE_RATE || '0.2');
const QA_MODEL = process.env.QA_MODEL || 'opus';

// --mode=manual (default): run until no pending work, then exit
// --mode=auto: keep polling forever (until UI switches to manual via DB)
let MODE: 'manual' | 'auto' = process.argv.includes('--mode=auto') ? 'auto' : 'manual';

// Phase toggles: DB settings take precedence, then env vars, default true
function isPhaseEnabled(settingKey: string, envKey: string): boolean {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(settingKey) as { value: string } | undefined;
  if (row) return row.value !== 'false';
  return process.env[envKey] !== 'false';
}

// ── DB Setup (wrapped in user context for multi-tenant) ─────────────
const db = runWithUser(USER_ID, () => {
  const d = getDb();
  runMigrations(d);
  return d;
});

// ── Logging ─────────────────────────────────────────────────────────
function ts(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function log(msg: string): void {
  console.log(`[${ts()}] ${msg}`);
}

interface ClaudeResult {
  result: string;
  total_cost_usd: number;
  duration_ms: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

function logToDb(entry: {
  run_type: string;
  entity_type?: string;
  entity_id?: number;
  entity_name?: string;
  status: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  duration_ms?: number;
  result_summary?: string;
}): void {
  db.prepare(`
    INSERT INTO auto_eval_log (run_type, entity_type, entity_id, entity_name, status, input_tokens, output_tokens, cost_usd, duration_ms, result_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.run_type,
    entry.entity_type ?? null,
    entry.entity_id ?? null,
    entry.entity_name ?? null,
    entry.status,
    entry.input_tokens ?? null,
    entry.output_tokens ?? null,
    entry.cost_usd ?? null,
    entry.duration_ms ?? null,
    entry.result_summary ?? null,
  );
}

// ── Claude CLI ──────────────────────────────────────────────────────
async function callClaude(prompt: string, opts?: { maxTurns?: number; webSearch?: boolean; model?: string }): Promise<ClaudeResult> {
  // PID + timestamp + random suffix so parallel calls never collide on the tmpfile
  const rand = Math.random().toString(36).slice(2, 10);
  const tmpFile = `/tmp/auto-eval-prompt-${process.pid}-${Date.now()}-${rand}.md`;
  await fsp.writeFile(tmpFile, prompt, 'utf-8');

  const modelFlag = opts?.model || MODEL;
  const maxTurnsFlag = opts?.maxTurns ? ` --max-turns ${opts.maxTurns}` : '';
  const toolsFlag = opts?.webSearch !== false ? ' --allowedTools "WebSearch,WebFetch"' : '';
  try {
    const { stdout } = await execAsync(
      `cat "${tmpFile}" | claude -p --no-session-persistence --output-format json --model ${modelFlag}${toolsFlag}${maxTurnsFlag}`,
      {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout: 5 * 60 * 1000, // 5 min per call
      },
    );
    return JSON.parse(stdout);
  } finally {
    try { await fsp.unlink(tmpFile); } catch { /* ignore */ }
  }
}

function extractJson(text: string): string | null {
  // Strip markdown code fences if present
  let cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

  // Find the JSON array by bracket-balancing from the first `[`. The greedy regex
  // approach over-grabs when the model appends a "Sources:" block with bracketed
  // markdown links after the array. We need to stop at the matching closing bracket.
  const arrStart = cleaned.indexOf('[');
  if (arrStart !== -1) {
    const arr = sliceBalanced(cleaned, arrStart, '[', ']');
    if (arr) {
      try { JSON.parse(arr); return arr; } catch { /* fall through */ }
    }
  }

  // Fallback: single JSON object → wrap in array
  const objStart = cleaned.indexOf('{');
  if (objStart !== -1) {
    const obj = sliceBalanced(cleaned, objStart, '{', '}');
    if (obj) {
      try { JSON.parse(obj); return `[${obj}]`; } catch { /* fall through */ }
    }
  }

  return null;
}

/**
 * Walk from `start` and return the substring up to the matching closing bracket,
 * respecting string literals (so brackets inside JSON string values don't count).
 * Returns null if no balanced match is found.
 */
function sliceBalanced(s: string, start: number, open: string, close: string): string | null {
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function totalInputTokens(usage: ClaudeResult['usage']): number {
  return (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

// Normalize names for cross-side matching. Collapses smart quotes/dashes to
// their ASCII equivalents because Claude tends to return straight quotes even
// when the DB stores the curly-quote variant (e.g. `Brink’s Inc` vs `Brink's Inc`).
function normalizeName(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, '-');
}

// ── Company Research ────────────────────────────────────────────────
function getPendingCompanies(): Company[] {
  const rows = db.prepare(`
    SELECT DISTINCT c.* FROM companies c
    JOIN jobs j ON j.company_id = c.id
    WHERE c.info_status = 'pending'
    AND j.status = 'pending_eval'
    AND c.id NOT IN (
      SELECT entity_id FROM auto_eval_log
      WHERE run_type = 'company_research' AND status = 'failed' AND entity_id IS NOT NULL
      GROUP BY entity_id
      HAVING COUNT(*) >= 3
    )
    ORDER BY c.id ASC
  `).all() as Company[];
  return rows;
}

async function processCompanyBatch(batch: Company[]): Promise<{ success: number; failed: number }> {
  const names = batch.map(c => c.display_name);
  log(`  Researching batch of ${batch.length}: ${names.join(', ')}`);

  let success = 0;
  let failed = 0;

  try {
    const prompt = exportCompaniesForResearch(batch, 'markdown', companyPromptConfig());
    const maxTurns = 10 + batch.length * 5; // ~5 search turns per company + buffer
    const cliResult = await callClaude(prompt, { maxTurns });

    const jsonText = extractJson(cliResult.result);
    if (!jsonText) {
      log(`  ✗ Batch failed: no JSON in response`);
      for (const company of batch) {
        logToDb({
          run_type: 'company_research', entity_type: 'company', entity_id: company.id,
          entity_name: company.display_name, status: 'failed',
          cost_usd: cliResult.total_cost_usd / batch.length,
          duration_ms: cliResult.duration_ms,
          result_summary: 'No JSON in batch response',
        });
        failed++;
      }
      return { success, failed };
    }

    const parsed = parseCompanyResearch(jsonText);
    if (parsed.items.length === 0) {
      log(`  ✗ Batch failed: parse error: ${parsed.warnings.join('; ')}`);
      for (const company of batch) {
        logToDb({
          run_type: 'company_research', entity_type: 'company', entity_id: company.id,
          entity_name: company.display_name, status: 'failed',
          result_summary: `Batch parse failed: ${parsed.warnings.join('; ')}`,
        });
        failed++;
      }
      return { success, failed };
    }

    // Apply all results at once
    const result = applyCompanyResearch(parsed.items);
    const perCompanyCost = cliResult.total_cost_usd / batch.length;
    const inputTokens = totalInputTokens(cliResult.usage);

    // Match results back to input companies by name (normalized for smart-quote drift)
    const resultNames = new Set(parsed.items.map(item => normalizeName(item.name)));

    for (const company of batch) {
      const matched = resultNames.has(normalizeName(company.display_name));
      if (matched) {
        const item = parsed.items.find(i => normalizeName(i.name) === normalizeName(company.display_name));
        const summary = `industry=${item?.industry || '?'}, size=${item?.size || '?'}`;
        log(`  ✓ "${company.display_name}" (${summary})`);
        logToDb({
          run_type: 'company_research', entity_type: 'company', entity_id: company.id,
          entity_name: company.display_name, status: 'success',
          input_tokens: Math.round(inputTokens / batch.length),
          output_tokens: Math.round(cliResult.usage.output_tokens / batch.length),
          cost_usd: perCompanyCost, duration_ms: Math.round(cliResult.duration_ms / batch.length),
          result_summary: summary,
        });
        success++;
      } else {
        log(`  ✗ "${company.display_name}" missing from batch response`);
        logToDb({
          run_type: 'company_research', entity_type: 'company', entity_id: company.id,
          entity_name: company.display_name, status: 'failed',
          cost_usd: perCompanyCost,
          result_summary: 'Missing from batch response',
        });
        failed++;
      }
    }

    log(`  Batch done: ${success}/${batch.length} [${formatTokens(inputTokens)}/${formatTokens(cliResult.usage.output_tokens)} tokens, $${cliResult.total_cost_usd.toFixed(3)}, ${(cliResult.duration_ms / 1000).toFixed(0)}s]`);

  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr?.trim() || '';
    const msg = stderr || (err instanceof Error ? err.message : String(err)).substring(0, 200);
    log(`  ⟳ Batch CLI error, retrying... (${msg})`);

    try {
      await sleep(CALL_DELAY * 2);
      const prompt = exportCompaniesForResearch(batch, 'markdown', companyPromptConfig());
      const maxTurns = 10 + batch.length * 5;
      const retryResult = await callClaude(prompt, { maxTurns });
      const jsonText = extractJson(retryResult.result);

      if (jsonText) {
        const parsed = parseCompanyResearch(jsonText);
        if (parsed.items.length > 0) {
          applyCompanyResearch(parsed.items);
          const resultNames = new Set(parsed.items.map(i => i.name.toLowerCase().trim()));
          for (const company of batch) {
            if (resultNames.has(company.display_name.toLowerCase().trim())) {
              log(`  ✓ "${company.display_name}" (CLI retry)`);
              logToDb({ run_type: 'company_research', entity_type: 'company', entity_id: company.id, entity_name: company.display_name, status: 'success', cost_usd: retryResult.total_cost_usd / batch.length, result_summary: 'Success (CLI retry)' });
              success++;
            } else {
              logToDb({ run_type: 'company_research', entity_type: 'company', entity_id: company.id, entity_name: company.display_name, status: 'failed', result_summary: 'Missing from retry response' });
              failed++;
            }
          }
          return { success, failed };
        }
      }

      // Retry also failed
      for (const company of batch) {
        logToDb({ run_type: 'company_research', entity_type: 'company', entity_id: company.id, entity_name: company.display_name, status: 'failed', result_summary: 'Batch retry failed' });
        failed++;
      }
    } catch {
      for (const company of batch) {
        logToDb({ run_type: 'company_research', entity_type: 'company', entity_id: company.id, entity_name: company.display_name, status: 'failed', result_summary: msg.substring(0, 500) });
        failed++;
      }
    }
  }

  return { success, failed };
}

// ── JD Cleanup (Haiku) ─────────────────────────────────────────────
const JD_CLEANUP_BATCH_SIZE = parseInt(process.env.AUTO_EVAL_JD_CLEANUP_BATCH || '15', 10);

function getJobsNeedingCleanup(limit: number): { id: number; title: string; jd_full_text: string }[] {
  return db.prepare(`
    SELECT j.id, j.title, j.jd_full_text FROM jobs j
    JOIN companies c ON j.company_id = c.id
    WHERE j.status = 'pending_eval'
    AND j.jd_full_text IS NOT NULL AND j.jd_full_text != ''
    AND j.jd_cleaned_text IS NULL
    AND c.application_strategy != 'no_h1b'
    AND (j.visa_sponsorship IS NULL OR j.visa_sponsorship != 'no')
    ORDER BY j.created_at ASC
    LIMIT ?
  `).all(limit) as { id: number; title: string; jd_full_text: string }[];
}

async function processJdCleanupBatch(batch: { id: number; title: string; jd_full_text: string }[]): Promise<{ success: number; failed: number }> {
  log(`  Cleaning JDs batch of ${batch.length}: ${batch.map(j => `#${j.id}`).join(', ')}`);
  let success = 0;
  let failed = 0;

  // Preprocess all JDs: HTML clean → split long lines → number lines
  const jobData = batch.map(job => {
    const plaintext = splitLongLines(cleanJdText(job.jd_full_text));
    return { id: job.id, title: job.title, plaintext, numberedText: numberLines(plaintext) };
  });

  try {
    const prompt = buildBatchJdCleanupPrompt(jobData.map(j => ({ id: j.id, numberedText: j.numberedText })));
    const result = await callClaude(prompt, { model: 'haiku', webSearch: false, maxTurns: 1 });

    // Extract JSON object from response (not array — cleanup returns {id: [...removals]})
    const responseText = result.result.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
    const objMatch = responseText.match(/\{[\s\S]*\}/);

    if (!objMatch) {
      log(`  ⚠ No JSON from Haiku, storing originals for all ${batch.length} jobs`);
      for (const job of jobData) {
        db.prepare('UPDATE jobs SET jd_cleaned_text = ? WHERE id = ?').run(job.plaintext, job.id);
        logToDb({ run_type: 'jd_cleanup', entity_type: 'job', entity_id: job.id, entity_name: job.title, status: 'success', result_summary: 'No JSON, used original' });
        success++;
      }
      return { success, failed };
    }

    // Parse removal map: { "jobId": [{"type": "eeo", "lines": [45, 52]}, ...] }
    let removeMap: Record<string, { type: string; lines: [number, number] }[]> = {};
    try {
      removeMap = JSON.parse(objMatch[0]);
    } catch {
      log(`  ⚠ Invalid JSON from Haiku, storing originals`);
      for (const job of jobData) {
        db.prepare('UPDATE jobs SET jd_cleaned_text = ? WHERE id = ?').run(job.plaintext, job.id);
        success++;
      }
      return { success, failed };
    }

    const perJobCost = result.total_cost_usd / batch.length;
    const inputTokens = totalInputTokens(result.usage);

    for (const job of jobData) {
      const removals = removeMap[String(job.id)];

      if (!removals || removals.length === 0) {
        // No boilerplate found — store as-is
        db.prepare('UPDATE jobs SET jd_cleaned_text = ? WHERE id = ?').run(job.plaintext, job.id);
        log(`    ✓ #${job.id} ${job.title.slice(0, 40)}: clean (no boilerplate)`);
        logToDb({ run_type: 'jd_cleanup', entity_type: 'job', entity_id: job.id, entity_name: job.title, status: 'success', cost_usd: perJobCost, result_summary: 'No boilerplate found' });
        success++;
        continue;
      }

      const cleaned = removeLineRanges(job.plaintext, removals);
      const pct = ((1 - cleaned.length / job.plaintext.length) * 100).toFixed(0);
      const tags = removals.map(r => `${r.type}:${r.lines[0]}-${r.lines[1]}`).join(', ');

      // Sanity check: cleaned should retain at least 30% of original
      if (cleaned.length >= job.plaintext.length * 0.3) {
        db.prepare('UPDATE jobs SET jd_cleaned_text = ? WHERE id = ?').run(cleaned, job.id);
        log(`    ✓ #${job.id} ${job.title.slice(0, 40)}: ${job.plaintext.length} → ${cleaned.length} (${pct}%) [${tags}]`);
        logToDb({
          run_type: 'jd_cleanup', entity_type: 'job', entity_id: job.id,
          entity_name: job.title, status: 'success',
          input_tokens: Math.round(inputTokens / batch.length),
          output_tokens: Math.round(result.usage.output_tokens / batch.length),
          cost_usd: perJobCost,
          result_summary: `${job.plaintext.length}→${cleaned.length} (${pct}%) [${tags}]`,
        });
        success++;
      } else {
        db.prepare('UPDATE jobs SET jd_cleaned_text = ? WHERE id = ?').run(job.plaintext, job.id);
        log(`    ⚠ #${job.id} over-stripped (${pct}%), using original [${tags}]`);
        logToDb({ run_type: 'jd_cleanup', entity_type: 'job', entity_id: job.id, entity_name: job.title, status: 'success', cost_usd: perJobCost, result_summary: `Over-stripped (${pct}%), used original` });
        success++;
      }
    }

    log(`  Batch done: ${success}/${batch.length} [${formatTokens(inputTokens)}/${formatTokens(result.usage.output_tokens)} tokens, $${result.total_cost_usd.toFixed(3)}, ${(result.duration_ms / 1000).toFixed(0)}s]`);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`  ✗ Batch cleanup failed: ${msg.substring(0, 200)}`);
    // Fallback: store HTML-cleaned originals so eval isn't blocked
    for (const job of jobData) {
      db.prepare('UPDATE jobs SET jd_cleaned_text = ? WHERE id = ?').run(job.plaintext, job.id);
      logToDb({ run_type: 'jd_cleanup', entity_type: 'job', entity_id: job.id, entity_name: job.title, status: 'failed', result_summary: msg.substring(0, 500) });
      failed++;
    }
  }

  return { success, failed };
}

// ── Job Evaluation ──────────────────────────────────────────────────
function getPendingJobs(limit: number): JobWithCompany[] {
  const rows = db.prepare(`
    SELECT j.*, j.jd_cleaned_text, c.name AS company_name, c.display_name AS company_display_name,
      c.industry AS company_industry, c.size AS company_size,
      c.description AS company_description, c.ai_summary AS company_ai_summary,
      c.application_strategy, c.strategy_reason,
      c.application_limit, c.limit_period_months, c.cooldown_months, c.funding_round,
      c.chinese_affinity
    FROM jobs j
    JOIN companies c ON j.company_id = c.id
    WHERE j.status = 'pending_eval'
    AND j.jd_full_text IS NOT NULL
    AND j.jd_full_text != ''
    AND j.jd_cleaned_text IS NOT NULL
    AND c.info_status = 'complete'
    AND c.application_strategy != 'no_h1b'
    AND (j.visa_sponsorship IS NULL OR j.visa_sponsorship != 'no')
    ORDER BY j.created_at ASC
    LIMIT ?
  `).all(limit) as unknown[];

  // Deserialize JSON fields
  return (rows as Record<string, unknown>[]).map((row) => ({
    ...row,
    location: typeof row.location === 'string' ? JSON.parse(row.location as string) : (row.location || []),
    score_tags: typeof row.score_tags === 'string' ? JSON.parse(row.score_tags as string) : (row.score_tags || null),
  })) as unknown as JobWithCompany[];
}

async function processJobBatch(batch: JobWithCompany[]): Promise<{ success: number; failed: number }> {
  const labels = batch.map(j => `#${j.id} ${j.title}`);
  log(`  Evaluating batch of ${batch.length}: ${labels.join(', ')}`);

  let success = 0;
  let failed = 0;

  try {
    const prompt = exportJobsForEvaluation(batch, 'markdown', evalPromptConfig());
    const cliResult = await callClaude(prompt, { webSearch: false });

    const jsonText = extractJson(cliResult.result);
    if (!jsonText) {
      log(`  ✗ Batch failed: no JSON in response`);
      for (const job of batch) {
        logToDb({ run_type: 'job_evaluation', entity_type: 'job', entity_id: job.id, entity_name: `${job.title} @ ${job.company_display_name}`, status: 'failed', cost_usd: cliResult.total_cost_usd / batch.length, result_summary: 'No JSON in batch response' });
        failed++;
      }
      return { success, failed };
    }

    const parsed = parseEvaluationResults(jsonText);
    if (parsed.items.length === 0) {
      log(`  ✗ Batch failed: parse error: ${parsed.warnings.join('; ')}`);
      for (const job of batch) {
        logToDb({ run_type: 'job_evaluation', entity_type: 'job', entity_id: job.id, entity_name: `${job.title} @ ${job.company_display_name}`, status: 'failed', result_summary: `Batch parse failed` });
        failed++;
      }
      return { success, failed };
    }

    const result = applyEvaluationResults(parsed.items);
    const perJobCost = cliResult.total_cost_usd / batch.length;
    const inputTokens = totalInputTokens(cliResult.usage);

    // Match results back to input jobs by id
    const resultIds = new Set(parsed.items.map(item => item.id));

    for (const job of batch) {
      const item = parsed.items.find(i => i.id === job.id);
      if (item) {
        const summary = `${item.score}/${item.score_success} ${item.recommendation}${item.score_tags?.length ? ` [${item.score_tags.join(',')}]` : ''}`;
        log(`  ✓ #${job.id} ${job.title} → ${summary}`);
        logToDb({
          run_type: 'job_evaluation', entity_type: 'job', entity_id: job.id,
          entity_name: `${job.title} @ ${job.company_display_name}`, status: 'success',
          input_tokens: Math.round(inputTokens / batch.length),
          output_tokens: Math.round(cliResult.usage.output_tokens / batch.length),
          cost_usd: perJobCost, duration_ms: Math.round(cliResult.duration_ms / batch.length),
          result_summary: summary,
        });
        success++;
      } else {
        log(`  ✗ #${job.id} ${job.title} missing from batch response`);
        logToDb({ run_type: 'job_evaluation', entity_type: 'job', entity_id: job.id, entity_name: `${job.title} @ ${job.company_display_name}`, status: 'failed', cost_usd: perJobCost, result_summary: 'Missing from batch response' });
        failed++;
      }
    }

    if (result.errors.length > 0) {
      log(`  Batch apply errors: ${result.errors.join('; ')}`);
    }

    log(`  Batch done: ${success}/${batch.length} [${formatTokens(inputTokens)}/${formatTokens(cliResult.usage.output_tokens)} tokens, $${cliResult.total_cost_usd.toFixed(3)}, ${(cliResult.duration_ms / 1000).toFixed(0)}s]`);

  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr?.trim() || '';
    const msg = stderr || (err instanceof Error ? err.message : String(err)).substring(0, 200);
    log(`  ⟳ Batch CLI error, retrying... (${msg})`);

    try {
      await sleep(CALL_DELAY * 2);
      const prompt = exportJobsForEvaluation(batch, 'markdown', evalPromptConfig());
      const retryResult = await callClaude(prompt, { webSearch: false });
      const jsonText = extractJson(retryResult.result);

      if (jsonText) {
        const parsed = parseEvaluationResults(jsonText);
        if (parsed.items.length > 0) {
          applyEvaluationResults(parsed.items);
          const resultIds = new Set(parsed.items.map(i => i.id));
          for (const job of batch) {
            if (resultIds.has(job.id)) {
              const item = parsed.items.find(i => i.id === job.id)!;
              log(`  ✓ #${job.id} ${job.title} → ${item.score}/${item.score_success} (CLI retry)`);
              logToDb({ run_type: 'job_evaluation', entity_type: 'job', entity_id: job.id, entity_name: `${job.title} @ ${job.company_display_name}`, status: 'success', cost_usd: retryResult.total_cost_usd / batch.length, result_summary: `${item.score}/${item.score_success} ${item.recommendation} (CLI retry)` });
              success++;
            } else {
              logToDb({ run_type: 'job_evaluation', entity_type: 'job', entity_id: job.id, entity_name: `${job.title} @ ${job.company_display_name}`, status: 'failed', result_summary: 'Missing from retry response' });
              failed++;
            }
          }
          return { success, failed };
        }
      }

      for (const job of batch) {
        logToDb({ run_type: 'job_evaluation', entity_type: 'job', entity_id: job.id, entity_name: `${job.title} @ ${job.company_display_name}`, status: 'failed', result_summary: 'Batch retry failed' });
        failed++;
      }
    } catch {
      for (const job of batch) {
        logToDb({ run_type: 'job_evaluation', entity_type: 'job', entity_id: job.id, entity_name: `${job.title} @ ${job.company_display_name}`, status: 'failed', result_summary: msg.substring(0, 500) });
        failed++;
      }
    }
  }

  return { success, failed };
}

// ── Borderline Recheck (Phase 4) ───────────────────────────────────
function getBorderlineJobs(limit: number): JobWithCompany[] {
  const rows = db.prepare(`
    SELECT j.*, j.jd_cleaned_text, c.name AS company_name, c.display_name AS company_display_name,
      c.industry AS company_industry, c.size AS company_size,
      c.description AS company_description, c.ai_summary AS company_ai_summary,
      c.application_strategy, c.strategy_reason,
      c.application_limit, c.limit_period_months, c.cooldown_months, c.funding_round,
      c.chinese_affinity
    FROM jobs j
    JOIN companies c ON j.company_id = c.id
    WHERE j.score_success >= 4 AND j.score_success <= 6
    AND j.status IN ('ready_to_apply')
    AND j.jd_full_text IS NOT NULL AND j.jd_full_text != ''
    AND j.id NOT IN (
      SELECT entity_id FROM auto_eval_log
      WHERE run_type = 'job_recheck' AND entity_id IS NOT NULL
    )
    ORDER BY j.created_at ASC
    LIMIT ?
  `).all(limit) as unknown[];

  return (rows as Record<string, unknown>[]).map((row) => ({
    ...row,
    location: typeof row.location === 'string' ? JSON.parse(row.location as string) : (row.location || []),
    score_tags: typeof row.score_tags === 'string' ? JSON.parse(row.score_tags as string) : (row.score_tags || null),
  })) as unknown as JobWithCompany[];
}

async function processRecheck(job: JobWithCompany): Promise<{ success: boolean; decision?: string }> {
  const originalScore = job.score_success ?? 5;
  log(`  Rechecking #${job.id} ${job.title} @ ${job.company_display_name} (original: ${originalScore})`);

  try {
    const prompt = buildRecheckPrompt(job, recheckPromptConfig());
    const cliResult = await callClaude(prompt, { webSearch: false });

    const parsed = parseRecheckResult(cliResult.result);
    if (!parsed) {
      log(`  ✗ #${job.id} recheck failed: no valid JSON in response`);
      logToDb({
        run_type: 'job_recheck', entity_type: 'job', entity_id: job.id,
        entity_name: `${job.title} @ ${job.company_display_name}`, status: 'failed',
        input_tokens: totalInputTokens(cliResult.usage),
        output_tokens: cliResult.usage.output_tokens,
        cost_usd: cliResult.total_cost_usd, duration_ms: cliResult.duration_ms,
        result_summary: 'No valid JSON in response',
      });
      return { success: false };
    }

    // System computes decision based on new score
    const decision = computeDecision(originalScore, parsed.score_success);

    const updates: Record<string, unknown> = {
      score_success: parsed.score_success,
      score_reason: `[Recheck] ${parsed.reason} (was ${originalScore}, ${job.score_reason || ''})`,
    };

    if (decision === 'upgrade') {
      updates.status = 'pending_deep_analysis';
    } else if (decision === 'downgrade') {
      updates.status = 'archived_low_match';
    }

    db.prepare(`
      UPDATE jobs SET
        score_success = ?,
        score_reason = ?,
        ${decision !== 'keep' ? 'status = ?,' : ''}
        updated_at = datetime('now')
      WHERE id = ?
    `.replace(/,\s*WHERE/, ' WHERE')).run(
      ...[
        updates.score_success,
        updates.score_reason,
        ...(decision !== 'keep' ? [updates.status] : []),
        job.id,
      ]
    );

    const inputTokens = totalInputTokens(cliResult.usage);
    const symbol = decision === 'upgrade' ? '↑' : decision === 'downgrade' ? '↓' : '→';
    const summary = `${originalScore}→${parsed.score_success} ${symbol}${decision} | ${parsed.daily_work_summary}`;
    log(`  ${symbol} #${job.id} ${job.title}: ${summary}`);

    logToDb({
      run_type: 'job_recheck', entity_type: 'job', entity_id: job.id,
      entity_name: `${job.title} @ ${job.company_display_name}`, status: 'success',
      input_tokens: inputTokens,
      output_tokens: cliResult.usage.output_tokens,
      cost_usd: cliResult.total_cost_usd, duration_ms: cliResult.duration_ms,
      result_summary: summary,
    });

    return { success: true, decision };

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`  ✗ #${job.id} recheck error: ${msg.substring(0, 200)}`);
    logToDb({
      run_type: 'job_recheck', entity_type: 'job', entity_id: job.id,
      entity_name: `${job.title} @ ${job.company_display_name}`, status: 'failed',
      result_summary: msg.substring(0, 500),
    });
    return { success: false };
  }
}

// ── QA Review (Phase 5) ─────────────────────────────────────────────
// A dedicated Opus pass that spot-checks the current cycle's outputs.
// Sampling strategy (per user):
//   • Eval: all borderline cases (score_success 4-7) + QA_SAMPLE_RATE random over the rest
//   • Company research: QA_SAMPLE_RATE random (no "borderline" concept)
// Disagreement action: write qa_review_* to auto_eval_log and flip qa_flagged=1
// on the job/company row with a short qa_notes. We NEVER overwrite the
// original score — the user triages flagged rows in the UI manually.

function sampleBorderlinePlusRandom<T>(
  items: T[],
  isBorderline: (item: T) => boolean,
  sampleRate: number,
): T[] {
  const out: T[] = [];
  for (const item of items) {
    if (isBorderline(item) || Math.random() < sampleRate) out.push(item);
  }
  return out;
}

function getRecentlyEvaluatedJobs(sinceIso: string): JobWithCompany[] {
  const rows = db.prepare(`
    SELECT j.*, j.jd_cleaned_text, c.name AS company_name, c.display_name AS company_display_name,
      c.industry AS company_industry, c.size AS company_size,
      c.description AS company_description, c.ai_summary AS company_ai_summary,
      c.application_strategy, c.strategy_reason,
      c.application_limit, c.limit_period_months, c.cooldown_months, c.funding_round,
      c.chinese_affinity
    FROM jobs j
    JOIN companies c ON j.company_id = c.id
    WHERE j.id IN (
      SELECT DISTINCT entity_id FROM auto_eval_log
      WHERE run_type = 'job_evaluation'
        AND status = 'success'
        AND created_at >= ?
        AND entity_id IS NOT NULL
    )
    AND (j.qa_flagged IS NULL OR j.qa_flagged = 0)
    AND j.id NOT IN (
      SELECT entity_id FROM auto_eval_log
      WHERE run_type = 'qa_review_eval' AND entity_id IS NOT NULL
    )
    ORDER BY j.id ASC
  `).all(sinceIso) as unknown[];
  return (rows as Record<string, unknown>[]).map((row) => ({
    ...row,
    location: typeof row.location === 'string' ? JSON.parse(row.location as string) : (row.location || []),
    score_tags: typeof row.score_tags === 'string' ? JSON.parse(row.score_tags as string) : (row.score_tags || null),
  })) as unknown as JobWithCompany[];
}

function getRecentlyResearchedCompanies(sinceIso: string): Company[] {
  return db.prepare(`
    SELECT c.* FROM companies c
    WHERE c.id IN (
      SELECT DISTINCT entity_id FROM auto_eval_log
      WHERE run_type = 'company_research'
        AND status = 'success'
        AND created_at >= ?
        AND entity_id IS NOT NULL
    )
    AND (c.qa_flagged IS NULL OR c.qa_flagged = 0)
    AND c.id NOT IN (
      SELECT entity_id FROM auto_eval_log
      WHERE run_type = 'qa_review_company' AND entity_id IS NOT NULL
    )
    ORDER BY c.id ASC
  `).all(sinceIso) as Company[];
}

async function processQAEvalBatch(batch: JobWithCompany[]): Promise<{ success: number; failed: number }> {
  const labels = batch.map(j => `#${j.id}`);
  log(`  QA eval batch of ${batch.length}: ${labels.join(', ')}`);
  let success = 0;
  let failed = 0;

  try {
    // Reuse the same prompt as Phase 3 — Claude gets the JD + company info
    // with no knowledge of the previous score, giving us an independent scoring.
    const prompt = exportJobsForEvaluation(batch, 'markdown', evalPromptConfig());
    const cliResult = await callClaude(prompt, { webSearch: false, model: QA_MODEL });

    const jsonText = extractJson(cliResult.result);
    if (!jsonText) {
      for (const job of batch) {
        logToDb({
          run_type: 'qa_review_eval', entity_type: 'job', entity_id: job.id,
          entity_name: `${job.title} @ ${job.company_display_name}`, status: 'failed',
          cost_usd: cliResult.total_cost_usd / batch.length,
          result_summary: 'No JSON in QA response',
        });
        failed++;
      }
      return { success, failed };
    }

    const parsed = parseEvaluationResults(jsonText);
    if (parsed.items.length === 0) {
      for (const job of batch) {
        logToDb({
          run_type: 'qa_review_eval', entity_type: 'job', entity_id: job.id,
          entity_name: `${job.title} @ ${job.company_display_name}`, status: 'failed',
          result_summary: `QA parse failed: ${parsed.warnings.join('; ')}`,
        });
        failed++;
      }
      return { success, failed };
    }

    const perJobCost = cliResult.total_cost_usd / batch.length;
    const inputTokens = totalInputTokens(cliResult.usage);

    for (const job of batch) {
      const qaItem = parsed.items.find(i => i.id === job.id);
      if (!qaItem) {
        log(`  ✗ #${job.id} missing from QA response`);
        logToDb({
          run_type: 'qa_review_eval', entity_type: 'job', entity_id: job.id,
          entity_name: `${job.title} @ ${job.company_display_name}`, status: 'failed',
          cost_usd: perJobCost,
          result_summary: 'Missing from QA batch response',
        });
        failed++;
        continue;
      }

      const stored = db.prepare('SELECT score_success, score FROM jobs WHERE id = ?').get(job.id) as
        { score_success: number | null; score: number | null } | undefined;
      const storedSuccess = stored?.score_success ?? 5;
      const qaSuccess = qaItem.score_success ?? 5;
      const diffSuccess = Math.abs(qaSuccess - storedSuccess);
      const agree = diffSuccess <= 1; // tolerance ±1

      if (!agree) {
        db.prepare(`UPDATE jobs SET qa_flagged = 1, qa_notes = ? WHERE id = ?`).run(
          `QA ${qaSuccess} vs DB ${storedSuccess} (diff ${diffSuccess}): ${(qaItem.score_reason || '').slice(0, 300)}`,
          job.id,
        );
      }

      const summary = JSON.stringify({
        agree,
        qa_success: qaSuccess,
        db_success: storedSuccess,
        diff: diffSuccess,
        qa_reason: (qaItem.score_reason || '').slice(0, 200),
      });
      log(`  ${agree ? '✓' : '⚠'} #${job.id}: QA ${qaSuccess} vs DB ${storedSuccess}${agree ? '' : ' → FLAG'}`);
      logToDb({
        run_type: 'qa_review_eval', entity_type: 'job', entity_id: job.id,
        entity_name: `${job.title} @ ${job.company_display_name}`, status: 'success',
        input_tokens: Math.round(inputTokens / batch.length),
        output_tokens: Math.round(cliResult.usage.output_tokens / batch.length),
        cost_usd: perJobCost, duration_ms: Math.round(cliResult.duration_ms / batch.length),
        result_summary: summary,
      });
      success++;
    }

    log(`  QA eval batch done: ${success}/${batch.length} [${formatTokens(inputTokens)}/${formatTokens(cliResult.usage.output_tokens)} tokens, $${cliResult.total_cost_usd.toFixed(3)}, ${(cliResult.duration_ms / 1000).toFixed(0)}s]`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`  ✗ QA eval batch error: ${msg.substring(0, 200)}`);
    for (const job of batch) {
      logToDb({
        run_type: 'qa_review_eval', entity_type: 'job', entity_id: job.id,
        entity_name: `${job.title} @ ${job.company_display_name}`, status: 'failed',
        result_summary: msg.substring(0, 500),
      });
      failed++;
    }
  }

  return { success, failed };
}

async function processQACompanyBatch(batch: Company[]): Promise<{ success: number; failed: number }> {
  const names = batch.map(c => c.display_name);
  log(`  QA company batch of ${batch.length}: ${names.join(', ')}`);
  let success = 0;
  let failed = 0;

  try {
    const prompt = exportCompaniesForResearch(batch, 'markdown', companyPromptConfig());
    const maxTurns = 10 + batch.length * 5;
    const cliResult = await callClaude(prompt, { maxTurns, model: QA_MODEL });

    const jsonText = extractJson(cliResult.result);
    if (!jsonText) {
      for (const c of batch) {
        logToDb({
          run_type: 'qa_review_company', entity_type: 'company', entity_id: c.id,
          entity_name: c.display_name, status: 'failed',
          cost_usd: cliResult.total_cost_usd / batch.length,
          result_summary: 'No JSON in QA response',
        });
        failed++;
      }
      return { success, failed };
    }

    const parsed = parseCompanyResearch(jsonText);
    if (parsed.items.length === 0) {
      for (const c of batch) {
        logToDb({
          run_type: 'qa_review_company', entity_type: 'company', entity_id: c.id,
          entity_name: c.display_name, status: 'failed',
          result_summary: `QA parse failed: ${parsed.warnings.join('; ')}`,
        });
        failed++;
      }
      return { success, failed };
    }

    const perCost = cliResult.total_cost_usd / batch.length;
    const norm = (s: string | null | undefined) => (s || '').toLowerCase().trim();

    for (const c of batch) {
      const qa = parsed.items.find(i => normalizeName(i.name) === normalizeName(c.display_name));
      if (!qa) {
        logToDb({
          run_type: 'qa_review_company', entity_type: 'company', entity_id: c.id,
          entity_name: c.display_name, status: 'failed',
          cost_usd: perCost,
          result_summary: 'Missing from QA batch response',
        });
        failed++;
        continue;
      }

      const stored = db.prepare('SELECT industry, size FROM companies WHERE id = ?').get(c.id) as
        { industry: string | null; size: string | null } | undefined;
      const qaIndustry = norm(qa.industry);
      const dbIndustry = norm(stored?.industry);
      const industryAgrees = !qaIndustry || !dbIndustry || qaIndustry === dbIndustry ||
        qaIndustry.includes(dbIndustry) || dbIndustry.includes(qaIndustry);
      const qaSize = norm(qa.size);
      const dbSize = norm(stored?.size);
      const sizeAgrees = !qaSize || !dbSize || qaSize === dbSize;
      const agree = industryAgrees && sizeAgrees;

      if (!agree) {
        db.prepare(`UPDATE companies SET qa_flagged = 1, qa_notes = ? WHERE id = ?`).run(
          `QA industry="${qa.industry || ''}" size="${qa.size || ''}" vs DB industry="${stored?.industry || ''}" size="${stored?.size || ''}"`,
          c.id,
        );
      }

      const summary = JSON.stringify({
        agree,
        qa_industry: qa.industry,
        db_industry: stored?.industry,
        qa_size: qa.size,
        db_size: stored?.size,
      });
      log(`  ${agree ? '✓' : '⚠'} ${c.display_name}${agree ? '' : ' → FLAG'}`);
      logToDb({
        run_type: 'qa_review_company', entity_type: 'company', entity_id: c.id,
        entity_name: c.display_name, status: 'success',
        cost_usd: perCost,
        result_summary: summary,
      });
      success++;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`  ✗ QA company batch error: ${msg.substring(0, 200)}`);
    for (const c of batch) {
      logToDb({
        run_type: 'qa_review_company', entity_type: 'company', entity_id: c.id,
        entity_name: c.display_name, status: 'failed',
        result_summary: msg.substring(0, 500),
      });
      failed++;
    }
  }

  return { success, failed };
}

async function processQAPhase(cycleStartIso: string): Promise<{
  evalTotal: number; evalFlagged: number;
  companyTotal: number; companyFlagged: number;
}> {
  // Eval QA ------------------------------------------------------------
  const recentEvalJobs = getRecentlyEvaluatedJobs(cycleStartIso);
  const evalSample = sampleBorderlinePlusRandom(
    recentEvalJobs,
    (j) => {
      const s = (j as unknown as { score_success?: number }).score_success;
      return typeof s === 'number' && s >= 4 && s <= 7;
    },
    QA_SAMPLE_RATE,
  );

  if (evalSample.length > 0) {
    log(`QA eval: ${evalSample.length}/${recentEvalJobs.length} sampled (borderline + ${(QA_SAMPLE_RATE * 100).toFixed(0)}% random, batch ${QA_BATCH}, concurrency ${QA_CONCURRENCY})`);
    const batches = chunk(evalSample, QA_BATCH);
    await runWithConcurrency(batches, QA_CONCURRENCY, processQAEvalBatch, CALL_DELAY);
  }

  // Company QA ---------------------------------------------------------
  const recentCompanies = getRecentlyResearchedCompanies(cycleStartIso);
  const companySample = recentCompanies.filter(() => Math.random() < QA_SAMPLE_RATE);

  if (companySample.length > 0) {
    log(`QA company: ${companySample.length}/${recentCompanies.length} sampled (${(QA_SAMPLE_RATE * 100).toFixed(0)}% random, batch ${QA_BATCH}, concurrency ${QA_CONCURRENCY})`);
    const batches = chunk(companySample, QA_BATCH);
    await runWithConcurrency(batches, QA_CONCURRENCY, processQACompanyBatch, CALL_DELAY);
  }

  // Count newly-flagged rows from this sample window
  const evalFlagged = evalSample.length > 0
    ? (db.prepare(`SELECT COUNT(*) as n FROM jobs WHERE qa_flagged = 1 AND id IN (${evalSample.map(j => j.id).join(',')})`).get() as { n: number }).n
    : 0;
  const companyFlagged = companySample.length > 0
    ? (db.prepare(`SELECT COUNT(*) as n FROM companies WHERE qa_flagged = 1 AND id IN (${companySample.map(c => c.id).join(',')})`).get() as { n: number }).n
    : 0;

  return {
    evalTotal: evalSample.length,
    evalFlagged,
    companyTotal: companySample.length,
    companyFlagged,
  };
}

// ── Main Loop ───────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Tiny hand-rolled concurrency limiter. Dispatches `worker` across `items`
 * with at most `concurrency` running in parallel. Each worker result is
 * returned as a PromiseSettledResult, so one failing item can't sink the phase.
 *
 * `staggerMs` offsets each runner's cold start to avoid thundering-herd on
 * the Anthropic API. After each item completes the runner waits `CALL_DELAY`
 * before pulling the next, matching the existing per-batch pacing.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, idx: number) => Promise<R>,
  staggerMs = 0,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  if (items.length === 0) return results;
  const lanes = Math.max(1, Math.min(concurrency, items.length));
  let next = 0;
  const runners = Array.from({ length: lanes }, async (_, slot) => {
    if (staggerMs > 0 && slot > 0) await sleep(slot * staggerMs);
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        const value = await worker(items[i], i);
        results[i] = { status: 'fulfilled', value };
      } catch (e) {
        results[i] = { status: 'rejected', reason: e };
      }
      if (CALL_DELAY > 0 && next < items.length) await sleep(CALL_DELAY);
    }
  });
  await Promise.all(runners);
  return results;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function sumPhaseResults(
  settled: PromiseSettledResult<{ success: number; failed: number }>[],
): { success: number; failed: number } {
  let success = 0;
  let failed = 0;
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      success += r.value.success;
      failed += r.value.failed;
    } else {
      // A batch threw past its internal try/catch. Log and keep going.
      log(`  ✗ Batch crashed: ${String((r as PromiseRejectedResult).reason).substring(0, 200)}`);
    }
  }
  return { success, failed };
}

async function runCycle(): Promise<{
  companies: { total: number; success: number };
  jobs: { total: number; success: number };
  recheck: { total: number; success: number; upgraded: number; downgraded: number };
  qa: { evalTotal: number; evalFlagged: number; companyTotal: number; companyFlagged: number };
  totalCost: number;
  totalDuration: number;
}> {
  let totalCost = 0;
  let totalDuration = 0;

  // Use SQLite's clock (same format as auto_eval_log.created_at) so the QA
  // phase can filter by "rows written during or after this cycle started".
  const cycleStartIso = (db.prepare(`SELECT datetime('now') as now`).get() as { now: string }).now;

  // Check if UI changed mode (e.g. auto → manual)
  const modeRow = db.prepare(`SELECT value FROM settings WHERE key = 'auto_eval_mode'`).get() as { value: string } | undefined;
  if (modeRow && modeRow.value !== MODE) {
    log(`Mode changed via UI: ${MODE} → ${modeRow.value}`);
    MODE = modeRow.value as 'manual' | 'auto';
  }

  // Read phase toggles from DB each cycle (UI can change them at runtime)
  const ENABLE_COMPANY = isPhaseEnabled('auto_eval_company', 'AUTO_EVAL_COMPANY');
  const ENABLE_JD_CLEANUP = isPhaseEnabled('auto_eval_jd_cleanup', 'AUTO_EVAL_JD_CLEANUP');
  const ENABLE_JOB_EVAL = isPhaseEnabled('auto_eval_job_eval', 'AUTO_EVAL_JOB_EVAL');
  const ENABLE_RECHECK = isPhaseEnabled('auto_eval_recheck', 'AUTO_EVAL_RECHECK');

  // Phase 1: Company research
  const companies = ENABLE_COMPANY ? getPendingCompanies() : [];
  let companySuccess = 0;
  if (companies.length > 0) {
    log(`Company research: ${companies.length} pending (batch ${COMPANY_BATCH_SIZE}, concurrency ${COMPANY_CONCURRENCY})`);
    const batches = chunk(companies, COMPANY_BATCH_SIZE);
    const settled = await runWithConcurrency(batches, COMPANY_CONCURRENCY, processCompanyBatch, CALL_DELAY);
    companySuccess = sumPhaseResults(settled).success;
  }

  // Phase 2: JD cleanup (Haiku — strip boilerplate, cache in jd_cleaned_text)
  // Pull a big chunk so all lanes stay busy without extra poll cycles.
  const jdFetchLimit = Math.max(300, JD_CLEANUP_BATCH_SIZE * JD_CONCURRENCY * 10);
  const jobsNeedingCleanup = ENABLE_JD_CLEANUP ? getJobsNeedingCleanup(jdFetchLimit) : [];
  let jdCleanupSuccess = 0;
  if (jobsNeedingCleanup.length > 0) {
    log(`JD cleanup: ${jobsNeedingCleanup.length} jobs (batch ${JD_CLEANUP_BATCH_SIZE}, concurrency ${JD_CONCURRENCY})`);
    const batches = chunk(jobsNeedingCleanup, JD_CLEANUP_BATCH_SIZE);
    const settled = await runWithConcurrency(batches, JD_CONCURRENCY, processJdCleanupBatch, CALL_DELAY);
    jdCleanupSuccess = sumPhaseResults(settled).success;
  }

  // Phase 3: Job evaluation (no WebSearch, batched, requires jd_cleaned_text)
  const evalFetchLimit = Math.max(300, JOB_BATCH_SIZE * EVAL_CONCURRENCY * 10);
  const jobs = ENABLE_JOB_EVAL ? getPendingJobs(evalFetchLimit) : [];
  let jobSuccess = 0;
  if (jobs.length > 0) {
    log(`Job evaluation: ${jobs.length} pending (batch ${JOB_BATCH_SIZE}, concurrency ${EVAL_CONCURRENCY})`);
    const batches = chunk(jobs, JOB_BATCH_SIZE);
    const settled = await runWithConcurrency(batches, EVAL_CONCURRENCY, processJobBatch, CALL_DELAY);
    jobSuccess = sumPhaseResults(settled).success;
  }

  // Phase 4: Borderline recheck (single-job deep analysis for score_success 4-6)
  const borderlineJobs = ENABLE_RECHECK ? getBorderlineJobs(20) : [];
  let recheckSuccess = 0;
  let recheckUpgrade = 0;
  let recheckDowngrade = 0;
  if (borderlineJobs.length > 0) {
    log(`Borderline recheck: ${borderlineJobs.length} jobs with score_success 4-6`);
    for (const job of borderlineJobs) {
      const result = await processRecheck(job);
      if (result.success) {
        recheckSuccess++;
        if (result.decision === 'upgrade') recheckUpgrade++;
        if (result.decision === 'downgrade') recheckDowngrade++;
      }
      await sleep(CALL_DELAY);
    }
    log(`Recheck done: ${recheckSuccess}/${borderlineJobs.length} (↑${recheckUpgrade} ↓${recheckDowngrade})`);
  }

  // Phase 5: QA review (Opus spot-check on this cycle's eval + company outputs)
  const qaResult = QA_ENABLED
    ? await processQAPhase(cycleStartIso)
    : { evalTotal: 0, evalFlagged: 0, companyTotal: 0, companyFlagged: 0 };
  if (qaResult.evalTotal > 0 || qaResult.companyTotal > 0) {
    log(`QA done: eval ${qaResult.evalFlagged}/${qaResult.evalTotal} flagged, company ${qaResult.companyFlagged}/${qaResult.companyTotal} flagged`);
  }

  // Get cycle totals from DB
  const cycleStats = db.prepare(`
    SELECT SUM(cost_usd) as cost, SUM(duration_ms) as duration
    FROM auto_eval_log
    WHERE created_at >= datetime('now', '-10 minutes')
  `).get() as { cost: number | null; duration: number | null } | undefined;

  totalCost = cycleStats?.cost ?? 0;
  totalDuration = cycleStats?.duration ?? 0;

  return {
    companies: { total: companies.length, success: companySuccess },
    jobs: { total: jobs.length, success: jobSuccess },
    recheck: { total: borderlineJobs.length, success: recheckSuccess, upgraded: recheckUpgrade, downgraded: recheckDowngrade },
    qa: qaResult,
    totalCost,
    totalDuration,
  };
}

// PID file — shared with the API route so orphaned workers can be detected
const PID_FILE = join(tmpdir(), 'firstin-auto-eval.pid');

function writePidFile(): void {
  writeFileSync(PID_FILE, `${process.pid}\n${MODE}\n${new Date().toISOString()}\n`);
}

function removePidFile(): void {
  try { unlinkSync(PID_FILE); } catch {}
}

async function main(): Promise<void> {
  log(`Starting auto-evaluate worker (mode=${MODE}, pid=${process.pid})...`);
  writePidFile();

  const enableCompany = isPhaseEnabled('auto_eval_company', 'AUTO_EVAL_COMPANY');
  const enableJdCleanup = isPhaseEnabled('auto_eval_jd_cleanup', 'AUTO_EVAL_JD_CLEANUP');
  const enableJobEval = isPhaseEnabled('auto_eval_job_eval', 'AUTO_EVAL_JOB_EVAL');
  const enableRecheck = isPhaseEnabled('auto_eval_recheck', 'AUTO_EVAL_RECHECK');
  const phases = [enableCompany && 'company', enableJdCleanup && 'jd_cleanup', enableJobEval && 'job_eval', enableRecheck && 'recheck'].filter(Boolean).join('+');
  const concurrencySummary = `concurrency=company:${COMPANY_CONCURRENCY}/jd:${JD_CONCURRENCY}/eval:${EVAL_CONCURRENCY}${QA_ENABLED ? `/qa:${QA_CONCURRENCY}` : ''}`;
  log(`DB: user-${USER_ID}.db | Model: ${MODEL} | Mode: ${MODE} | Poll: ${POLL_INTERVAL / 1000}s | Phases: ${phases || 'none'}${QA_ENABLED ? '+qa' : ''} | ${concurrencySummary} | Batch: company=${COMPANY_BATCH_SIZE} jd=${JD_CLEANUP_BATCH_SIZE} job=${JOB_BATCH_SIZE}${QA_ENABLED ? ` qa=${QA_BATCH}` : ''}`);

  runWithUser(USER_ID, () => {
    logToDb({ run_type: 'worker_start', status: 'success', result_summary: `mode=${MODE}, model=${MODEL}, user=${USER_ID}` });
  });

  // Handle graceful shutdown
  let running = true;
  const shutdown = () => {
    log('Shutting down...');
    removePidFile();
    runWithUser(USER_ID, () => {
      logToDb({ run_type: 'worker_stop', status: 'success' });
    });
    running = false;
    closeDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  let consecutiveEmpty = 0;

  while (running) {
    try {
      const result = await runWithUserAsync(USER_ID, () => runCycle());

      const hasWork = result.companies.total > 0 || result.jobs.total > 0 || result.recheck.total > 0;
      if (hasWork) {
        consecutiveEmpty = 0;
        const recheckSummary = result.recheck.total > 0 ? `, recheck=${result.recheck.success}/${result.recheck.total} (↑${result.recheck.upgraded} ↓${result.recheck.downgraded})` : '';
        const qaSummary = (result.qa.evalTotal > 0 || result.qa.companyTotal > 0)
          ? `, qa_eval=${result.qa.evalFlagged}/${result.qa.evalTotal} flagged, qa_company=${result.qa.companyFlagged}/${result.qa.companyTotal} flagged`
          : '';
        log(`Cycle complete. ${result.companies.success}/${result.companies.total} companies, ${result.jobs.success}/${result.jobs.total} jobs${recheckSummary}${qaSummary}. Sleeping ${POLL_INTERVAL / 1000}s...`);
        runWithUser(USER_ID, () => {
          logToDb({
            run_type: 'cycle_end', status: 'success',
            result_summary: `companies=${result.companies.success}/${result.companies.total}, jobs=${result.jobs.success}/${result.jobs.total}${recheckSummary}${qaSummary}`,
          });
        });
      } else {
        consecutiveEmpty++;
      }

      // Manual mode: exit after 2 consecutive empty cycles (ensures newly-unblocked jobs get picked up)
      if (MODE === 'manual' && consecutiveEmpty >= 2) {
        log('No more pending work. Exiting (manual mode).');
        runWithUser(USER_ID, () => {
          logToDb({ run_type: 'worker_stop', status: 'success', result_summary: 'manual mode: no pending work' });
        });
        closeDb();
        process.exit(0);
      }

      await sleep(hasWork ? POLL_INTERVAL : POLL_INTERVAL * 2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Cycle error: ${msg}`);
      runWithUser(USER_ID, () => {
        logToDb({ run_type: 'error', status: 'failed', result_summary: msg.substring(0, 500) });
      });
      await sleep(POLL_INTERVAL * 2);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  runWithUser(USER_ID, () => {
    logToDb({ run_type: 'error', status: 'failed', result_summary: String(err).substring(0, 500) });
  });
  closeDb();
  process.exit(1);
});
