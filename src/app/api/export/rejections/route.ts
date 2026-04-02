import { NextRequest } from 'next/server';
import { getRejectionScanPrompt } from '@/lib/export/rejection-exporter';
import { jsonResponse } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const days = parseInt(url.searchParams.get('days') || '7', 10);
  const text = getRejectionScanPrompt(days);
  return jsonResponse({ text });
}
