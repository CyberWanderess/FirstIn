import { NextRequest } from 'next/server';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { ensureInitialized } from '@/lib/init';
import { crawlHiringCafe } from '@/lib/scraper/hiring-cafe-crawler';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  ensureInitialized();
  try {
    let configId: number | undefined;
    let cookie: string | undefined;
    try {
      const body = await parseJsonBody<{ configId?: number; cookie?: string }>(req);
      configId = body.configId;
      cookie = body.cookie;
    } catch {
      // No body is fine — crawl all enabled configs
    }

    // Save cookie to .cf-cookies if provided
    if (cookie) {
      const cookieFile = join(process.cwd(), '.cf-cookies');
      writeFileSync(cookieFile, cookie, 'utf-8');
    }

    const results = await crawlHiringCafe(configId);
    return jsonResponse(results);
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
}
