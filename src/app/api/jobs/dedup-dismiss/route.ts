import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { dismissDedupPair } from '@/lib/repositories/job-repository';

export async function POST(req: NextRequest) {
  ensureInitialized();

  try {
    const { jobAId, jobBId } = await req.json();
    if (!jobAId || !jobBId || jobAId === jobBId) {
      return NextResponse.json(
        { success: false, error: 'Two distinct job IDs required' },
        { status: 400 }
      );
    }

    dismissDedupPair(jobAId, jobBId);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
