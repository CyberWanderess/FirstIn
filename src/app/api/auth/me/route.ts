import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth-db';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('session_token')?.value;
  if (!token) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const user = validateSession(token);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user });
}
