import { createHmac, timingSafeEqual } from 'node:crypto';
import { authSecrets } from '@/auth/secrets';

/**
 * DIRECTOR LINKS — signed tokens in the notice email's "I will attend / I can't attend" buttons
 * and in signing-request emails. Directors have no account, so the token is the only proof: it
 * names one meeting and one director, is signed with AUTH_SECRET (AUTH_SECRET_PREVIOUS still
 * verifies after a rotation) and expires after `maxAgeDays`.
 */

export interface DirectorLink {
  meetingId: string;
  directorId: string;
  /** Issued at, ms since epoch. */
  t: number;
}

function keys(): Buffer[] {
  const secrets = authSecrets();
  if (secrets.length === 0) throw new Error('AUTH_SECRET is required for director links');
  return secrets.map((s) => createHmac('sha256', s).update('board-meeting-director-link').digest());
}

export function signDirectorLink(meetingId: string, directorId: string, now: number = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ m: meetingId, d: directorId, t: now }), 'utf8').toString('base64url');
  const sig = createHmac('sha256', keys()[0]!).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyDirectorLink(token: string, maxAgeDays = 120, now: number = Date.now()): DirectorLink | null {
  const [payload, sig] = (token ?? '').split('.');
  if (!payload || !sig) return null;
  let got: Buffer;
  try {
    got = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  const ok = keys().some((key) => {
    const expected = createHmac('sha256', key).update(payload).digest();
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  if (!ok) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { m?: unknown; d?: unknown; t?: unknown };
    if (typeof p.m !== 'string' || typeof p.d !== 'string' || typeof p.t !== 'number') return null;
    if (now - p.t > maxAgeDays * 86_400_000) return null;
    return { meetingId: p.m, directorId: p.d, t: p.t };
  } catch {
    return null;
  }
}
