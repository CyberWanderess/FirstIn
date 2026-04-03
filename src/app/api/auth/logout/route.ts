import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/auth-db';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('session_token')?.value;
  if (token) {
    deleteSession(token);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set('session_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
