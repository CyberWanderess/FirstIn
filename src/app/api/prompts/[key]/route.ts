import { withAuth } from '@/lib/route-handler';
import { getPromptMeta, isValidPromptKey } from '@/lib/export/prompt-registry';
import {
  getCurrentPromptValue,
  listPromptVersions,
  savePromptVersion,
  resetPromptToDefault,
} from '@/lib/repositories/prompt-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';

type Params = { params: Promise<{ key: string }> };

export const GET = withAuth(async (_req, context) => {
  const { key } = await (context as Params).params;
  const meta = getPromptMeta(key);
  if (!meta) return errorResponse('Unknown prompt key', 404);

  return jsonResponse({
    key: meta.key,
    title: meta.title,
    group: meta.group,
    description: meta.description,
    placeholders: meta.placeholders ?? [],
    defaultValue: meta.defaultValue,
    currentValue: getCurrentPromptValue(key) ?? meta.defaultValue,
    versions: listPromptVersions(key),
  });
});

export const POST = withAuth(async (req, context) => {
  const { key } = await (context as Params).params;
  if (!isValidPromptKey(key)) return errorResponse('Unknown prompt key', 404);

  try {
    const body = await parseJsonBody<{ value: string; label?: string | null }>(req);
    if (typeof body.value !== 'string' || body.value.length === 0) {
      return errorResponse('value is required and must be a non-empty string');
    }
    const version = savePromptVersion(key, body.value, body.label ?? null);
    return jsonResponse(version, 201);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});

export const DELETE = withAuth(async (_req, context) => {
  const { key } = await (context as Params).params;
  if (!isValidPromptKey(key)) return errorResponse('Unknown prompt key', 404);
  const removed = resetPromptToDefault(key);
  return jsonResponse({ removed });
});
