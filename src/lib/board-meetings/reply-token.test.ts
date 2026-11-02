import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signDirectorLink, verifyDirectorLink } from './reply-token';

describe('director links', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.AUTH_SECRET = 'current-secret';
    delete process.env.AUTH_SECRET_PREVIOUS;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('round-trips one meeting and one director', () => {
    const now = Date.UTC(2026, 8, 3);
    const t = signDirectorLink('m1', 'd1', now);
    expect(verifyDirectorLink(t, 120, now + 1000)).toEqual({ meetingId: 'm1', directorId: 'd1', t: now });
  });

  it('rejects a changed payload, an old token and a wrong secret', () => {
    const now = Date.UTC(2026, 8, 3);
    const t = signDirectorLink('m1', 'd1', now);
    const [, sig] = t.split('.');
    const forged = `${Buffer.from(JSON.stringify({ m: 'm2', d: 'd1', t: now })).toString('base64url')}.${sig}`;
    expect(verifyDirectorLink(forged, 120, now)).toBeNull();
    expect(verifyDirectorLink(t, 120, now + 121 * 86_400_000)).toBeNull();
    process.env.AUTH_SECRET = 'other';
    expect(verifyDirectorLink(t, 120, now)).toBeNull();
    process.env.AUTH_SECRET_PREVIOUS = 'current-secret';
    expect(verifyDirectorLink(t, 120, now)?.meetingId).toBe('m1');
    expect(verifyDirectorLink('garbage', 120, now)).toBeNull();
  });
});
