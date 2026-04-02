import { randomBytes } from 'crypto';
import { ensureInitialized } from '@/lib/init';
import { getSetting, upsertSetting } from '@/lib/repositories/settings-repository';
import { jsonResponse, errorResponse } from '@/lib/api-utils';

export async function GET() {
  ensureInitialized();
  try {
    const token = getSetting('extension_api_token', '');
    return jsonResponse({ hasToken: !!token });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

export async function POST() {
  ensureInitialized();
  try {
    const token = randomBytes(32).toString('hex');
    upsertSetting('extension_api_token', token, 'API token for Chrome Extension');
    return jsonResponse({ token }, 201);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

export async function DELETE() {
  ensureInitialized();
  try {
    upsertSetting('extension_api_token', '', 'API token for Chrome Extension');
    return jsonResponse({ revoked: true });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
