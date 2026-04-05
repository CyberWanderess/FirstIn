import { NextRequest, NextResponse } from 'next/server';
import { findUserByEmail, verifyPassword, createSession, hashPassword } from '@/lib/auth-db';
import { isRateLimited } from '@/lib/rate-limit';

// Pre-computed dummy hash so failed lookups still run scrypt (constant-time)
const DUMMY_HASH = hashPassword('dummy-constant-time-padding');

function redirectTo(path: string, req: NextRequest): NextResponse {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  return NextResponse.redirect(new URL(path, `${proto}://${host}`));
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';

  if (isRateLimited(ip)) {
    return redirectTo('/login?error=rate_limited', req);
  }

  const formData = await req.formData();
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return redirectTo('/login?error=missing', req);
  }

  const user = findUserByEmail(email);
  // Always run verifyPassword to prevent timing-based user enumeration
  const passwordOk = verifyPassword(password, user?.password_hash || DUMMY_HASH);

  if (!user || !passwordOk) {
    return redirectTo('/login?error=invalid', req);
  }

  if (user.disabled) {
    return redirectTo('/login?error=disabled', req);
  }

  const token = createSession(user.id);

  const redirectTarget = formData.get('redirect') as string;
  // Only allow relative paths to prevent open redirect
  const safePath = redirectTarget?.startsWith('/') ? redirectTarget : '/';
  const response = redirectTo(safePath, req);
  response.cookies.set('session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
