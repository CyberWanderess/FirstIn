import { getDb } from '@/lib/db';

export interface DailyStatRow {
  /** Calendar day as 'YYYY-MM-DD', America/Los_Angeles local day. */
  date: string;
  /** Jobs with created_at on this day (gross intake). */
  newJobs: number;
  /** Subset of newJobs that are still active (status NOT archived_*). */
  activeNew: number;
  /** Jobs that transitioned to applied on this day. */
  applied: number;
  /** Subset of `applied` where the job currently has resume_tailored=1. */
  tailored: number;
}

// Day bucketing uses SQLite's DATE(x, 'localtime'), which reads the OS
// timezone. pm2 jobhq-dev runs with TZ=America/Los_Angeles so buckets align
// with the user's local calendar day. DB writes still use datetime('now')
// and remain UTC — only read-side grouping is localized.
//
// `tailored` uses the current `jobs.resume_tailored` flag, NOT the value at
// time-of-application. If the user toggles the flag later, historical bar
// segments shift. Unlikely to matter in practice.
//
// `activeNew` excludes any status starting with 'archived_' (archived_filtered,
// archived_manual, archived_low_match, archived_no_response). All other
// statuses — including applied, interviewing, rejected_resume — count as
// "active" since they represent jobs that survived initial filtering.

interface DayCount { day: string; n: number }

function queryNewJobs(days: number): DayCount[] {
  const db = getDb();
  return db.prepare(
    `SELECT DATE(created_at, 'localtime') AS day, COUNT(*) AS n
     FROM jobs
     WHERE created_at >= datetime('now', '-' || ? || ' days')
     GROUP BY day`
  ).all(days) as DayCount[];
}

function queryActiveNew(days: number): DayCount[] {
  const db = getDb();
  return db.prepare(
    `SELECT DATE(created_at, 'localtime') AS day, COUNT(*) AS n
     FROM jobs
     WHERE created_at >= datetime('now', '-' || ? || ' days')
       AND status NOT LIKE 'archived\\_%' ESCAPE '\\'
     GROUP BY day`
  ).all(days) as DayCount[];
}

function queryTransitionsTo(targetStatus: string, days: number): DayCount[] {
  const db = getDb();
  // Evaluation importer logs transitions as operation='score_update' with
  // details.to=<new status>, while manual edits log operation='status_change'.
  // Both carry details.to, so OR across them or we'll undercount.
  return db.prepare(
    `SELECT DATE(created_at, 'localtime') AS day, COUNT(*) AS n
     FROM operation_log
     WHERE entity_type = 'job'
       AND operation IN ('status_change', 'score_update')
       AND json_extract(details, '$.to') = ?
       AND created_at >= datetime('now', '-' || ? || ' days')
     GROUP BY day`
  ).all(targetStatus, days) as DayCount[];
}

function queryTailoredApplied(days: number): DayCount[] {
  const db = getDb();
  return db.prepare(
    `SELECT DATE(op.created_at, 'localtime') AS day, COUNT(*) AS n
     FROM operation_log op
     JOIN jobs j ON j.id = op.entity_id
     WHERE op.entity_type = 'job'
       AND op.operation IN ('status_change', 'score_update')
       AND json_extract(op.details, '$.to') = 'applied'
       AND j.resume_tailored = 1
       AND op.created_at >= datetime('now', '-' || ? || ' days')
     GROUP BY day`
  ).all(days) as DayCount[];
}

function toMap(rows: DayCount[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.day, r.n);
  return m;
}

/**
 * Continuous day range [today - (days-1), today] in the server's local
 * timezone as 'YYYY-MM-DD' strings. Relies on the Node process TZ env
 * matching the SQLite 'localtime' modifier — both should be LA.
 */
function buildDateAxis(days: number): string[] {
  const out: string[] = [];
  const now = new Date();
  // Build the axis in local time by constructing today's 00:00 via a
  // locale date string and parsing each day back. Avoids UTC drift.
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${dd}`);
  }
  return out;
}

/**
 * Daily activity stats for the homepage chart. Returns one row per day in
 * the requested window, with zero-filled gaps so the chart axis is continuous.
 */
export function getDailyStats(days: number): DailyStatRow[] {
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)));

  const newJobs = toMap(queryNewJobs(safeDays));
  const activeNew = toMap(queryActiveNew(safeDays));
  const applied = toMap(queryTransitionsTo('applied', safeDays));
  const tailored = toMap(queryTailoredApplied(safeDays));

  return buildDateAxis(safeDays).map((date) => ({
    date,
    newJobs: newJobs.get(date) ?? 0,
    activeNew: activeNew.get(date) ?? 0,
    applied: applied.get(date) ?? 0,
    tailored: tailored.get(date) ?? 0,
  }));
}
