import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { deleteInvite } from '@/lib/auth-db';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(req);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  deleteInvite(parseInt(id, 10));
  return NextResponse.json({ success: true });
}
