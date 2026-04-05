import { NextRequest, NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth';
import { findUserById, verifyPassword, hashPassword, deleteUserSessions, getAuthDb } from '@/lib/auth-db';
import { isRateLimited } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
  }

  const auth = requireAuthApi(req);
  if ('error' in auth) return auth.error;

  const body = await req.json();
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Both current and new password are required' }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
  }

  const db = getAuthDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.user.id) as { password_hash: string } | null;
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 });
  }

  const newHash = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, auth.user.id);

  // Invalidate all existing sessions (force re-login)
  deleteUserSessions(auth.user.id);

  return NextResponse.json({ success: true, message: 'Password changed. Please log in again.' });
}
