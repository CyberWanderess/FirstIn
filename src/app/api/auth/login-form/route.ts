import { NextRequest, NextResponse } from 'next/server';
import { findUserByEmail, verifyPassword, createSession } from '@/lib/auth-db';

function redirectTo(path: string, req: NextRequest): NextResponse {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  return NextResponse.redirect(new URL(path, `${proto}://${host}`));
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return redirectTo('/login?error=missing', req);
  }

  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return redirectTo('/login?error=invalid', req);
  }

  const token = createSession(user.id);

  const response = redirectTo('/', req);
  response.cookies.set('session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
