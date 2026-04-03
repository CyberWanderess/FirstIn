import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/route-handler';
import { mergeJobs } from '@/lib/repositories/job-repository';
import { logOperation } from '@/lib/repositories/operation-log-repository';

export const POST = withAuth(async (req) => {
  try {
    const { primaryId, secondaryId } = await req.json();
    if (!primaryId || !secondaryId) {
      return NextResponse.json({ success: false, error: 'primaryId and secondaryId are required' }, { status: 400 });
    }
    if (primaryId === secondaryId) {
      return NextResponse.json({ success: false, error: 'Cannot merge a job with itself' }, { status: 400 });
    }

    const result = mergeJobs(primaryId, secondaryId);
    if (!result) {
      return NextResponse.json({ success: false, error: 'One or both jobs not found' }, { status: 404 });
    }

    logOperation({
      operation: 'merge',
      entity_type: 'job',
      entity_id: primaryId,
      trigger: 'user',
      details: { primaryId, secondaryId, mergedInto: primaryId },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
});
