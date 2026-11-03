import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import {
  authorizeUrl,
  createOauthState,
  outlookConfigured,
} from '@/lib/outlook/oauth';
import { OUTLOOK_RETURN_PATHS } from '@/lib/outlook/return-path';

/**
 * GET /api/outlook/connect — start Microsoft OAuth (mailbox link, not app login).
 * `?return=/receivables/manager` brings the user back there instead of to settings.
 */
export async function GET(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  if (!outlookConfigured()) {
    return NextResponse.json({ error: 'outlook_not_configured' }, { status: 503 });
  }

  const state = createOauthState(guard.ctx.userId);
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set('vcfo_outlook_oauth', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 15 * 60,
  });
  const back = new URL(request.url).searchParams.get('return');
  if (back && OUTLOOK_RETURN_PATHS.has(back)) {
    res.cookies.set('vcfo_outlook_return', back, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 15 * 60 });
  }
  return res;
}
