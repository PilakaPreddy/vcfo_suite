import 'server-only';
import { systemIngestCredits, type IngestResult } from '@/db/repositories/receivables';
import { addDaysIso } from '../dates';
import { hsbcTreasuryFeed } from './hsbc';
import type { BankFeed } from './types';

/**
 * Runs the configured bank feed once (the hourly job). Nothing happens unless both
 * RECEIVABLES_BANK_FEED (today only `hsbc`) and RECEIVABLES_BANK_SHEET_ID (the sheet the account
 * belongs to) are set. It asks for the last seven days each time; credits already stored are
 * counted as duplicates and skipped, so overlapping windows are harmless.
 */
export function configuredBankFeed(env: NodeJS.ProcessEnv = process.env): { feed: BankFeed; sheetId: string } | null {
  const kind = env.RECEIVABLES_BANK_FEED?.trim();
  const sheetId = env.RECEIVABLES_BANK_SHEET_ID?.trim();
  if (!kind || !sheetId) return null;
  if (kind === 'hsbc') return { feed: hsbcTreasuryFeed(), sheetId };
  return null;
}

export async function runBankFeed(today: string): Promise<IngestResult | { skipped: string }> {
  const configured = configuredBankFeed();
  if (!configured) return { skipped: 'not_configured' };
  const credits = await configured.feed.fetchCredits(addDaysIso(today, -7));
  return systemIngestCredits(configured.sheetId, credits);
}
