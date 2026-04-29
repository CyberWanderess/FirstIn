import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth-db';
import { getUserPermissions, getUserUsageSummary } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('session_token')?.value;
  if (!token) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const user = validateSession(token);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const perms = getUserPermissions(user.id);
  const usage = getUserUsageSummary(user.id);

  return NextResponse.json({
    user,
    permissions: {
      group_name: perms.group?.name ?? null,
      features: perms.features,
      quotas: perms.quotas,
      usage,
    },
  });
}
