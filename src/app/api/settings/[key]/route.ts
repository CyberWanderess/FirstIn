import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { getSettingByKey, upsertSetting } from '@/lib/repositories/settings-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';

type Params = { params: Promise<{ key: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  ensureInitialized();
  const { key } = await params;
  const setting = getSettingByKey(key);
  if (!setting) return errorResponse('Setting not found', 404);
  return jsonResponse(setting);
}

export async function PUT(req: NextRequest, { params }: Params) {
  ensureInitialized();
  const { key } = await params;
  try {
    const body = await parseJsonBody<{ value: string; description?: string }>(req);
    if (body.value === undefined) return errorResponse('value is required');
    const setting = upsertSetting(key, body.value, body.description);
    return jsonResponse(setting);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
