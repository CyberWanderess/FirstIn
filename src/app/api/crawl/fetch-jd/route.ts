import { ensureInitialized } from '@/lib/init';
import { fetchJobDescriptions } from '@/lib/scraper/hiring-cafe-crawler';
import { jsonResponse, errorResponse } from '@/lib/api-utils';

export async function POST() {
  ensureInitialized();
  try {
    const result = await fetchJobDescriptions();
    return jsonResponse(result);
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
}
