import { readFileSync, unlinkSync } from 'fs';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/route-handler';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  const tmpPath = `/tmp/jobhq-export-${Date.now()}.db`;
  try {
    // VACUUM INTO creates a consistent snapshot even with WAL mode
    getDb().exec(`VACUUM INTO '${tmpPath}'`);
    const buffer = readFileSync(tmpPath);
    unlinkSync(tmpPath);

    const date = new Date().toISOString().split('T')[0];
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="jobhq-${date}.db"`,
      },
    });
  } catch (e) {
    // Clean up temp file on error
    try { unlinkSync(tmpPath); } catch {}
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 },
    );
  }
});
