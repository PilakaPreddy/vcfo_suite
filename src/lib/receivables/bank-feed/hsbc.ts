import 'server-only';
import type { BankFeed, IncomingCredit } from './types';

/**
 * HSBC Treasury account information (Phase 6, docs/specs/receivables/PLAN.md). HSBC's corporate
 * API returns transactions for a date range in ISO 20022, which `parseCamt` already reads. The
 * call itself cannot be written yet: the endpoint, the client id, the signing certificate and the
 * encryption key come from HSBC onboarding, which Summit (the account holder) has to start with
 * its HSBC relationship manager. Until then this feed reports what is missing and the job skips.
 *
 * What onboarding must provide, as App Runner settings (secrets in Secrets Manager):
 *   HSBC_FEED_BASE_URL, HSBC_FEED_CLIENT_ID, HSBC_FEED_ACCOUNT, HSBC_FEED_CERT_SECRET_ID,
 *   HSBC_FEED_KEY_SECRET_ID.
 */
const NEEDED = ['HSBC_FEED_BASE_URL', 'HSBC_FEED_CLIENT_ID', 'HSBC_FEED_ACCOUNT', 'HSBC_FEED_CERT_SECRET_ID', 'HSBC_FEED_KEY_SECRET_ID'] as const;

export function hsbcFeedMissing(env: NodeJS.ProcessEnv = process.env): string[] {
  return NEEDED.filter((k) => !env[k]?.trim());
}

export function hsbcTreasuryFeed(): BankFeed {
  return {
    source: 'hsbc_api',
    async fetchCredits(): Promise<IncomingCredit[]> {
      const missing = hsbcFeedMissing();
      if (missing.length) throw new Error(`bank_feed_not_configured: ${missing.join(', ')}`);
      // With the settings in place, the request and its signing follow HSBC's onboarding pack;
      // the response goes through parseCamt(xml, 'hsbc_api').
      throw new Error('bank_feed_not_built: the HSBC request is written once the onboarding pack arrives');
    },
  };
}
