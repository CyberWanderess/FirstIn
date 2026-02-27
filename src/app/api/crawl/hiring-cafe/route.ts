import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { crawlHiringCafe } from '@/lib/scraper/hiring-cafe-crawler';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  ensureInitialized();
  try {
    let configId: number | undefined;
    try {
      const body = await parseJsonBody<{ configId?: number }>(req);
      configId = body.configId;
    } catch {
      // No body is fine — crawl all enabled configs
    }

    const results = await crawlHiringCafe(configId);
    return jsonResponse(results);
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
}
