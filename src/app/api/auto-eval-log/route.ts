import { withAuth } from '@/lib/route-handler';
import { getDb } from '@/lib/db';
import { jsonResponse } from '@/lib/api-utils';

export const GET = withAuth(async (req) => {
  const url = req.nextUrl;
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const runType = url.searchParams.get('run_type');

  const db = getDb();

  // Check if table exists (migration may not have run yet)
  const tableExists = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='auto_eval_log'`
  ).get();
  if (!tableExists) {
    return jsonResponse({ entries: [], summary: { total: 0, today_cost: 0, today_count: 0, today_input_tokens: 0, today_output_tokens: 0, today_success: 0, today_failed: 0 } });
  }

  let query = `SELECT * FROM auto_eval_log`;
  const params: unknown[] = [];

  if (runType) {
    query += ` WHERE run_type = ?`;
    params.push(runType);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const entries = db.prepare(query).all(...params);

  // Daily summary
  const summary = db.prepare(`
    SELECT
      COUNT(*) as today_count,
      COALESCE(SUM(cost_usd), 0) as today_cost,
      COALESCE(SUM(input_tokens), 0) as today_input_tokens,
      COALESCE(SUM(output_tokens), 0) as today_output_tokens,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as today_success,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as today_failed
    FROM auto_eval_log
    WHERE created_at >= date('now')
    AND run_type IN ('company_research', 'job_evaluation')
  `).get();

  return jsonResponse({ entries, summary });
});
