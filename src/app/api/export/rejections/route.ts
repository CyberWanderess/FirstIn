import { withAuth } from '@/lib/route-handler';
import { getRejectionScanPrompt } from '@/lib/export/rejection-exporter';
import { jsonResponse } from '@/lib/api-utils';

export const GET = withAuth(async (req) => {
  const url = req.nextUrl;
  const days = parseInt(url.searchParams.get('days') || '7', 10);
  const text = getRejectionScanPrompt(days);
  return jsonResponse({ text });
});
