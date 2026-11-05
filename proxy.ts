// MUST be '@/auth/edge', not '@/auth/config'. The edge wrapper has no
// providers and no database access, which is all a request-path guard needs.
// '@/auth/config' would pull bcrypt and the pg pool into every guarded request.
import { auth } from '@/auth/edge';
import { NextResponse } from 'next/server';
import { proxyRedirect } from '@/lib/proxy-routes';

/**
 * Route protection and role-home redirects. The rules live in `src/lib/proxy-routes.ts` (with
 * tests); in short:
 *
 *   - signed out on /app/* or /receivables/manager -> /login?next=...
 *   - signed out on a client partner page (/receivables*) -> /receivables/login?next=...
 *     (/receivables/login and /receivables/set-password stay public)
 *   - signed in on / or /login -> role home
 *   - a client partner is kept out of /app and /receivables/manager
 *   - cross-role guard: the /app URL segment must match the session role
 *     (super_admin may enter every segment for bird's-eye review)
 */
export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const role = session?.user ? (session.user as { role?: string }).role : undefined;

  const target = proxyRedirect(nextUrl.pathname, nextUrl.search, role);
  if (target) return NextResponse.redirect(new URL(target, nextUrl));
  return NextResponse.next();
});

export const config = {
  matcher: ['/', '/login', '/app/:path*', '/receivables', '/receivables/:path*'],
};
