import 'server-only';

import { z } from 'zod';
import { getActiveCatalogItems } from '@/data/checklist';
import { applyChecklistPatch, ChecklistPatchRefused } from '@/lib/incorporation/apply-checklist-patch';
import { checklistGateViewerFrom, gateActiveCatalog, getStepGate } from '@/lib/checklist/checklist-step-gate';
import type { JsonValue } from '@/lib/ask/changeset/types';
import { loadEngagement, oneRow, recheckOf, STAFF_ROLES, stepTitle, unavailable } from '../shared';
import { defineAction, type ActionContext, type AnyAction } from '../types';
import { setClientHealth } from './set-client-health';

/**
 * A checklist step's status, set from chat after approval. The write is `applyChecklistPatch`, the
 * screen's own save, so approvals, emails and audit run exactly as they do from the step page.
 */
export const SETTABLE_STATUSES = ['not-started', 'in-progress', 'awaiting-client', 'completed', 'not-applicable'] as const;
type SettableStatus = (typeof SETTABLE_STATUSES)[number];

export const STATUS_WORD: Record<string, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  'awaiting-client': 'Waiting on client',
  completed: 'Done',
  overdue: 'Overdue',
  'not-applicable': 'Not applicable',
};

const setInput = z.object({
  engagementId: z.string().min(1),
  stepId: z.string().min(1),
  value: z.enum(SETTABLE_STATUSES),
});
type SetInput = z.infer<typeof setInput>;

async function check(actx: ActionContext, input: SetInput) {
  const loaded = await loadEngagement(actx.auth, input.engagementId);
  if (!loaded) return unavailable();
  if (!getActiveCatalogItems().some((i) => i.id === input.stepId)) return unavailable('This step is not on the checklist.');
  const old = loaded.state[input.stepId]?.status ?? 'not-started';
  const gate = getStepGate(gateActiveCatalog(loaded.state, checklistGateViewerFrom('admin', actx.auth.role)), input.stepId);
  return recheckOf(
    [
      { rule: 'scope', ok: true },
      old === input.value ? { rule: 'conflict', ok: false, message: `This step is already ${STATUS_WORD[old]}.` } : { rule: 'conflict', ok: true },
      gate.kind === 'locked' && input.value !== 'not-started'
        ? { rule: 'gate', ok: false, message: 'This step has not opened yet; an earlier step must finish first.' }
        : { rule: 'gate', ok: true },
    ],
    { oldValue: old, value: input.value, displayOld: STATUS_WORD[old] ?? old, displayNew: STATUS_WORD[input.value] ?? input.value },
  );
}

const setStep = defineAction({
  name: 'statuses.setStep',
  description: 'Set the status of one checklist step for one client: not started, in progress, waiting on client, done or not applicable.',
  capability: 'Change a checklist step’s status, for example mark it done',
  input: setInput,
  tier: 'T2',
  roles: STAFF_ROLES,
  common: true,
  async preview(actx, input) {
    const loaded = await loadEngagement(actx.auth, input.engagementId);
    return oneRow({
      title: `Step status for ${loaded?.companyName ?? 'this client'}`,
      tier: 'T2',
      engagementId: input.engagementId,
      action: 'statuses.setStep',
      target: { engagementId: input.engagementId, stepId: input.stepId },
      label: stepTitle(input.stepId) ?? 'Step',
      checked: await check(actx, input),
    });
  },
  recheck: (actx, input) => check(actx, input),
  async execute(actx, input) {
    const loaded = await loadEngagement(actx.auth, input.engagementId);
    if (!loaded) return { ok: false, error: 'This project is not available.' };
    const previous = loaded.state[input.stepId]?.status ?? 'not-started';
    try {
      const { checklistState } = await applyChecklistPatch(actx.auth, input.engagementId, input.stepId, { status: input.value });
      const now = checklistState[input.stepId]?.status;
      if (now !== input.value) return { ok: false, error: `The step's rules kept it at ${STATUS_WORD[now ?? previous] ?? now}.` };
    } catch (error) {
      if (error instanceof ChecklistPatchRefused) return { ok: false, error: error.message };
      throw error;
    }
    return { ok: true, summary: `Set ${stepTitle(input.stepId)} to ${STATUS_WORD[input.value]}`, undo: { engagementId: input.engagementId, stepId: input.stepId, previous, applied: input.value } };
  },
  async undo(actx, raw: JsonValue) {
    const undo = raw as { engagementId: string; stepId: string; previous: SettableStatus; applied: SettableStatus };
    const loaded = await loadEngagement(actx.auth, undo.engagementId);
    if (!loaded) return { ok: false, error: 'This project is not available.' };
    if ((loaded.state[undo.stepId]?.status ?? 'not-started') !== undo.applied) {
      return { ok: false, error: 'The status was changed again after this, so it was left as it is.' };
    }
    try {
      await applyChecklistPatch(actx.auth, undo.engagementId, undo.stepId, { status: undo.previous });
    } catch (error) {
      if (error instanceof ChecklistPatchRefused) return { ok: false, error: error.message };
      throw error;
    }
    return { ok: true, summary: `Put ${stepTitle(undo.stepId)} back to ${STATUS_WORD[undo.previous]}` };
  },
});

export const actions: AnyAction[] = [setStep, setClientHealth];
