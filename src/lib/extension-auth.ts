import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/repositories/settings-repository';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function verifyExtensionToken(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      valid: false as const,
      response: NextResponse.json(
        { success: false, error: 'Missing or invalid Authorization header' },
        { status: 401, headers: CORS_HEADERS },
      ),
    };
  }

  const token = authHeader.slice(7);
  const storedToken = getSetting('extension_api_token', '');

  if (!storedToken || token !== storedToken) {
    return {
      valid: false as const,
      response: NextResponse.json(
        { success: false, error: 'Invalid API token' },
        { status: 401, headers: CORS_HEADERS },
      ),
    };
  }

  return { valid: true as const, response: null };
}

/** JSON response with CORS headers for extension endpoints */
export function extJsonResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(
    { success: true, data },
    { status, headers: CORS_HEADERS },
  );
}

/** Error response with CORS headers for extension endpoints */
export function extErrorResponse(error: string, status = 400): NextResponse {
  return NextResponse.json(
    { success: false, error },
    { status, headers: CORS_HEADERS },
  );
}

/** CORS preflight response */
export function extOptionsResponse(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
