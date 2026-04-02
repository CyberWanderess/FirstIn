import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';
import { validateSession, findUserByExtensionToken, type AuthUser } from './auth-db';

/**
 * For server components (pages): validates session, redirects to /login if invalid.
 * Returns the authenticated user.
 */
export async function requireAuthPage(): Promise<AuthUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) {
    redirect('/login');
  }
  const user = validateSession(token);
  if (!user) {
    redirect('/login');
  }
  return user;
}

/**
 * For API routes: validates session from cookie or Authorization header.
 * Returns the user or null.
 */
export function getAuthUser(req: NextRequest): AuthUser | null {
  // Try cookie first
  const cookieToken = req.cookies.get('session_token')?.value;
  if (cookieToken) {
    return validateSession(cookieToken);
  }
  // Try Authorization header (for programmatic API access)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    return validateSession(token);
  }
  return null;
}

/**
 * For API routes: validates session, returns 401 response if invalid.
 * Returns the authenticated user.
 */
export function requireAuthApi(req: NextRequest): { user: AuthUser } | { error: Response } {
  const user = getAuthUser(req);
  if (!user) {
    return {
      error: new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }
  return { user };
}

/**
 * For extension API routes: validates extension token and resolves user.
 */
export function getExtensionUser(req: NextRequest): AuthUser | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  return findUserByExtensionToken(token);
}
