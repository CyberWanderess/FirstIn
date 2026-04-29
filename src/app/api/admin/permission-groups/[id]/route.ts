import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getPermissionGroup, updatePermissionGroup, deletePermissionGroup } from '@/lib/permissions';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = requireAdmin(req);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const group = getPermissionGroup(Number(id));
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: group });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = requireAdmin(req);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const existing = getPermissionGroup(Number(id));
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const group = updatePermissionGroup(Number(id), {
      name: body.name,
      description: body.description,
      features: body.features,
      quotas: body.quotas,
    });
    return NextResponse.json({ success: true, data: group });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ error: 'A group with this name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = requireAdmin(req);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const result = deletePermissionGroup(Number(id));
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
