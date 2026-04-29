import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { setUserDisabled, deleteUser } from '@/lib/auth-db';
import { assignUserGroup } from '@/lib/permissions';
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
  const { disabled, permission_group_id } = body;

  if (typeof disabled === 'boolean') {
    setUserDisabled(userId, disabled);
  }

  if (typeof permission_group_id === 'number') {
    assignUserGroup(userId, permission_group_id);
  }

  if (typeof disabled !== 'boolean' && typeof permission_group_id !== 'number') {
    return NextResponse.json({ error: 'disabled (boolean) or permission_group_id (number) required' }, { status: 400 });
  }

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
