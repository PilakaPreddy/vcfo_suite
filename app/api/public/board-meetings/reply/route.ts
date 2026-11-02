import { NextResponse } from 'next/server';
import { systemRecordReply } from '@/db/repositories/board-meetings';
import { verifyDirectorLink } from '@/lib/board-meetings/reply-token';
import { clientIp, createRateLimiter } from '@/lib/growth/demo-request';
import { siteUrl } from '@/lib/site-url';

/**
 * POST /api/public/board-meetings/reply — a director's "I will attend / I can't attend" from the
 * notice email (form post from /meeting-reply). No session: the signed token names one meeting
 * and one director. A GET never records a reply, so mail scanners that open links change nothing.
 */
const limiter = createRateLimiter({ limit: 20, windowMs: 10 * 60_000 });

export async function POST(request: Request) {
  if (!limiter.take(clientIp(request.headers))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  const form = await request.formData().catch(() => null);
  const token = String(form?.get('t') ?? '');
  const reply = String(form?.get('r') ?? '');
  const note = String(form?.get('note') ?? '').slice(0, 500);
  const link = verifyDirectorLink(token);
  const back = (q: string) => NextResponse.redirect(`${siteUrl()}/meeting-reply?t=${encodeURIComponent(token)}&${q}`, 303);
  if (!link || (reply !== 'yes' && reply !== 'no')) return back('error=invalid');
  const done = await systemRecordReply(link.meetingId, link.directorId, reply, note || null);
  return done ? back(`done=${reply}`) : back('error=closed');
}
