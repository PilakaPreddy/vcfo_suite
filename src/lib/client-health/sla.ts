import { getItem } from '@/data/checklist';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import type { EngagementSchedule } from '@/lib/projects/schedule-windows';
import {
  COMPLIANCE_WORK_DAYS,
  SLA_LADDER,
  SLA_STAGE_LABEL,
  STAGE_SLA_DAYS,
  slaDaysFromTimeline,
  type SlaLevel,
  type SlaStage,
} from '@/data/sla';

/**
 * SLA ESCALATION LADDER (IDEAS-PLAN wave 2, section E). PURE: no db, no clock except `today`.
 *
 * Every open step or compliance item gets a clock: the day it entered its stage and its SLA in
 * days (src/data/sla.ts). Once the time on the clock reaches 1x the SLA the lead hears, at 2x
 * the manager, at 3x the partner. Each level is sent once per item and stage clock; the nightly
 * job records it in `sla_escalations` and passes what is already recorded back in here.
 */

export interface SlaClock {
  /** `step:<itemId>`, `instance:<id>`, `task:<id>` or `event:<id>`. */
  itemKey: string;
  stage: SlaStage;
  /** The calendar day the clock started (YYYY-MM-DD). */
  startedOn: string;
  slaDays: number;
  title: string;
  /** The step id, when the item is a checklist step (for the link). */
  stepId?: string;
  /** The due date, when the item has one. */
  dueOn?: string;
}

const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY);
}

export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** The stage label stored with each escalation: the stage and the day its clock started. */
export function stageLabelOf(clock: Pick<SlaClock, 'stage' | 'startedOn'>): string {
  return `${clock.stage}@${clock.startedOn}`;
}

/** How many SLAs have passed on the clock (0.5 is halfway through the first). */
export function slaMultiple(clock: Pick<SlaClock, 'startedOn' | 'slaDays'>, today: string): number {
  const sla = Math.max(1, clock.slaDays);
  return Math.max(0, daysBetween(clock.startedOn, today)) / sla;
}

/** The ladder levels reached on the clock today that have not been sent yet, lowest first. */
export function dueLevels(clock: Pick<SlaClock, 'startedOn' | 'slaDays'>, today: string, alreadySent: ReadonlySet<SlaLevel> = new Set()): SlaLevel[] {
  const m = slaMultiple(clock, today);
  return SLA_LADDER.filter((rung) => m >= rung.multiple && !alreadySent.has(rung.level)).map((rung) => rung.level);
}

/** The step's stage on the clock, or null when it is not started, done or not applicable. */
export function stepStage(slice: ChecklistItemStateSlice | undefined): SlaStage | null {
  if (!slice) return null;
  if (slice.status === 'completed' || slice.status === 'not-applicable' || slice.status === 'not-started') return null;
  if (slice.reviewStatus === 'reviewing') return 'review';
  if (slice.status === 'awaiting-client') return 'awaiting-client';
  return 'in-progress';
}

/**
 * The clocks of the open checklist steps of one client.
 * `enteredOn[stepId]` is the day the step moved into its current status (from step events).
 */
export function stepClocks(input: {
  state: Record<string, ChecklistItemStateSlice>;
  schedule: EngagementSchedule | null | undefined;
  enteredOn: Readonly<Record<string, string>>;
}): SlaClock[] {
  const out: SlaClock[] = [];
  for (const [stepId, slice] of Object.entries(input.state)) {
    const stage = stepStage(slice);
    if (!stage) continue;
    const item = getItem(stepId);
    if (!item) continue;
    const window = input.schedule?.steps?.[stepId];
    let startedOn: string | undefined;
    let slaDays: number;
    let dueOn: string | undefined;
    if (window && stage === 'in-progress') {
      startedOn = window.from;
      slaDays = Math.max(1, daysBetween(window.from, window.to) + 1);
      dueOn = window.to;
    } else {
      const reviewSince = stage === 'review' ? (slice.clientSubmittedAt ?? slice.lastEditedAt) : undefined;
      startedOn = input.enteredOn[stepId] ?? reviewSince?.slice(0, 10) ?? slice.lastEditedAt?.slice(0, 10);
      slaDays = stage === 'in-progress' ? (slaDaysFromTimeline(item.expectedTimeline) ?? STAGE_SLA_DAYS[stage]) : STAGE_SLA_DAYS[stage];
    }
    // No known start: no clock (the job never guesses a breach).
    if (!startedOn || !ISO.test(startedOn)) continue;
    out.push({ itemKey: `step:${stepId}`, stage, startedOn, slaDays, title: item.title, stepId, dueOn });
  }
  return out;
}

/** The clock of one open compliance item: from its working window's start to its due date. */
export function complianceClock(input: { itemKey: string; title: string; dueOn: string; windowFrom?: string | null }): SlaClock | null {
  if (!ISO.test(input.dueOn)) return null;
  let startedOn = input.windowFrom && ISO.test(input.windowFrom) ? input.windowFrom : addDays(input.dueOn, -COMPLIANCE_WORK_DAYS);
  if (startedOn >= input.dueOn) startedOn = addDays(input.dueOn, -COMPLIANCE_WORK_DAYS);
  return { itemKey: input.itemKey, stage: 'compliance', startedOn, slaDays: daysBetween(startedOn, input.dueOn), title: input.title, dueOn: input.dueOn };
}

/** The notice title and body for one level of one clock. */
export function slaNoticeCopy(input: { clock: SlaClock; level: SlaLevel; companyName: string; today: string }): { title: string; body: string } {
  const { clock, level, companyName, today } = input;
  const days = Math.max(0, daysBetween(clock.startedOn, today));
  const multiple = Math.floor(slaMultiple(clock, today));
  const stage = SLA_STAGE_LABEL[clock.stage];
  const who = level === 'lead' ? 'past its SLA' : level === 'manager' ? 'at twice its SLA' : 'at three times its SLA';
  const title = `${companyName}: ${clock.title} is ${who}`;
  const body = [
    clock.stage === 'compliance' && clock.dueOn
      ? `It was due on ${clock.dueOn}.`
      : `${stage} for ${days} ${days === 1 ? 'day' : 'days'} against an SLA of ${clock.slaDays} ${clock.slaDays === 1 ? 'day' : 'days'} (${multiple}x).`,
    level === 'lead' ? 'Nudge the client or finish the work.' : level === 'manager' ? 'The lead was told at 1x. Nudge the client or reassign the work.' : 'The lead and the manager were told earlier. Please step in.',
  ].join(' ');
  return { title, body };
}
