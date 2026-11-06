import type { AuditEventRow } from '@/lib/audit/audit-log';
import {
  auditResultOf,
  formatActorDisplay,
  formatAuditActionLabel,
  getAuditActionCategory,
  getAuditTargetType,
} from '@/lib/audit/audit-log';
import type { DbRole } from '@/lib/auth';

/**
 * The audit screen's areas (prototype AuditScreen). The shared category from `lib/audit` keeps
 * its six keys; the screen splits two more out of it: credentials (the client's portal
 * passwords vault) and sign-in (two-step and session events on an account).
 */
export type AuditArea = 'engagement' | 'checklist' | 'documents' | 'admin' | 'email' | 'credentials' | 'signin' | 'other';

/** "Who": everyone, every SBC role at once, or one role. */
export type AuditWho = 'all' | 'sbc' | DbRole;

export type AuditFilters = {
  search: string;
  role: AuditWho;
  category: 'all' | AuditArea;
};

export const AUDIT_CATEGORY_LABELS: Record<AuditArea, string> = {
  engagement: 'Projects',
  checklist: 'Milestones',
  documents: 'Documents',
  admin: 'Team',
  email: 'Email',
  credentials: 'Credentials',
  signin: 'Sign-in',
  other: 'Other',
};

/** Order of the area list in the filter. */
export const AUDIT_AREAS: AuditArea[] = ['documents', 'checklist', 'engagement', 'admin', 'email', 'credentials', 'signin', 'other'];

const SIGN_IN_ACTIONS = /^(auth|session)\.|^account\.(two_step|session|sessions|password|sign)/;

const EVENT_TITLE: Record<string, string> = {
  'engagement.checklist.save_draft': 'Step saved',
  'engagement.checklist.submit': 'Step submitted',
  'engagement.checklist.review': 'Step reviewed',
  'engagement.checklist.complete': 'Step updated',
  'engagement.checklist.deliver': 'Step delivered',
  'document.upload': 'Document uploaded',
  'document.review': 'Document reviewed',
  'document.delete': 'Document deleted',
  'document.restore': 'Document restored',
  'auth.sign_in': 'Signed in',
  'notify.email': 'Email sent',
  'email.sent': 'Email sent',
  'email.failed': 'Email failed',
  'email.skipped': 'Email skipped',
};

/** The event's title in the prototype's words ("Step updated"); other actions keep their stored label. */
export function auditEventTitle(action: string): string {
  return EVENT_TITLE[action.trim()] ?? formatAuditActionLabel(action);
}

/** The area of one action, for the pill, the filter and the export. */
export function auditAreaOf(action: string): AuditArea {
  const a = action.trim();
  if (a.startsWith('credentials.')) return 'credentials';
  if (SIGN_IN_ACTIONS.test(a)) return 'signin';
  if (a.startsWith('document.') || a.startsWith('documents.') || a.startsWith('document_request.') || a.startsWith('doc_pack.')) {
    return 'documents';
  }
  return getAuditActionCategory(a);
}

/** The Result word (prototype: Done, Sent back, Failed), with Denied kept for refused actions. */
export type AuditResultWord = 'Done' | 'Sent back' | 'Failed' | 'Denied';

export function auditResultWord(ev: AuditEventRow): AuditResultWord {
  const result = auditResultOf(ev);
  if (result === 'failed') return 'Failed';
  if (result === 'denied') return 'Denied';
  const status = typeof ev.metadata?.status === 'string' ? ev.metadata.status : null;
  if (ev.action.endsWith('.sent_back') || (ev.action === 'document.review' && status === 'changes')) return 'Sent back';
  return 'Done';
}

const SBC_ROLES = new Set<string>(['super_admin', 'admin', 'manager', 'intern']);

export function whoMatches(role: string, who: AuditWho): boolean {
  if (who === 'all') return true;
  if (who === 'sbc') return SBC_ROLES.has(role);
  return role === who;
}

function shown(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

/**
 * The change an event records, when its metadata names one: `before`/`after`, `from`/`to` or
 * `old`/`new`. Only plain values count; a nested object has no one-line before and after.
 */
export function auditChange(metadata: Record<string, unknown> | null | undefined): { before: string; after: string } | null {
  if (!metadata) return null;
  for (const [b, a] of [
    ['before', 'after'],
    ['from', 'to'],
    ['old', 'new'],
  ] as const) {
    if (!(b in metadata) || !(a in metadata)) continue;
    const before = shown(metadata[b]);
    const after = shown(metadata[a]);
    if (before !== null && after !== null) return { before, after };
  }
  return null;
}

export const defaultAuditFilters = (): AuditFilters => ({
  search: '',
  role: 'all',
  category: 'all',
});

export function auditFiltersSet(filters: AuditFilters): boolean {
  return filters.role !== 'all' || filters.category !== 'all' || filters.search.trim() !== '';
}

export function filterAuditEvents(
  events: AuditEventRow[],
  filters: AuditFilters,
  engagementsByDbId: Map<string, string>,
): AuditEventRow[] {
  const query = filters.search.trim().toLowerCase();
  return events.filter((ev) => {
    if (!whoMatches(ev.actor_role, filters.role)) return false;
    if (filters.category !== 'all' && auditAreaOf(ev.action) !== filters.category) return false;
    if (!query) return true;

    const projectName = ev.engagement_id ? engagementsByDbId.get(ev.engagement_id) ?? '' : '';
    const haystack = [
      ev.summary,
      ev.action,
      formatAuditActionLabel(ev.action),
      formatActorDisplay(ev),
      ev.actor_email ?? '',
      ev.actor_name ?? '',
      projectName,
      getAuditTargetType(ev.action),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}
