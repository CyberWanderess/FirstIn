import { NextRequest, NextResponse } from 'next/server';

function getCorsHeaders(req?: NextRequest): Record<string, string> {
  const origin = req?.headers.get('origin') || '*';
  const allowed = process.env.EXTENSION_ALLOWED_ORIGINS;
  let allowOrigin: string;
  if (allowed) {
    allowOrigin = allowed.split(',').includes(origin) ? origin : 'null';
  } else if (process.env.NODE_ENV === 'production') {
    // In production, require explicit EXTENSION_ALLOWED_ORIGINS
    allowOrigin = 'null';
  } else {
    allowOrigin = '*';
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

/** JSON response with CORS headers for extension endpoints */
export function extJsonResponse<T>(data: T, status = 200, req?: NextRequest): NextResponse {
  return NextResponse.json(
    { success: true, data },
    { status, headers: getCorsHeaders(req) },
  );
}

/** Error response with CORS headers for extension endpoints */
export function extErrorResponse(error: string, status = 400, req?: NextRequest): NextResponse {
  return NextResponse.json(
    { success: false, error },
    { status, headers: getCorsHeaders(req) },
  );
}

/** CORS preflight response */
export function extOptionsResponse(req?: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}
