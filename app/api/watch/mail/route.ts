import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { askFlags } from '@/lib/ask/config';
import { publicErrorMessage } from '@/lib/api-error';
import { receiveAlertMail } from '@/lib/watch/mail-intake';

const MAX_MAIL_BYTES = 2_000_000;

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

function tokenMatches(request: Request): boolean {
  const token = process.env.WATCH_ALERT_TOKEN;
  const given = /^Bearer\s+(.+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  return Boolean(token && given && timingSafeEqual(digest(given), digest(token)));
}

/**
 * POST /api/watch/mail: the mailbox relay sends one raw message (RFC 5322 text) with the shared token.
 * It has no user, so the token, the sender allowlist and the receiving server's result are the checks.
 * Off (404) until the flag and both settings are there. Wiring is in docs/context/notes/notifications.md.
 */
export async function POST(request: Request) {
  if (!askFlags().watch || !process.env.WATCH_ALERT_MAILBOX || !process.env.WATCH_ALERT_TOKEN) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!tokenMatches(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (Number(request.headers.get('content-length') ?? 0) > MAX_MAIL_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_MAIL_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  try {
    const receipt = await receiveAlertMail(raw);
    if (receipt.result === 'refused') return NextResponse.json({ error: receipt.reason }, { status: 422 });
    if (receipt.result === 'duplicate') return NextResponse.json({ duplicate: true });
    return NextResponse.json({ id: receipt.id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, 'intake_failed') }, { status: 500 });
  }
}
