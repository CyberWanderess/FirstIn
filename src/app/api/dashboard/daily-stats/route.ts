import { withAuth } from '@/lib/route-handler';
import { getDailyStats } from '@/lib/repositories/dashboard-repository';
import { jsonResponse } from '@/lib/api-utils';

export const GET = withAuth(async (req) => {
  const url = req.nextUrl;
  const raw = parseInt(url.searchParams.get('days') || '30', 10);
  const days = Number.isFinite(raw) ? Math.max(1, Math.min(365, raw)) : 30;
  // jsonResponse wraps payload as { success, data: <payload> }, so passing
  // the array directly makes body.data the DailyStatRow[] the client expects.
  const rows = getDailyStats(days);
  return jsonResponse(rows);
});
