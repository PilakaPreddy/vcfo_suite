import { normalizeLabel } from '@/lib/ask/field-catalog/rules';

/**
 * Which one client a run is for. A run acts on one engagement only, and what the person can reach
 * comes from a scoped repository call before this runs. Two matches or a mention of a company they
 * cannot reach means the chat asks; a mismatch between a document and that client is a question too.
 */
export interface LockableEngagement {
  id: string;
  slug: string | null;
  companyName: string;
}

export type EngagementLock<E> =
  | { kind: 'locked'; engagement: E }
  | { kind: 'choose'; options: E[] }
  | { kind: 'unknown'; mentioned: string | null };

const SUFFIX = /\b(private|pvt|limited|ltd|llp|opc|india|the|company|co|inc|llc)\b/g;

export function coreName(name: string): string {
  return normalizeLabel(name).replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();
}

const mentions = (haystack: string, needle: string) => needle.length >= 3 && new RegExp(`(^|\\s)${needle}(\\s|$)`).test(haystack);

/** Companies a text names: the whole name first, then a distinctive first word. */
export function companiesNamed<E extends LockableEngagement>(text: string, engagements: readonly E[]): E[] {
  const haystack = normalizeLabel(text);
  const whole = engagements.filter((e) => mentions(haystack, coreName(e.companyName)));
  if (whole.length > 0) return whole;
  return engagements.filter((e) => {
    const first = coreName(e.companyName).split(' ')[0] ?? '';
    return first.length >= 4 && mentions(haystack, first);
  });
}

const FOR_COMPANY = /\b(?:for|to|of|in)\s+((?:[A-Z][\w&.'-]*\s*){1,5})/;
/** Words after "for" that name a role or a document, not a company. */
const NOT_A_COMPANY = /^(?:director|subscriber|pan|din|aadhaar|passport|the|this|step|client|company|project|me|us)\b/i;

function explicitMention(message: string): string | null {
  const name = FOR_COMPANY.exec(message)?.[1]?.trim();
  return name && !NOT_A_COMPANY.test(name) ? name : null;
}

const PAGE_PROJECT = /\/(?:projects|engagements|clients)\/([^/?#]+)/;

export function lockEngagement<E extends LockableEngagement>(input: {
  message: string;
  pagePath?: string | null;
  pendingEngagementId?: string | null;
  engagements: readonly E[];
}): EngagementLock<E> {
  const { engagements } = input;
  const named = companiesNamed(input.message, engagements);
  if (named.length === 1) return { kind: 'locked', engagement: named[0]! };
  if (named.length > 1) return { kind: 'choose', options: named };
  const mentioned = explicitMention(input.message);
  if (mentioned) return { kind: 'unknown', mentioned };
  const pending = engagements.find((e) => e.id === input.pendingEngagementId);
  if (pending) return { kind: 'locked', engagement: pending };
  const key = input.pagePath ? PAGE_PROJECT.exec(input.pagePath)?.[1] : null;
  const onPage = key ? engagements.find((e) => e.slug === key || e.id === key) : null;
  if (onPage) return { kind: 'locked', engagement: onPage };
  if (engagements.length === 1) return { kind: 'locked', engagement: engagements[0]! };
  return { kind: 'unknown', mentioned: null };
}

/** True when a company named by a document is plausibly this client. */
export function documentMatches(docCompany: string, names: readonly string[]): boolean {
  const doc = new Set(coreName(docCompany).split(' ').filter(Boolean));
  if (doc.size === 0) return true;
  return names.some((name) => {
    const words = coreName(name).split(' ').filter(Boolean);
    const shared = words.filter((word) => doc.has(word)).length;
    return shared > 0 && shared / Math.min(words.length, doc.size) >= 0.6;
  });
}
