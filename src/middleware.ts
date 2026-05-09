import { NextRequest, NextResponse } from 'next/server';

// Paths that don't require authentication
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/api/auth/',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p));
}

function isStaticAsset(pathname: string): boolean {
  return pathname.startsWith('/_next/') || pathname.startsWith('/favicon');
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!isStaticAsset(pathname)) {
    console.log(`[req] ${new Date().toISOString()} ${req.method} ${pathname}`);
  }

  // Skip static assets and public paths
  if (isStaticAsset(pathname) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Extension API: uses its own token auth, skip cookie check
  if (pathname.startsWith('/api/extension/')) {
    return NextResponse.next();
  }

  const sessionToken = req.cookies.get('session_token')?.value;

  if (!sessionToken) {
    // API routes: return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    // Pages: redirect to login
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Cookie exists — let the request through.
  // Actual session validation + userId resolution happens in route handlers via requireAuth().
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
