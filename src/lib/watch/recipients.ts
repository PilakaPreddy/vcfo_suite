import { isAdminOrManager, type Role } from '@/lib/auth';
import { roleAnnouncementsPath } from '@/lib/notifications/announcements';
import type { RegChangeType, RegImportance } from './types';

/**
 * Who gets what, as fixed code rules from the master plan's table. Neither the chat nor the model
 * ever chooses a recipient. Important: one bell row per person at publish. Normal and staff-only:
 * one summary row per person per day. Clients only after review and never for staff-only.
 */
export interface WatchPerson {
  id: string;
  role: Role;
}

export const WATCH_ROLES = ['super_admin', 'admin', 'manager', 'intern', 'client'] as const satisfies readonly Role[];

/** Staff of the firm, which the developer and partner roles are not. */
export function isWatchStaff(role: Role | string | undefined): boolean {
  return isAdminOrManager(role) || role === 'intern';
}

const IMPORTANT_CHANGES: ReadonlySet<RegChangeType> = new Set(['due_date', 'penalty', 'law_in_force', 'form_change']);

export function importanceFor(changeType: RegChangeType, sourceAudience: string | null): RegImportance {
  if (sourceAudience === 'staff') return 'staff_only';
  return IMPORTANT_CHANGES.has(changeType) ? 'important' : 'normal';
}

const PROPOSAL = /\b(draft|proposed|proposes|proposal|(inviting|seeking|invites) (comments|suggestions))\b/i;

/** A draft changes nothing yet, whatever it would change, so its listed title decides over the model's label. */
export function changeTypeFor(changeType: RegChangeType, title: string): RegChangeType {
  return PROPOSAL.test(title) ? 'consultation' : changeType;
}

/** The board and the chat card follow the same rule as the bell. */
export function audienceFor(importance: RegImportance): 'everyone' | 'staff' {
  return importance === 'staff_only' ? 'staff' : 'everyone';
}

export function bellRecipients(importance: RegImportance, people: readonly WatchPerson[]): WatchPerson[] {
  return importance === 'important' ? [...people] : [];
}

/** Which of the day's published updates each person's one summary row covers. */
export function summaryFor<T extends { importance: RegImportance }>(person: WatchPerson, updates: readonly T[]): T[] {
  return isWatchStaff(person.role) ? [...updates] : updates.filter((update) => update.importance !== 'staff_only');
}

export function reviewers(people: readonly WatchPerson[]): WatchPerson[] {
  return people.filter((person) => isAdminOrManager(person.role));
}

export function watchHref(role: Role): string {
  return roleAnnouncementsPath(role).replace(/announcements$/, 'watch');
}
