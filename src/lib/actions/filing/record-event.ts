import 'server-only';

import { z } from 'zod';
import { COMPLIANCE_EVENT_KINDS, EVENT_TRIGGER_RULES, type ComplianceEventKind } from '@/data/event-triggers';
import { changeTaskStage, createTask as createComplianceTask } from '@/db/repositories/compliance-tasks';
import { getComplianceEvent, recordComplianceEvent, setComplianceEventStatus, type ComplianceEventSource } from '@/db/repositories/compliance-events';
import { createRequestList, updateRequestList } from '@/db/repositories/request-lists';
import { createTask as createWorkTask, updateTask as updateWorkTask } from '@/db/repositories/tasks';
import type { ChangesetDraft, JsonValue, RowCheck } from '@/lib/ask/changeset/types';
import { isAdminOrManager } from '@/lib/auth';
import { isIncorporated } from '@/lib/compliance/incorporation-state';
import { addDays, planEvent, type EventPlan } from '@/lib/compliance-events/plan';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import { dayInput, jsonTarget, loadEngagement, oneRow, recheckOf, STAFF_ROLES, unavailable } from '../shared';
import { defineAction, type ActionContext, type ActionRecheck, type ActionResult } from '../types';

/**
 * Record a company event that starts an MCA filing (IDEAS-PLAN wave 2, section D): a director
 * appointed or resigned, the registered office moved, an auditor appointed, shares allotted, the
 * authorised capital increased, or a resolution that must be filed. Record-changing (T2): the card
 * shows the form, its due date and what will be created.
 *
 * Execute creates the task with the rule's due date (a compliance task when the person may create
 * one, that is a manager or admin; a Work board task assigned to the lead otherwise), drafts a client
 * request list with the rule's items (a draft only: sending it is its own reviewed step,
 * `requests.sendList`), and stores the event as tracked. With `eventId` it confirms a proposal the
 * checklist save hook made, instead of adding a second event. Undo dismisses the event, cancels the
 * draft list and takes the task off the boards.
 */

const details = z
  .object({
    person: z.string().trim().max(200),
    din: z.string().trim().max(20),
    address: z.string().trim().max(500),
    withinCity: z.string().trim().max(10),
    firm: z.string().trim().max(200),
    shares: z.string().trim().max(100),
    amount: z.string().trim().max(100),
    resolution: z.string().trim().max(300),
    privatePlacement: z.string().trim().max(10),
    previous: z.string().trim().max(500),
    summary: z.string().trim().max(500),
  })
  .partial();

const input = z.object({
  engagementId: z.string().min(1),
  kind: z.enum(COMPLIANCE_EVENT_KINDS),
  occurredOn: dayInput,
  details: details.optional(),
  /** A proposed event to confirm, from the events page or a record change. */
  eventId: z.string().uuid().optional(),
  /** Where the event came from; the chat sends 'ask', the screen 'manual'. */
  source: z.enum(['manual', 'ask', 'record_change', 'board_meeting']).optional(),
  /** A short description of the event, shown on the card. */
  value: z.string().trim().max(300).optional(),
});
type Input = z.infer<typeof input>;

interface UndoData {
  eventId: string;
  taskId: string | null;
  taskKind: 'compliance' | 'work' | null;
  requestListId: string | null;
}

const cleanDetails = (d: Input['details']): Record<string, string> =>
  Object.fromEntries(Object.entries(d ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== ''));

/** The request list's due date: a week from today, and never after the filing is due. */
export function requestDueOn(today: string, plan: Pick<EventPlan, 'dueOn'>): string {
  const week = addDays(today, 7);
  return week < plan.dueOn ? week : plan.dueOn < today ? today : plan.dueOn;
}

/** What the card says will be created. */
export function describePlan(plan: EventPlan, occurredOn: string, opts: { taskKind: 'compliance' | 'work' }): string {
  const lines = [
    `${plan.form} due ${plan.dueOn}, ${plan.days} days after ${occurredOn} (${plan.legalReference})`,
    `${opts.taskKind === 'compliance' ? 'Compliance task' : 'Work board task'}: ${plan.taskTitle}`,
    `Draft client request (not sent): ${plan.requestItems.length} item${plan.requestItems.length === 1 ? '' : 's'}`,
    ...plan.requestItems.map((i) => `  · ${i.label}`),
    plan.resolution ? `Resolution: draft from the agenda library (${plan.resolution.agendaItemIds.join(', ')}) with the board meeting resolution generator` : null,
    ...plan.notes.map((n) => `Note: ${n}`),
  ];
  return lines.filter(Boolean).join('\n');
}

const taskKindFor = (actx: ActionContext): 'compliance' | 'work' => (isAdminOrManager(actx.auth.role) ? 'compliance' : 'work');

async function check(actx: ActionContext, i: Input): Promise<ActionRecheck> {
  const loaded = await loadEngagement(actx.auth, i.engagementId);
  if (!loaded) return unavailable();
  const today = actx.now.toISOString().slice(0, 10);
  const checks: RowCheck[] = [{ rule: 'scope', ok: true }];
  checks.push(
    isIncorporated(loaded.row, loaded.state)
      ? { rule: 'incorporated', ok: true }
      : { rule: 'incorporated', ok: false, message: 'Held: this company is not incorporated yet, so there is nothing to file for this event.' },
  );
  checks.push(i.occurredOn > today ? { rule: 'date', ok: false, message: 'Held: the event date is in the future.' } : { rule: 'date', ok: true });
  if (i.eventId) {
    const event = await getComplianceEvent(actx.auth, i.eventId);
    const sameClient = event && engagementDbId(event.engagementId) === loaded.row.id;
    checks.push(
      !event || !sameClient
        ? { rule: 'event', ok: false, message: 'Held: this proposed event is no longer available.' }
        : event.status !== 'proposed'
          ? { rule: 'event', ok: false, message: 'Held: this event was already confirmed or dismissed.' }
          : { rule: 'event', ok: true },
    );
  }
  const plan = planEvent({ kind: i.kind, occurredOn: i.occurredOn, details: cleanDetails(i.details) });
  if (plan.dueOn < today) checks.push({ rule: 'due', ok: true, message: `The ${plan.form} due date has passed; the task opens overdue and an additional fee may apply.` });
  return recheckOf(checks, {
    oldValue: '',
    // Stored as the row's new value and parsed back as `value` at the click, so it stays the description.
    value: i.value?.trim() ?? '',
    displayOld: '',
    displayNew: [i.value?.trim() ? `${i.value.trim()} (${loaded.companyName})` : `${plan.label} at ${loaded.companyName} on ${i.occurredOn}`, describePlan(plan, i.occurredOn, { taskKind: taskKindFor(actx) })].join('\n'),
  });
}

export async function previewRecordEvent(actx: ActionContext, i: Input): Promise<ChangesetDraft> {
  const loaded = await loadEngagement(actx.auth, i.engagementId);
  const rule = EVENT_TRIGGER_RULES[i.kind as ComplianceEventKind];
  const { value: _value, ...target } = i;
  return oneRow({
    title: `${rule.form} for ${loaded?.companyName ?? 'this client'}: ${rule.label.toLowerCase()}`,
    tier: 'T2',
    engagementId: i.engagementId,
    action: 'filing.recordEvent',
    target: jsonTarget({ ...target, details: i.details ? jsonTarget(cleanDetails(i.details)) : undefined }),
    label: `Company event · ${rule.form}`,
    checked: await check(actx, i),
    source: i.eventId ? { kind: 'record' } : undefined,
  });
}

async function execute(actx: ActionContext, i: Input): Promise<ActionResult> {
  const checked = await check(actx, i);
  if (!checked.canApply) return { ok: false, error: checked.heldReason ?? 'This event cannot be recorded.' };
  const loaded = await loadEngagement(actx.auth, i.engagementId);
  if (!loaded) return { ok: false, error: 'This project is not available.' };
  const today = actx.now.toISOString().slice(0, 10);
  const facts = cleanDetails(i.details);
  const plan = planEvent({ kind: i.kind, occurredOn: i.occurredOn, details: facts });
  const kind = taskKindFor(actx);

  // 1. The task, with the rule's due date.
  let taskId: string;
  if (kind === 'compliance') {
    const task = await createComplianceTask(actx.auth, {
      engagementId: loaded.row.id,
      activityId: null,
      name: plan.taskTitle,
      startDate: plan.dueOn < today ? plan.dueOn : today,
      dueDate: plan.dueOn,
      urgency: plan.days <= 15 ? 'Critical' : 'High',
      visibility: 'firm',
      checklist: [...plan.requestItems.map((r) => `Received: ${r.label}`), ...(plan.resolution ? ['Board resolution drafted and signed'] : []), `${plan.form} filed on the MCA portal; SRN noted`],
    });
    taskId = task.id;
  } else {
    const task = await createWorkTask(actx.auth, {
      engagementId: loaded.row.id,
      title: plan.taskTitle,
      dueAt: plan.dueOn,
      notes: [plan.legalReference, ...plan.notes].join('\n').slice(0, 1000),
      assigneeId: actx.auth.userId,
    });
    taskId = task.id;
  }

  // 2. The client request, as a draft only. A failure leaves the task and the event in place.
  let requestListId: string | null = null;
  try {
    const list = await createRequestList(actx.auth, {
      engagementId: loaded.row.id,
      title: `${plan.form}: ${plan.label}${facts.person ? ` (${facts.person})` : ''}`.slice(0, 200),
      periodLabel: i.occurredOn,
      dueOn: requestDueOn(today, plan),
      cadenceDays: 3,
      items: plan.requestItems.map((r) => ({ kind: r.kind, label: r.label, help: r.help ?? null })),
    });
    requestListId = list.id;
  } catch (err) {
    console.error('[filing.recordEvent] could not draft the request list', err);
  }

  // 3. The event, tracked.
  const source: ComplianceEventSource = i.source ?? (i.eventId ? 'record_change' : actx.via === 'ask' ? 'ask' : 'manual');
  const event = await recordComplianceEvent(
    actx.auth,
    { engagementId: loaded.row.id, kind: i.kind, occurredOn: i.occurredOn, details: facts, source, dueOn: plan.dueOn, taskId, taskKind: kind, requestListId, eventId: i.eventId ?? null },
    actx.now,
  );
  const undo: UndoData = { eventId: event.id, taskId, taskKind: kind, requestListId };
  const drafted = requestListId ? ' and drafted the client request (not sent)' : '; the client request could not be drafted, so add it from the project';
  return { ok: true, summary: `Recorded the event: ${plan.form} due ${plan.dueOn}. Created the task "${plan.taskTitle}"${drafted}`, undo: undo as unknown as JsonValue };
}

async function undo(actx: ActionContext, raw: JsonValue): Promise<ActionResult> {
  const data = raw as unknown as UndoData;
  const event = await setComplianceEventStatus(actx.auth, data.eventId, 'dismissed').catch(() => null);
  if (data.requestListId) await updateRequestList(actx.auth, data.requestListId, { cancel: true }).catch(() => null);
  if (data.taskId && data.taskKind === 'compliance') await changeTaskStage(actx.auth, data.taskId, 'not-applicable').catch(() => null);
  if (data.taskId && data.taskKind === 'work') await updateWorkTask(actx.auth, data.taskId, { status: 'not-applicable' }).catch(() => null);
  return event ? { ok: true, summary: 'Dismissed the event, cancelled the draft request and took the task off the boards' } : { ok: false, error: 'The event is no longer available.' };
}

export const recordEvent = defineAction({
  name: 'filing.recordEvent',
  description:
    'Record a company event that needs an MCA filing (director appointed or resigned, registered office changed, auditor appointed, shares allotted, authorised capital increased, a resolution to file). It creates the filing task with its legal due date and drafts a client document request.',
  capability: 'Record a company event, such as a director resigning, and set up its MCA filing with the due date (after you approve it)',
  input,
  tier: 'T2',
  roles: STAFF_ROLES,
  async preview(actx, i) {
    return previewRecordEvent(actx, i);
  },
  recheck: (actx, i) => check(actx, i),
  execute,
  undo,
});
