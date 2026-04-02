import { withAuth } from '@/lib/route-handler';
import { findSearchConfigById, updateSearchConfig, deleteSearchConfig } from '@/lib/repositories/search-config-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';
import type { SearchConfigUpdate } from '@/types';

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_req, context) => {
  const { id } = await (context as Params).params;
  const config = findSearchConfigById(parseInt(id));
  if (!config) return errorResponse('Search config not found', 404);
  return jsonResponse(config);
});

export const PATCH = withAuth(async (req, context) => {
  const { id } = await (context as Params).params;
  try {
    const body = await parseJsonBody<SearchConfigUpdate>(req);
    const updated = updateSearchConfig(parseInt(id), body);
    if (!updated) return errorResponse('Search config not found', 404);
    return jsonResponse(updated);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});

export const DELETE = withAuth(async (_req, context) => {
  const { id } = await (context as Params).params;
  const deleted = deleteSearchConfig(parseInt(id));
  if (!deleted) return errorResponse('Search config not found', 404);
  return jsonResponse({ deleted: true });
});
