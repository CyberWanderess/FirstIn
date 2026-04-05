import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createInvite, listInvites } from '@/lib/auth-db';

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if ('error' in auth) return auth.error;

  const invites = listInvites();
  return NextResponse.json({ success: true, data: invites });
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const expiresInHours = body.expiresInHours as number | undefined;

  const invite = createInvite(auth.user.id, expiresInHours);
  return NextResponse.json({ success: true, data: invite }, { status: 201 });
}
