import { withAuth } from '@/lib/route-handler';
import { fetchJobDescriptions } from '@/lib/scraper/hiring-cafe-crawler';
import { jsonResponse, errorResponse } from '@/lib/api-utils';

export const POST = withAuth(async () => {
  try {
    const result = await fetchJobDescriptions();
    return jsonResponse(result);
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
});
