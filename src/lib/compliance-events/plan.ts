import { EVENT_TRIGGER_RULES, type ComplianceEventKind, type EventRequestItem, type EventResolutionRef } from '@/data/event-triggers';

/**
 * COMPLIANCE EVENT PLAN — what one company event starts: the form, its due date, the task title,
 * what to ask the client for and the notes for the lead (IDEAS-PLAN wave 2, section D).
 *
 * PURE: no db, no env and no clock. Dates are 'YYYY-MM-DD' calendar days compared as UTC midnights,
 * like the compliance task model.
 */

/** Free-form details of the event, all optional: the person, DIN, address and so on. */
export type EventDetails = Partial<Record<string, string>>;

export interface EventPlanInput {
  kind: ComplianceEventKind;
  occurredOn: string;
  details?: EventDetails | null;
}

export interface EventPlan {
  kind: ComplianceEventKind;
  label: string;
  form: string;
  days: number;
  legalReference: string;
  dueOn: string;
  taskTitle: string;
  requestItems: EventRequestItem[];
  notes: string[];
  resolution: EventResolutionRef | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar day `days` after `day`. Throws on a day that is not YYYY-MM-DD. */
export function addDays(day: string, days: number): string {
  if (!DAY.test(day)) throw new Error(`Not a calendar day: ${day}`);
  const t = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  if (Number.isNaN(t)) throw new Error(`Not a calendar day: ${day}`);
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/** Days from `today` to `dueOn`; negative once it has passed. */
export function daysUntil(today: string, dueOn: string): number {
  const at = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((at(dueOn) - at(today)) / 86_400_000);
}

const clean = (v: string | undefined | null) => (v ?? '').replace(/\s+/g, ' ').trim();
const isYes = (v: string | undefined | null) => /^(y|yes|true|1)$/i.test(clean(v));
const isNo = (v: string | undefined | null) => /^(n|no|false|0)$/i.test(clean(v));

/** The person or firm the event is about, for the task title. */
function subjectOf(details: EventDetails): string {
  return clean(details.person) || clean(details.firm) || '';
}

function titleFor(template: string, details: EventDetails): string {
  const subject = subjectOf(details);
  if (subject) return template.replace('{person}', subject).slice(0, 120);
  // No name given: drop the "of {person}" tail rather than leave a placeholder.
  return template.replace(/ (of|for) \{person\}$/, '').replace('{person}', 'the person').slice(0, 120);
}

export function planEvent(input: EventPlanInput): EventPlan {
  const rule = EVENT_TRIGGER_RULES[input.kind];
  if (!rule) throw new Error(`Unknown event kind: ${String(input.kind)}`);
  const details = input.details ?? {};
  const notes = [...rule.notes];
  let requestItems = [...rule.requestItems];

  if (input.kind === 'registered_office_changed') {
    if (isNo(details.withinCity)) {
      notes.unshift('The office moved outside the city, town or village: pass a special resolution and file MGT-14 within 30 days before INC-22.');
      requestItems = requestItems.filter((i) => i.kind !== 'confirmation');
      requestItems.push({ kind: 'document', label: 'Certified copy of the special resolution for the change of registered office' });
    } else if (isYes(details.withinCity)) {
      notes.unshift('The office moved within the same city, town or village: a board resolution is enough.');
      requestItems = requestItems.filter((i) => i.kind !== 'confirmation');
    }
  }
  if (input.kind === 'shares_allotted' && isYes(details.privatePlacement)) {
    notes.unshift('This was a private placement: confirm the special resolution was filed in MGT-14 and keep the PAS-4 and PAS-5 records.');
  }

  return {
    kind: rule.kind,
    label: rule.label,
    form: rule.form,
    days: rule.days,
    legalReference: rule.legalReference,
    dueOn: addDays(input.occurredOn, rule.days),
    taskTitle: titleFor(rule.taskTitle, details),
    requestItems,
    notes,
    resolution: rule.resolution,
  };
}

/** One line for a card: "DIR-12 due 10 Dec 2026 (30 days after 10 Nov 2026)". */
export function planLine(plan: EventPlan, occurredOn: string): string {
  return `${plan.form} due ${plan.dueOn} (${plan.days} days after ${occurredOn})`;
}
