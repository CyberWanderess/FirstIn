import { randomBytes } from 'crypto';
import { withAuth } from '@/lib/route-handler';
import { getSetting, upsertSetting } from '@/lib/repositories/settings-repository';
import { registerExtensionToken, deleteExtensionToken } from '@/lib/auth-db';
import { userContext } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api-utils';

export const GET = withAuth(async () => {
  try {
    const token = getSetting('extension_api_token', '');
    return jsonResponse({ hasToken: !!token });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});

export const POST = withAuth(async () => {
  try {
    const userId = userContext.getStore()!.userId;
    const token = randomBytes(32).toString('hex');
    upsertSetting('extension_api_token', token, 'API token for Chrome Extension');
    // Also register in auth.db so withExtensionAuth can resolve userId from token
    registerExtensionToken(token, userId);
    return jsonResponse({ token }, 201);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});

export const DELETE = withAuth(async () => {
  try {
    const userId = userContext.getStore()!.userId;
    upsertSetting('extension_api_token', '', 'API token for Chrome Extension');
    deleteExtensionToken(userId);
    return jsonResponse({ revoked: true });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});
