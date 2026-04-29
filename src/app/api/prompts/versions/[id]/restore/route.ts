import { withAuth } from '@/lib/route-handler';
import { restorePromptVersion } from '@/lib/repositories/prompt-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';

type Params = { params: Promise<{ id: string }> };

export const POST = withAuth(async (req, context) => {
  const { id } = await (context as Params).params;
  const versionId = parseInt(id, 10);
  if (!versionId) return errorResponse('Invalid version id');

  let label: string | null | undefined;
  try {
    const body = await parseJsonBody<{ label?: string | null }>(req);
    label = body.label ?? undefined;
  } catch {
    // Body is optional for restore.
  }

  const newVersion = restorePromptVersion(versionId, label ?? null);
  if (!newVersion) return errorResponse('Version not found', 404);
  return jsonResponse(newVersion, 201);
});
