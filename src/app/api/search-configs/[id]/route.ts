import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { findSearchConfigById, updateSearchConfig, deleteSearchConfig } from '@/lib/repositories/search-config-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';
import type { SearchConfigUpdate } from '@/types';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  ensureInitialized();
  const { id } = await params;
  const config = findSearchConfigById(parseInt(id));
  if (!config) return errorResponse('Search config not found', 404);
  return jsonResponse(config);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  ensureInitialized();
  const { id } = await params;
  try {
    const body = await parseJsonBody<SearchConfigUpdate>(req);
    const updated = updateSearchConfig(parseInt(id), body);
    if (!updated) return errorResponse('Search config not found', 404);
    return jsonResponse(updated);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  ensureInitialized();
  const { id } = await params;
  const deleted = deleteSearchConfig(parseInt(id));
  if (!deleted) return errorResponse('Search config not found', 404);
  return jsonResponse({ deleted: true });
}
