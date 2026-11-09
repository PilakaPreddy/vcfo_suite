import 'server-only';

import { z } from 'zod';
import { createTask, updateTask } from '@/db/repositories/tasks';
import type { JsonValue } from '@/lib/ask/changeset/types';
import { dayInput, jsonTarget, loadEngagement, oneRow, recheckOf, STAFF_ROLES, unavailable } from '../shared';
import { defineAction, type ActionContext, type AnyAction } from '../types';

/**
 * A task on the Work board, created from chat after the person approves the card. It is the same
 * `createTask` the Work page calls, so scope, assignment history and the search index behave alike.
 */
const createInput = z.object({
  engagementId: z.string().min(1),
  dueAt: dayInput.optional(),
  notes: z.string().trim().max(1000).optional(),
  assignToMe: z.boolean().optional(),
  /** The task title. */
  value: z.string().trim().min(2).max(200),
});
type CreateInput = z.infer<typeof createInput>;

async function check(actx: ActionContext, input: CreateInput) {
  const loaded = await loadEngagement(actx.auth, input.engagementId);
  if (!loaded) return unavailable();
  const today = actx.now.toISOString().slice(0, 10);
  const due = input.dueAt;
  const shown = [input.value, due ? `due ${due}` : null, input.assignToMe ? 'assigned to you' : null].filter(Boolean).join(' · ');
  return recheckOf(
    [
      { rule: 'scope', ok: true },
      due && due < today ? { rule: 'date', ok: false, message: 'The due date is in the past.' } : { rule: 'date', ok: true },
    ],
    { oldValue: '', value: input.value, displayOld: '', displayNew: shown },
  );
}

const create = defineAction({
  name: 'tasks.create',
  description: 'Create a task on the Work board for one client, with an optional due date, and optionally assign it to the person asking.',
  capability: 'Create a task for a client, with a due date',
  input: createInput,
  tier: 'T2',
  roles: STAFF_ROLES,
  common: true,
  async preview(actx, input) {
    const loaded = await loadEngagement(actx.auth, input.engagementId);
    const { value: _value, ...target } = input;
    return oneRow({
      title: `New task for ${loaded?.companyName ?? 'this client'}`,
      tier: 'T2',
      engagementId: input.engagementId,
      action: 'tasks.create',
      target: jsonTarget(target),
      label: 'Task',
      checked: await check(actx, input),
    });
  },
  recheck: (actx, input) => check(actx, input),
  async execute(actx, input) {
    const task = await createTask(actx.auth, {
      engagementId: input.engagementId,
      title: input.value,
      dueAt: input.dueAt ?? null,
      notes: input.notes ?? null,
      assigneeId: input.assignToMe ? actx.auth.userId : null,
    });
    return { ok: true, summary: `Created the task "${task.title ?? input.value}"`, undo: { taskId: task.id } };
  },
  async undo(actx, raw: JsonValue) {
    const { taskId } = raw as { taskId: string };
    // Tasks have no delete; "not applicable" takes it off every board, as the Work page's own cancel does.
    const updated = await updateTask(actx.auth, taskId, { status: 'not-applicable' });
    return updated ? { ok: true, summary: 'Cancelled the task' } : { ok: false, error: 'The task is no longer available.' };
  },
});

export const actions: AnyAction[] = [create];
