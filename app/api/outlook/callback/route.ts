import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import {
  exchangeCodeForTokens,
  graphMe,
  parseOauthState,
} from '@/lib/outlook/oauth';
import { upsertOutlookConnection } from '@/db/repositories/outlook-connections';
import { siteUrl } from '@/lib/site-url';
import { roleSettingsPath } from '@/lib/auth-routes';
import { OUTLOOK_RETURN_PATHS } from '@/lib/outlook/return-path';

/** GET /api/outlook/callback — Microsoft OAuth redirect. */
export async function GET(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  const origin = siteUrl();

  if (guard.ok === false) {
    return NextResponse.redirect(`${origin}/login?outlook=error`);
  }

  const returnCookie = request.headers.get('cookie')?.match(/(?:^|;\s*)vcfo_outlook_return=([^;]+)/)?.[1];
  const returnPath = returnCookie ? decodeURIComponent(returnCookie) : '';
  const settings = `${origin}${OUTLOOK_RETURN_PATHS.has(returnPath) ? returnPath : roleSettingsPath(guard.ctx.role)}`;
  const fail = (reason: string) => {
    const r = NextResponse.redirect(`${settings}?outlook=error&reason=${encodeURIComponent(reason)}`);
    r.cookies.set('vcfo_outlook_return', '', { path: '/', maxAge: 0 });
    return r;
  };

  const url = new URL(request.url);
  const err = url.searchParams.get('error_description') || url.searchParams.get('error');
  if (err) return fail(err.slice(0, 120));

  const code = url.searchParams.get('code')?.trim();
  const state = url.searchParams.get('state')?.trim();
  const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)vcfo_outlook_oauth=([^;]+)/)?.[1];
  const cookieState = cookie ? decodeURIComponent(cookie) : '';
  if (!code || !state || !cookieState || cookieState !== state) {
    return fail('invalid_state');
  }
  if (!parseOauthState(state, guard.ctx.userId)) {
    return fail('invalid_state');
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return fail('missing_refresh_token');
    }
    const me = await graphMe(tokens.access_token);
    const msEmail = (me.mail || me.userPrincipalName || '').trim();
    if (!msEmail) return fail('missing_mailbox');

    await upsertOutlookConnection(guard.ctx, {
      msEmail,
      msUserId: me.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresInSec: tokens.expires_in ?? 3600,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'connect_failed';
    return fail(message.slice(0, 120));
  }

  const res = NextResponse.redirect(`${settings}?outlook=connected`);
  res.cookies.set('vcfo_outlook_oauth', '', { path: '/', maxAge: 0 });
  res.cookies.set('vcfo_outlook_return', '', { path: '/', maxAge: 0 });
  return res;
}
