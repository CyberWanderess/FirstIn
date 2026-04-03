import { withAuth } from '@/lib/route-handler';
import { getSettingByKey, upsertSetting } from '@/lib/repositories/settings-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';

type Params = { params: Promise<{ key: string }> };

export const GET = withAuth(async (_req, context) => {
  const { key } = await (context as Params).params;
  const setting = getSettingByKey(key);
  if (!setting) return errorResponse('Setting not found', 404);
  return jsonResponse(setting);
});

export const PUT = withAuth(async (req, context) => {
  const { key } = await (context as Params).params;
  try {
    const body = await parseJsonBody<{ value: string; description?: string }>(req);
    if (body.value === undefined) return errorResponse('value is required');
    const setting = upsertSetting(key, body.value, body.description);
    return jsonResponse(setting);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});
