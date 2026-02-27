import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { listSearchConfigs, insertSearchConfig } from '@/lib/repositories/search-config-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';
import type { SearchConfigInsert } from '@/types';

export async function GET() {
  ensureInitialized();
  const configs = listSearchConfigs();
  return jsonResponse(configs);
}

export async function POST(req: NextRequest) {
  ensureInitialized();
  try {
    const body = await parseJsonBody<SearchConfigInsert>(req);
    if (!body.name) return errorResponse('name is required');
    if (!body.query_params) return errorResponse('query_params is required');
    const config = insertSearchConfig(body);
    return jsonResponse(config, 201);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
