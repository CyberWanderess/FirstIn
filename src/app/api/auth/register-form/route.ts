import { NextRequest, NextResponse } from 'next/server';
import { createUser, createSession, findUserByEmail, getUserCount, validateInviteCode, markInviteUsed, getAuthDb } from '@/lib/auth-db';
import { isRateLimited } from '@/lib/rate-limit';

function redirectTo(path: string, req: NextRequest): NextResponse {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  return NextResponse.redirect(new URL(path, `${proto}://${host}`));
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';

  if (isRateLimited(ip)) {
    return redirectTo('/register?error=rate_limited', req);
  }

  const formData = await req.formData();
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const displayName = formData.get('display_name') as string;
  const inviteCode = formData.get('invite') as string | null;

  if (!email || !password) {
    return redirectTo('/register?error=missing', req);
  }
  if (password.length < 8) {
    return redirectTo('/register?error=short_password', req);
  }

  const userCount = getUserCount();
  const needsInvite = userCount > 0;

  // Validate invite code if required
  if (needsInvite) {
    if (!inviteCode) {
      return redirectTo('/register?error=invite_required', req);
    }
    const invite = validateInviteCode(inviteCode);
    if (!invite) {
      return redirectTo('/register?error=invalid_invite', req);
    }
  }

  try {
    const existing = findUserByEmail(email);
    if (existing) {
      return redirectTo('/register?error=failed', req);
    }

    // Use transaction to atomically create user + consume invite
    const db = getAuthDb();
    let userId: number;

    db.transaction(() => {
      const user = createUser(email, password, displayName || undefined);
      userId = user.id;
      if (inviteCode && needsInvite) {
        markInviteUsed(inviteCode, user.id);
      }
    })();

    const token = createSession(userId!);

    const response = redirectTo('/', req);
    response.cookies.set('session_token', token, {
      httpOnly: true,
      secure: req.headers.get('x-forwarded-proto') === 'https' || req.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  } catch {
    return redirectTo('/register?error=failed', req);
  }
}
