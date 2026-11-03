// MUST be '@/auth/edge', not '@/auth/config'. The edge wrapper has no
// providers and no database access, which is all a request-path guard needs.
// '@/auth/config' would pull bcrypt and the pg pool into every guarded request.
import { auth } from '@/auth/edge';
import { NextResponse } from 'next/server';

/**
 * Route protection + role-home redirects.
 *
 *   - unauthenticated on /app/* or /receivables/manager -> /login?next=...
 *     (the public /receivables client page is outside the matcher)
 *   - authenticated on / or /login -> role home
 *   - cross-role guard: URL segment must match the session role
 *     (super_admin may enter every segment for bird's-eye review)
 */
const roleHome: Record<string, string> = {
  super_admin: '/app/super/dashboard',
  admin: '/app/admin/dashboard',
  manager: '/app/manager/dashboard',
  intern: '/app/intern/today',
  client: '/app/client/overview',
  developer: '/app/dev/overview',
};

const roleSegment: Record<string, string> = {
  super_admin: 'super',
  admin: 'admin',
  manager: 'manager',
  intern: 'intern',
  client: 'client',
  developer: 'dev',
};

const ALL_SEGMENTS = new Set(['super', 'admin', 'manager', 'intern', 'client', 'dev']);

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const role = (session?.user as { role?: string } | undefined)?.role;
  const path = nextUrl.pathname;

  const isApp = path.startsWith('/app');
  const isReceivablesManager = path === '/receivables/manager' || path.startsWith('/receivables/manager/');
  const isAuthPage = path === '/login' || path === '/';

  if ((isApp || isReceivablesManager) && (!session?.user || !role)) {
    const url = new URL('/login', nextUrl);
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  if (session?.user && isAuthPage && role) {
    return NextResponse.redirect(new URL(roleHome[role] ?? '/login', nextUrl));
  }

  if (isApp && role) {
    const seg = path.split('/')[2]; // admin | manager | intern | client | super | dev
    if (seg && ALL_SEGMENTS.has(seg)) {
      if (role === 'super_admin') {
        // Bird's-eye: may enter any workspace segment.
        return NextResponse.next();
      }
      const expected = roleSegment[role];
      if (expected && seg !== expected) {
        return NextResponse.redirect(new URL(roleHome[role], nextUrl));
      }
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/', '/login', '/app/:path*', '/receivables/manager', '/receivables/manager/:path*'],
};
