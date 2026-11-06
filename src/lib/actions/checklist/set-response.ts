import 'server-only';

import { z } from 'zod';
import type { AuthContext } from '@/auth/guards';
import { checklistStateFromRow, getEngagementById } from '@/db/repositories/engagements';
import { getOwnAskAttachments } from '@/db/repositories/ask-attachments';
import { indexMilestoneUpload } from '@/db/repositories/documents';
import { MILESTONE_DOCUMENTS_BUCKET, milestoneDocumentObjectPath } from '@/lib/documents/milestone-document-storage';
import { applyChecklistPatch, ChecklistPatchRefused } from '@/lib/incorporation/apply-checklist-patch';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import { isRepeatField, removeRepeatEntry, repeatEntries } from '@/lib/checklist/checklist-repeat';
import { getClientResponseFields } from '@/lib/checklist/checklist-responses';
import { checklistGateViewerFrom, gateActiveCatalog, getStepGate } from '@/lib/checklist/checklist-step-gate';
import { getItem } from '@/data/checklist';
import { bucketKey, getObjectBuffer, putObject } from '@/storage/s3';
import type { JsonValue } from '@/lib/ask/changeset/types';
import { defineAction, type ActionContext, type ActionRecheck, type ActionResult } from '../types';
import { checkResponseRow, displayValue, fieldOf, responseKey, rowCanApply, type ResponseTarget } from './rules';

/**
 * Filling one checklist field from an approved card. The write goes through `applyChecklistPatch`,
 * the same code as the screen's save, so audit and notifications run as usual. A lead never saves a
 * client-only answer here either, because that function strips it and the check below notices.
 */

const targetInput = z.object({
  engagementId: z.string().min(1),
  stepId: z.string().min(1),
  fieldId: z.string().min(1),
  group: z.string().min(1).optional(),
  entryId: z.string().min(1).optional(),
  newEntry: z.boolean().optional(),
  needsManager: z.boolean().optional(),
});
const setInput = targetInput.extend({ value: z.string() });
const attachInput = targetInput.extend({ attachmentId: z.string().uuid(), value: z.string() });

type UndoData = { engagementId: string; stepId: string; key: string; previous: string; applied: string; group?: string; entryId?: string; addedEntry?: boolean };

const STAFF = ['super_admin', 'admin', 'manager', 'intern'] as const;

async function loadRow(auth: AuthContext, engagementId: string) {
  const row = await getEngagementById(auth, engagementDbId(engagementId));
  return row ? { row, state: checklistStateFromRow(row) } : null;
}

async function recheck(actx: ActionContext, input: ResponseTarget & { value: string }, pending: Readonly<Record<string, string>>, isFile: boolean): Promise<ActionRecheck> {
  const loaded = await loadRow(actx.auth, input.engagementId);
  if (!loaded) {
    return { checks: [{ rule: 'gate', ok: false, message: 'This project is not available.' }], heldReason: 'This project is not available.', canApply: false, oldValue: '', value: input.value, displayOld: '', displayNew: '', sensitive: false };
  }
  const result = checkResponseRow({ role: actx.auth.role, target: input, value: input.value, state: loaded.state, pending, engagement: loaded.row, isFile });
  const options = fieldOf(input)?.options;
  return {
    checks: result.checks,
    heldReason: result.heldReason,
    canApply: rowCanApply(result.checks),
    oldValue: result.oldValue,
    value: result.value,
    displayOld: isFile ? (result.oldValue ? 'A file is already attached' : '') : displayValue(result.oldValue, result.sensitive, options),
    displayNew: isFile ? input.value : displayValue(result.value, result.sensitive, options),
    sensitive: !isFile && result.sensitive,
  };
}

async function save(actx: ActionContext, input: ResponseTarget, value: string): Promise<ActionResult> {
  const loaded = await loadRow(actx.auth, input.engagementId);
  if (!loaded) return { ok: false, error: 'This project is not available.' };
  const saved = loaded.state[input.stepId]?.responses ?? {};
  const key = responseKey(input);
  const responses: Record<string, string> = { [key]: value };
  let addedEntry = false;
  if (input.group && input.entryId) {
    const ids = (saved[input.group] ?? '').split(',').filter(Boolean);
    if (!ids.includes(input.entryId)) {
      responses[input.group] = [...ids, input.entryId].join(',');
      addedEntry = true;
    }
  }
  try {
    const { checklistState } = await applyChecklistPatch(actx.auth, input.engagementId, input.stepId, { responses });
    if (checklistState[input.stepId]?.responses?.[key] !== value) return { ok: false, error: 'This person cannot fill this field.' };
  } catch (error) {
    if (error instanceof ChecklistPatchRefused) return { ok: false, error: error.message };
    throw error;
  }
  const undo: UndoData = {
    engagementId: input.engagementId,
    stepId: input.stepId,
    key,
    previous: saved[key] ?? '',
    applied: value,
    ...(input.group && input.entryId ? { group: input.group, entryId: input.entryId, addedEntry } : {}),
  };
  return { ok: true, summary: `Saved ${key}`, undo };
}

async function undoSave(actx: ActionContext, raw: JsonValue): Promise<ActionResult> {
  const undo = raw as unknown as UndoData;
  const loaded = await loadRow(actx.auth, undo.engagementId);
  if (!loaded) return { ok: false, error: 'This project is not available.' };
  const gate = getStepGate(gateActiveCatalog(loaded.state, checklistGateViewerFrom('admin', actx.auth.role)), undo.stepId);
  if (gate.kind === 'done') return { ok: false, error: 'This step is finished, so the value stays until it is reopened.' };
  const saved = loaded.state[undo.stepId]?.responses ?? {};
  if ((saved[undo.key] ?? '') !== undo.applied) return { ok: false, error: 'This value was changed after it was saved, so it was left as it is.' };
  let responses: Record<string, string> = { [undo.key]: undo.previous };
  if (undo.addedEntry && undo.group && undo.entryId) {
    const item = getItem(undo.stepId);
    const group = item ? getClientResponseFields(item).find((f) => f.id === undo.group) : undefined;
    if (group && isRepeatField(group)) {
      const merged = { ...saved, ...responses };
      const entry = repeatEntries(merged, group).find((e) => e.id === undo.entryId);
      if (entry && Object.values(entry.values).every((v) => !v?.trim())) responses = removeRepeatEntry(merged, group, undo.entryId);
    }
  }
  try {
    await applyChecklistPatch(actx.auth, undo.engagementId, undo.stepId, { responses });
  } catch (error) {
    if (error instanceof ChecklistPatchRefused) return { ok: false, error: error.message };
    throw error;
  }
  return { ok: true, summary: `Undid ${undo.key}` };
}

function previewOf(label: string, action: string, input: ResponseTarget & { value: string }, checked: ActionRecheck) {
  const { value: _value, ...target } = input;
  return {
    title: label,
    tier: 'T2' as const,
    engagementId: input.engagementId,
    rows: [
      {
        action,
        target: { ...target },
        label,
        oldValue: checked.oldValue,
        newValue: checked.value,
        displayOld: checked.displayOld,
        displayNew: checked.displayNew,
        sensitive: checked.sensitive,
        source: null,
        checks: checked.checks,
        ...(checked.heldReason ? { heldReason: checked.heldReason } : {}),
      },
    ],
  };
}

export const setResponse = defineAction({
  name: 'checklist.setResponse',
  description: 'Fill one answer on an incorporation checklist step, after a person approves it on a review card.',
  input: setInput,
  tier: 'T2',
  roles: STAFF,
  common: true,
  async preview(actx, input) {
    return previewOf(fieldOf(input)?.label ?? input.fieldId, 'checklist.setResponse', input, await recheck(actx, input, {}, false));
  },
  recheck: (actx, input, pending) => recheck(actx, input, pending, false),
  async execute(actx, input) {
    const { value, ...target } = input;
    return save(actx, target, value);
  },
  undo: undoSave,
});

export const attachFile = defineAction({
  name: 'checklist.attachFile',
  description: 'Attach a file from the chat to an upload field on an incorporation checklist step, after a person approves it.',
  input: attachInput,
  tier: 'T2',
  roles: STAFF,
  async preview(actx, input) {
    return previewOf(fieldOf(input)?.label ?? input.fieldId, 'checklist.attachFile', input, await recheck(actx, input, {}, true));
  },
  recheck: (actx, input, pending) => recheck(actx, input, pending, true),
  async execute(actx, input) {
    const { value: _value, ...target } = input;
    const [attachment] = await getOwnAskAttachments(actx.auth, [input.attachmentId]);
    const bytes = attachment?.s3Key ? await getObjectBuffer(attachment.s3Key) : null;
    if (!attachment || !bytes) return { ok: false, error: 'The file is no longer available.' };
    const key = responseKey(input);
    const path = milestoneDocumentObjectPath(input.engagementId, key, attachment.fileName);
    await putObject(bucketKey(MILESTONE_DOCUMENTS_BUCKET, path), bytes, attachment.contentType ?? undefined);
    await indexMilestoneUpload(actx.auth, {
      engagementId: input.engagementId,
      fieldId: key,
      fileName: attachment.fileName,
      objectKey: path,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      stepId: input.stepId,
    });
    return save(actx, target, path);
  },
  undo: undoSave,
});
