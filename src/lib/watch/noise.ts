import { maskIdentityNumbers } from '@/lib/ask/mask';
import type { ListedItem, SourceAdapter } from './types';

/**
 * Noise rules: code drops what can never be a compliance change, and every drop is logged with its
 * reason so the rules can be audited. A rule that is unsure keeps the item for a person.
 */
const SHARED_RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ['tender', /\b(e-?tenders?|tender(s|ing)?|corrigendum|request for proposal|\brfp\b|expression of interest|\beoi\b|empanelment|procurement|bid(s|ding)?\b)/i],
  ['job', /\b(recruitment|vacanc(y|ies)|walk-?in|engagement of|deputation|job openings?|internship|appointment of|transfer(s)? and posting|promotion order)\b/i],
  ['auction', /\b(e-?auctions?|auction of|auction result|auction for)\b/i],
];

export function noiseReason(adapter: SourceAdapter, item: ListedItem): string | null {
  for (const [reason, rule] of SHARED_RULES) if (rule.test(item.title)) return reason;
  return adapter.noise?.(item) ?? null;
}

/** Titles and links can carry a defaulter's PAN, and the audit log is a log like any other. */
export function noiseLogFields(item: ListedItem): { title: string; url: string | null } {
  return {
    title: maskIdentityNumbers(item.title).slice(0, 300),
    url: /[a-z]{5}\d{4}[a-z]/i.test(item.url) ? null : item.url,
  };
}
