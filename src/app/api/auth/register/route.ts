import { NextRequest, NextResponse } from 'next/server';
import { existsSync, copyFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { createUser, createSession, findUserByEmail, getUserCount } from '@/lib/auth-db';

export async function POST(req: NextRequest) {
  try {
    const { email, password, display_name } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const existing = findUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const user = createUser(email, password, display_name);

    // First user: migrate legacy jobhq.db if it exists
    const userCount = getUserCount();
    if (userCount === 1) {
      migrateLegacyDb(user.id);
    }

    const token = createSession(user.id);

    const response = NextResponse.json({ user }, { status: 201 });
    response.cookies.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('UNIQUE constraint')) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function migrateLegacyDb(userId: number) {
  const legacyPath = resolve(process.env.DATABASE_PATH || './data/jobhq.db');
  if (!existsSync(legacyPath)) return;

  const userDbPath = resolve(`./data/user-${userId}.db`);
  if (existsSync(userDbPath)) return;

  mkdirSync(dirname(userDbPath), { recursive: true });
  copyFileSync(legacyPath, userDbPath);

  // Also copy WAL/SHM if they exist
  const walPath = legacyPath + '-wal';
  const shmPath = legacyPath + '-shm';
  if (existsSync(walPath)) copyFileSync(walPath, userDbPath + '-wal');
  if (existsSync(shmPath)) copyFileSync(shmPath, userDbPath + '-shm');
}
