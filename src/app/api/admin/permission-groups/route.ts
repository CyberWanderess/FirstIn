import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { listPermissionGroups, createPermissionGroup } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if ('error' in auth) return auth.error;

  const groups = listPermissionGroups();
  return NextResponse.json({ success: true, data: groups });
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  try {
    const group = createPermissionGroup({
      name: body.name.trim(),
      description: body.description?.trim(),
      features: body.features || {},
      quotas: body.quotas || {},
    });
    return NextResponse.json({ success: true, data: group }, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ error: 'A group with this name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
