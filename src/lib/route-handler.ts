import { NextRequest, NextResponse } from 'next/server';
import { requireAuthApi, getExtensionUser } from './auth';
import { runWithUserAsync } from './db';
import { ensureInitialized } from './init';

type RouteHandler = (req: NextRequest, context?: unknown) => Promise<Response>;

/**
 * Wraps an API route handler with auth check + user context.
 * Usage:
 *   export const GET = withAuth(async (req) => { ... });
 */
export function withAuth(handler: RouteHandler): RouteHandler {
  return async (req: NextRequest, context?: unknown) => {
    const auth = requireAuthApi(req);
    if ('error' in auth) return auth.error;

    return runWithUserAsync(auth.user.id, async () => {
      ensureInitialized();
      return handler(req, context);
    });
  };
}

/**
 * Wraps an extension API route handler with extension token auth + user context.
 */
export function withExtensionAuth(handler: RouteHandler): RouteHandler {
  return async (req: NextRequest, context?: unknown) => {
    const user = getExtensionUser(req);
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or missing extension token' },
        { status: 401, headers: corsHeaders(req) }
      );
    }

    return runWithUserAsync(user.id, async () => {
      ensureInitialized();
      return handler(req, context);
    });
  };
}

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') || '*';
  const allowed = process.env.EXTENSION_ALLOWED_ORIGINS;
  const allowOrigin = allowed
    ? (allowed.split(',').includes(origin) ? origin : 'null')
    : '*';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
