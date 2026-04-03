import { NextRequest } from 'next/server';
import { requireAuthApi } from './auth';
import type { AuthUser } from './auth-db';

export function requireAdmin(req: NextRequest): { user: AuthUser } | { error: Response } {
  const auth = requireAuthApi(req);
  if ('error' in auth) return auth;
  if (auth.user.role !== 'admin') {
    return { error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } }) };
  }
  return auth;
}
