import { describe, expect, it, vi } from 'vitest';

/**
 * The Outlook callback returns to /receivables/manager only when the connect flow asked for it
 * (the vcfo_outlook_return cookie) and only for allowed paths; anything else goes to settings.
 */
vi.mock('@/auth/guards', () => ({ requireAnyRole: async () => ({ ok: true, ctx: { userId: 'u1', email: 'm@x', name: 'M', role: 'manager' } }) }));
vi.mock('@/db/repositories/outlook-connections', () => ({ upsertOutlookConnection: vi.fn() }));
vi.mock('@/lib/site-url', () => ({ siteUrl: () => 'https://app.test' }));

const { GET } = await import('../../../app/api/outlook/callback/route');

const callback = (cookie: string) => GET(new Request('https://app.test/api/outlook/callback?error=access_denied', { headers: { cookie } }));

describe('Outlook callback return path', () => {
  it('returns to the receivables manager area when asked', async () => {
    const res = await callback('vcfo_outlook_return=%2Freceivables%2Fmanager');
    expect(res.headers.get('location')).toBe('https://app.test/receivables/manager?outlook=error&reason=access_denied');
    expect(res.headers.get('set-cookie')).toContain('vcfo_outlook_return=;');
  });

  it('ignores any other return path', async () => {
    const res = await callback('vcfo_outlook_return=https%3A%2F%2Fevil.example');
    expect(res.headers.get('location')).toBe('https://app.test/app/manager/settings?outlook=error&reason=access_denied');
  });

  it('goes to settings without the cookie', async () => {
    const res = await callback('');
    expect(res.headers.get('location')).toMatch(/^https:\/\/app\.test\/app\/manager\/settings\?outlook=error/);
  });
});
