import { NextRequest, NextResponse } from 'next/server';
import { existsSync, copyFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { createUser, createSession, findUserByEmail, getUserCount } from '@/lib/auth-db';

function redirectTo(path: string, req: NextRequest): NextResponse {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  return NextResponse.redirect(new URL(path, `${proto}://${host}`));
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const displayName = formData.get('display_name') as string;

  if (!email || !password) {
    return redirectTo('/register?error=missing', req);
  }
  if (password.length < 6) {
    return redirectTo('/register?error=short_password', req);
  }

  const existing = findUserByEmail(email);
  if (existing) {
    return redirectTo('/register?error=exists', req);
  }

  try {
    const user = createUser(email, password, displayName || undefined);

    // First user: migrate legacy jobhq.db if it exists
    const userCount = getUserCount();
    if (userCount === 1) {
      migrateLegacyDb(user.id);
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
  } catch {
    return redirectTo('/register?error=failed', req);
  }
}

function migrateLegacyDb(userId: number) {
  const legacyPath = resolve(process.env.DATABASE_PATH || './data/jobhq.db');
  if (!existsSync(legacyPath)) return;

  const userDbPath = resolve(`./data/user-${userId}.db`);
  if (existsSync(userDbPath)) return;

  mkdirSync(dirname(userDbPath), { recursive: true });
  copyFileSync(legacyPath, userDbPath);

  const walPath = legacyPath + '-wal';
  const shmPath = legacyPath + '-shm';
  if (existsSync(walPath)) copyFileSync(walPath, userDbPath + '-wal');
  if (existsSync(shmPath)) copyFileSync(shmPath, userDbPath + '-shm');
}
