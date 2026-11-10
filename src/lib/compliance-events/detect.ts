import type { ComplianceEventKind } from '@/data/event-triggers';
import { CLIENT_RESPONSE_FIELDS, type ChecklistItemResponses } from '@/lib/checklist/checklist-responses';
import { isRepeatField, repeatEntries } from '@/lib/checklist/checklist-repeat';

/**
 * RECORD CHANGE DETECTION — which saved checklist answers, once a company is incorporated, mean a
 * company event that needs an MCA filing (IDEAS-PLAN wave 2, section D, "Event sources").
 *
 * PURE. The checklist save hook (`record-change-hook.ts`) reads the watched value before and after
 * a save; the repository compares the value with the baseline it kept for an open proposal, so a
 * run of autosaves while someone types a name ends as one proposal, and typing the old value back
 * withdraws it.
 *
 *   pre-14  Registered Office Address   registeredOfficeCompleteAddress → registered_office_changed
 *   post-11 Registered Office (INC-22)  inc22NewAddress                 → registered_office_changed
 *   post-2  Auditor Appointment (ADT-1) auditorName                     → auditor_appointed
 *   pre-15  Proposed Directors          the directors' names            → director_appointed / director_resigned
 *
 * A first answer (nothing saved before) is never a change: it is the record being filled in.
 */

export type WatchedValue = string | string[];

export interface RecordWatch {
  /** Stable key for the watched value, for example 'pre-15:directors'. */
  key: string;
  itemId: string;
  read(responses: ChecklistItemResponses): WatchedValue;
}

export interface ProposedChange {
  kind: ComplianceEventKind;
  details: Record<string, string>;
  summary: string;
}

const norm = (v: string) => v.replace(/\s+/g, ' ').trim();
const key = (v: string) => norm(v).toLowerCase();

function directorNames(responses: ChecklistItemResponses): string[] {
  const group = (CLIENT_RESPONSE_FIELDS['pre-15'] ?? []).find((f) => f.id === 'directors');
  if (!group || !isRepeatField(group)) return [];
  return repeatEntries(responses, group)
    .map((e) => norm([e.values.firstName, e.values.middleName, e.values.lastName].map((v) => (v ?? '').trim()).filter(Boolean).join(' ')))
    .filter(Boolean);
}

const field = (id: string) => (responses: ChecklistItemResponses) => norm(responses[id] ?? '');

export const RECORD_WATCHES: readonly RecordWatch[] = [
  { key: 'pre-14:address', itemId: 'pre-14', read: field('registeredOfficeCompleteAddress') },
  { key: 'post-11:address', itemId: 'post-11', read: field('inc22NewAddress') },
  { key: 'post-2:auditor', itemId: 'post-2', read: field('auditorName') },
  { key: 'pre-15:directors', itemId: 'pre-15', read: directorNames },
];

export function watchesForItem(itemId: string): RecordWatch[] {
  return RECORD_WATCHES.filter((w) => w.itemId === itemId);
}

function isEmpty(v: WatchedValue): boolean {
  return Array.isArray(v) ? v.length === 0 : !norm(v);
}

/** True when two watched values are the same record (case and spacing ignored, names in any order). */
export function sameValue(a: WatchedValue, b: WatchedValue): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const as = new Set((Array.isArray(a) ? a : [a]).map(key).filter(Boolean));
    const bs = new Set((Array.isArray(b) ? b : [b]).map(key).filter(Boolean));
    return as.size === bs.size && [...as].every((x) => bs.has(x));
  }
  return key(a) === key(b);
}

/**
 * The events a watched value's change means, from the baseline (the value before the first
 * unconfirmed change) to the value now. Empty when there is nothing to propose: no baseline, no
 * change, or the change was undone.
 */
export function changesFor(watchKey: string, baseline: WatchedValue, current: WatchedValue): ProposedChange[] {
  if (isEmpty(baseline) || sameValue(baseline, current)) return [];
  if (watchKey === 'pre-15:directors') {
    const before = Array.isArray(baseline) ? baseline : [baseline];
    const after = Array.isArray(current) ? current : [current];
    const beforeKeys = new Set(before.map(key));
    const afterKeys = new Set(after.map(key));
    const added = after.filter((n) => !beforeKeys.has(key(n)));
    const removed = before.filter((n) => !afterKeys.has(key(n)));
    const out: ProposedChange[] = [];
    if (added.length) out.push({ kind: 'director_appointed', details: { person: added.join(', ') }, summary: `Director added on the record: ${added.join(', ')}` });
    if (removed.length) out.push({ kind: 'director_resigned', details: { person: removed.join(', ') }, summary: `Director removed from the record: ${removed.join(', ')}` });
    return out;
  }
  const now = Array.isArray(current) ? current.join(', ') : norm(current);
  const was = Array.isArray(baseline) ? baseline.join(', ') : norm(baseline);
  if (!now) return [];
  if (watchKey === 'post-2:auditor') {
    return [{ kind: 'auditor_appointed', details: { person: now, firm: now, previous: was }, summary: `Auditor changed from ${was} to ${now}` }];
  }
  return [{ kind: 'registered_office_changed', details: { address: now, previous: was }, summary: `Registered office changed to ${now}` }];
}
