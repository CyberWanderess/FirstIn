import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { setUserDisabled, deleteUser } from '@/lib/auth-db';
import { closeDb } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(req);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const userId = parseInt(id, 10);

  if (userId === auth.user.id) {
    return NextResponse.json({ error: 'Cannot modify your own account' }, { status: 400 });
  }

  const body = await req.json();
  const { disabled } = body;

  if (typeof disabled !== 'boolean') {
    return NextResponse.json({ error: 'disabled field (boolean) is required' }, { status: 400 });
  }

  setUserDisabled(userId, disabled);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(req);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const userId = parseInt(id, 10);

  if (userId === auth.user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  // Close any cached DB connection first
  closeDb(userId);

  // Delete user records from auth.db (data file is preserved for recovery)
  deleteUser(userId);

  return NextResponse.json({ success: true });
}
