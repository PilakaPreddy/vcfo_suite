import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/repositories/receivables', () => ({ systemIngestCredits: vi.fn() }));
const { configuredBankFeed } = await import('./run');
const { hsbcFeedMissing, hsbcTreasuryFeed } = await import('./hsbc');

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

/** The bank feed stays off until both settings are there, and HSBC reports what onboarding must supply. */
describe('bank feed configuration', () => {
  it('is off without the feed and the sheet', () => {
    expect(configuredBankFeed(env({}))).toBeNull();
    expect(configuredBankFeed(env({ RECEIVABLES_BANK_FEED: 'hsbc' }))).toBeNull();
    expect(configuredBankFeed(env({ RECEIVABLES_BANK_FEED: 'other', RECEIVABLES_BANK_SHEET_ID: 's1' }))).toBeNull();
    expect(configuredBankFeed(env({ RECEIVABLES_BANK_FEED: 'hsbc', RECEIVABLES_BANK_SHEET_ID: 's1' }))?.sheetId).toBe('s1');
  });

  it('lists the HSBC settings still missing and refuses to fetch without them', async () => {
    expect(hsbcFeedMissing(env({ HSBC_FEED_BASE_URL: 'https://x' }))).toEqual(['HSBC_FEED_CLIENT_ID', 'HSBC_FEED_ACCOUNT', 'HSBC_FEED_CERT_SECRET_ID', 'HSBC_FEED_KEY_SECRET_ID']);
    await expect(hsbcTreasuryFeed().fetchCredits('2026-10-27')).rejects.toThrow('bank_feed_not_configured');
  });
});
