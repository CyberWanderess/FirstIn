import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getPermissionGroup, setDefaultGroup } from '@/lib/permissions';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const auth = requireAdmin(req);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const group = getPermissionGroup(Number(id));
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  setDefaultGroup(Number(id));
  return NextResponse.json({ success: true });
}
