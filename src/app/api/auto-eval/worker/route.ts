import { spawn, ChildProcess } from 'child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import { withAuth } from '@/lib/route-handler';
import { jsonResponse, errorResponse } from '@/lib/api-utils';
import { getDb } from '@/lib/db';
import { getSetting, upsertSetting } from '@/lib/repositories/settings-repository';

// PID file path — survives server restarts so we can detect orphaned workers
const PID_FILE = join(tmpdir(), 'firstin-auto-eval.pid');

// Module-level singleton to track the worker process
let workerProcess: ChildProcess | null = null;
let workerMode: 'manual' | 'auto' | null = null;
let workerStartedAt: string | null = null;

function writePidFile(pid: number, mode: string, startedAt: string): void {
  writeFileSync(PID_FILE, `${pid}\n${mode}\n${startedAt}\n`);
}

function removePidFile(): void {
  try { unlinkSync(PID_FILE); } catch {}
}

function readPidFile(): { pid: number; mode: 'manual' | 'auto'; startedAt: string } | null {
  try {
    const content = readFileSync(PID_FILE, 'utf-8').trim();
    const [pidStr, mode, startedAt] = content.split('\n');
    const pid = parseInt(pidStr, 10);
    if (!pid || !mode || !startedAt) return null;
    return { pid, mode: mode as 'manual' | 'auto', startedAt };
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isWorkerRunning(): boolean {
  // Check in-memory reference first
  if (workerProcess && workerProcess.exitCode === null && !workerProcess.killed) {
    return true;
  }
  workerProcess = null;

  // Check PID file for orphaned workers (e.g. after server restart)
  const pidInfo = readPidFile();
  if (pidInfo && isProcessAlive(pidInfo.pid)) {
    workerMode = pidInfo.mode;
    workerStartedAt = pidInfo.startedAt;
    return true;
  }

  // No worker running — clean up stale state
  removePidFile();
  workerMode = null;
  workerStartedAt = null;
  return false;
}

function getPendingCounts(): { companies: number; jdCleanup: number; jobs: number; recheck: number } {
  const db = getDb();

  const tableExists = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='auto_eval_log'`
  ).get();

  const companies = (db.prepare(`
    SELECT COUNT(DISTINCT c.id) as cnt FROM companies c
    JOIN jobs j ON j.company_id = c.id
    WHERE c.info_status = 'pending' AND j.status = 'pending_eval'
    ${tableExists ? `AND c.id NOT IN (
      SELECT entity_id FROM auto_eval_log
      WHERE run_type = 'company_research' AND status = 'failed' AND entity_id IS NOT NULL
      GROUP BY entity_id HAVING COUNT(*) >= 3
    )` : ''}
  `).get() as { cnt: number }).cnt;

  const jdCleanup = (db.prepare(`
    SELECT COUNT(*) as cnt FROM jobs j
    JOIN companies c ON j.company_id = c.id
    WHERE j.status = 'pending_eval'
    AND j.jd_full_text IS NOT NULL AND j.jd_full_text != ''
    AND j.jd_cleaned_text IS NULL
    AND c.application_strategy != 'no_h1b'
    AND (j.visa_sponsorship IS NULL OR j.visa_sponsorship != 'no')
  `).get() as { cnt: number }).cnt;

  const jobs = (db.prepare(`
    SELECT COUNT(*) as cnt FROM jobs j
    JOIN companies c ON j.company_id = c.id
    WHERE j.status = 'pending_eval'
    AND j.jd_full_text IS NOT NULL AND j.jd_full_text != ''
    AND j.jd_cleaned_text IS NOT NULL
    AND c.info_status = 'complete'
    AND c.application_strategy != 'no_h1b'
    AND (j.visa_sponsorship IS NULL OR j.visa_sponsorship != 'no')
  `).get() as { cnt: number }).cnt;

  // Borderline jobs needing recheck (score_success 4-6, not yet rechecked)
  const recheck = (db.prepare(`
    SELECT COUNT(*) as cnt FROM jobs j
    WHERE j.score_success >= 4 AND j.score_success <= 6
    AND j.status IN ('ready_to_apply')
    AND j.jd_full_text IS NOT NULL AND j.jd_full_text != ''
    ${tableExists ? `AND j.id NOT IN (
      SELECT entity_id FROM auto_eval_log
      WHERE run_type = 'job_recheck' AND entity_id IS NOT NULL
    )` : ''}
  `).get() as { cnt: number }).cnt;

  return { companies, jdCleanup, jobs, recheck };
}

// GET: worker status + pending counts
export const GET = withAuth(async () => {
  const running = isWorkerRunning();
  const pending = getPendingCounts();
  const pidInfo = readPidFile();
  const ultraMode = getSetting('auto_eval_ultra', 'false') === 'true';

  return jsonResponse({
    status: running ? 'running' : 'idle',
    mode: workerMode,
    pid: workerProcess?.pid ?? pidInfo?.pid ?? null,
    startedAt: workerStartedAt,
    pending,
    ultraMode,
  });
});

// POST: start worker { mode: 'manual' | 'auto' }
export const POST = withAuth(async (req) => {
  if (isWorkerRunning()) {
    const pid = workerProcess?.pid ?? readPidFile()?.pid;
    return errorResponse(`Worker already running (pid=${pid}, mode=${workerMode})`, 409);
  }

  const body = await req.json().catch(() => ({}));
  const mode: 'manual' | 'auto' = body.mode === 'auto' ? 'auto' : 'manual';

  // Ultra mode: parallelize all phases + enable Opus QA layer.
  // If body.ultra is explicitly provided, persist it; otherwise fall back to stored setting.
  let ultra: boolean;
  if (typeof body.ultra === 'boolean') {
    ultra = body.ultra;
    upsertSetting('auto_eval_ultra', ultra ? 'true' : 'false', 'Ultra mode: parallel + QA');
  } else {
    ultra = getSetting('auto_eval_ultra', 'false') === 'true';
  }

  const scriptPath = resolve(process.cwd(), 'scripts/auto-evaluate.ts');
  if (!existsSync(scriptPath)) {
    return errorResponse('auto-evaluate.ts script not found', 500);
  }

  // Sync mode to DB so the worker script picks it up
  const db = getDb();
  db.prepare(`INSERT INTO settings (key, value, description, created_at, updated_at)
    VALUES ('auto_eval_mode', ?, 'Worker mode set by UI', datetime('now'), datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(mode);

  const child = spawn('npx', ['tsx', scriptPath, `--mode=${mode}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AUTO_EVAL_USER_ID: '1', // TODO: get from auth context
      ...(ultra ? {
        COMPANY_CONCURRENCY: '3',
        JD_CONCURRENCY: '3',
        EVAL_CONCURRENCY: '3',
        QA_ENABLED: 'true',
        QA_CONCURRENCY: '3',
        QA_SAMPLE_RATE: '0.2',
      } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false, // keep attached so it dies with the server
  });

  workerProcess = child;
  workerMode = mode;
  workerStartedAt = new Date().toISOString();

  // Write PID file so orphaned workers can be detected after server restart
  if (child.pid) {
    writePidFile(child.pid, mode, workerStartedAt);
  }

  // Log stdout/stderr (optional: could stream to a log file)
  child.stdout?.on('data', (data: Buffer) => {
    process.stdout.write(`[auto-eval] ${data.toString()}`);
  });
  child.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(`[auto-eval:err] ${data.toString()}`);
  });

  child.on('exit', (code) => {
    console.log(`[auto-eval] Worker exited with code ${code}`);
    workerProcess = null;
    workerMode = null;
    workerStartedAt = null;
    removePidFile();
  });

  return jsonResponse({ status: 'started', mode, pid: child.pid, ultra });
});

// PATCH: change mode or toggle ultra without killing the worker.
// `ultra` can be toggled standalone (no running worker required); `mode` only makes sense while running.
export const PATCH = withAuth(async (req) => {
  const body = await req.json().catch(() => ({}));

  // Ultra toggle is a pure setting update — works regardless of worker state.
  if (typeof body.ultra === 'boolean') {
    upsertSetting('auto_eval_ultra', body.ultra ? 'true' : 'false', 'Ultra mode: parallel + QA');
  }

  // Mode change only applies to a running worker.
  if (body.mode !== undefined) {
    if (!isWorkerRunning()) {
      return jsonResponse({ status: 'idle', message: 'Worker not running', ultra: body.ultra });
    }
    const mode: 'manual' | 'auto' = body.mode === 'auto' ? 'auto' : 'manual';
    const db = getDb();
    db.prepare(`INSERT INTO settings (key, value, description, created_at, updated_at)
      VALUES ('auto_eval_mode', ?, 'Worker mode set by UI', datetime('now'), datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(mode);
    workerMode = mode;
    const pidInfo = readPidFile();
    if (pidInfo) {
      writePidFile(pidInfo.pid, mode, pidInfo.startedAt);
    }
    return jsonResponse({ status: 'mode_changed', mode, ultra: body.ultra });
  }

  return jsonResponse({ status: 'updated', ultra: body.ultra });
});

// DELETE: stop worker immediately (kills mid-cycle)
export const DELETE = withAuth(async () => {
  if (!isWorkerRunning()) {
    return jsonResponse({ status: 'idle', message: 'Worker not running' });
  }

  let pid: number | undefined;

  if (workerProcess) {
    pid = workerProcess.pid;
    workerProcess.kill('SIGKILL');
  } else {
    // Orphaned worker — kill by PID from file
    const pidInfo = readPidFile();
    if (pidInfo && isProcessAlive(pidInfo.pid)) {
      pid = pidInfo.pid;
      process.kill(pidInfo.pid, 'SIGKILL');
    }
  }

  workerProcess = null;
  workerMode = null;
  workerStartedAt = null;
  removePidFile();

  return jsonResponse({ status: 'stopped', pid });
});
