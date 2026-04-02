import { withAuth } from '@/lib/route-handler';
import { listSearchConfigs, insertSearchConfig } from '@/lib/repositories/search-config-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';
import type { SearchConfigInsert } from '@/types';

export const GET = withAuth(async () => {
  const configs = listSearchConfigs();
  return jsonResponse(configs);
});

export const POST = withAuth(async (req) => {
  try {
    const body = await parseJsonBody<SearchConfigInsert>(req);
    if (!body.name) return errorResponse('name is required');
    if (!body.query_params) return errorResponse('query_params is required');
    const config = insertSearchConfig(body);
    return jsonResponse(config, 201);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});
