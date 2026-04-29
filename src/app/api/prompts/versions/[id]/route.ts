import { withAuth } from '@/lib/route-handler';
import { deletePromptVersion, getPromptVersion } from '@/lib/repositories/prompt-repository';
import { jsonResponse, errorResponse } from '@/lib/api-utils';

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_req, context) => {
  const { id } = await (context as Params).params;
  const versionId = parseInt(id, 10);
  if (!versionId) return errorResponse('Invalid version id');
  const version = getPromptVersion(versionId);
  if (!version) return errorResponse('Version not found', 404);
  return jsonResponse(version);
});

export const DELETE = withAuth(async (_req, context) => {
  const { id } = await (context as Params).params;
  const versionId = parseInt(id, 10);
  if (!versionId) return errorResponse('Invalid version id');
  const deleted = deletePromptVersion(versionId);
  if (!deleted) return errorResponse('Version not found', 404);
  return jsonResponse({ deleted: true });
});
