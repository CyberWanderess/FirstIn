import { extJsonResponse, extErrorResponse, extOptionsResponse } from '@/lib/extension-auth';
import { withExtensionAuth } from '@/lib/route-handler';
import { countJobsByStatus, getRecentJobs } from '@/lib/repositories/job-repository';

export async function OPTIONS() { return extOptionsResponse(); }

export const GET = withExtensionAuth(async () => {
  try {
    const statusCounts = countJobsByStatus();
    const recent = getRecentJobs(5);
    const recentJobs = recent.map(j => ({
      id: j.id,
      title: j.title,
      company_name: j.company_display_name || j.company_name,
      status: j.status,
      created_at: j.created_at,
    }));

    return extJsonResponse({ statusCounts, recentJobs });
  } catch (e) {
    return extErrorResponse((e as Error).message);
  }
});
