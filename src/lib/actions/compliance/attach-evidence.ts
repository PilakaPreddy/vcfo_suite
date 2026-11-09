import 'server-only';

import { z } from 'zod';
import { addTaskAttachment, ComplianceTaskError, getTask, markTaskDeliverable, removeTaskAttachment, TASK_ATTACHMENT_MAX_BYTES, type TaskDetailDto } from '@/db/repositories/compliance-tasks';
import type { JsonValue, RowCheck } from '@/lib/ask/changeset/types';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import { formatUploadFileSize } from '@/lib/upload-limits';
import { copyAskAttachment, findAskAttachment, jsonTarget, loadEngagement, oneRow, recheckOf, STAFF_ROLES, unavailable } from '../shared';
import { defineAction, type ActionContext, type ActionRecheck, type ActionResult } from '../types';

/**
 * A file from the chat attached to a compliance task as its deliverable (the evidence the work was
 * done, for example a filed GST return). It is the same `addTaskAttachment` the task drawer calls,
 * with `deliverable: true`, so the task's history and the one-deliverable rule behave alike.
 */

const input = z.object({
  engagementId: z.string().min(1),
  taskId: z.string().uuid(),
  attachmentId: z.string().uuid(),
  /** The file name, shown on the card. */
  value: z.string(),
});
type Input = z.infer<typeof input>;

interface UndoData {
  taskId: string;
  taskAttachmentId: string;
  /** The deliverable this file replaced, marked again on undo. Absent on rows applied before it was kept. */
  previousDeliverableId?: string | null;
}

const TOO_LARGE = `A task file can be at most ${formatUploadFileSize(TASK_ATTACHMENT_MAX_BYTES)}.`;

async function loadTask(actx: ActionContext, i: Input): Promise<TaskDetailDto | null> {
  try {
    const task = await getTask(actx.auth, i.taskId);
    return engagementDbId(task.engagementId) === engagementDbId(i.engagementId) ? task : null;
  } catch (error) {
    if (error instanceof ComplianceTaskError) return null;
    throw error;
  }
}

async function check(actx: ActionContext, i: Input): Promise<ActionRecheck> {
  const loaded = await loadEngagement(actx.auth, i.engagementId);
  if (!loaded) return unavailable();
  const task = await loadTask(actx, i);
  if (!task) return unavailable('This task is not available.');
  const checks: RowCheck[] = [{ rule: 'scope', ok: true }];
  checks.push(task.can.upload ? { rule: 'owner', ok: true } : { rule: 'owner', ok: false, message: 'Held: you cannot add files to this task.' });
  const file = await findAskAttachment(actx, i.attachmentId);
  if (!file) checks.push({ rule: 'file', ok: false, message: 'Held: the file is no longer available.' });
  else if (file.sizeBytes > TASK_ATTACHMENT_MAX_BYTES) checks.push({ rule: 'file', ok: false, message: `Held: ${TOO_LARGE}` });
  else checks.push({ rule: 'file', ok: true });
  const title = task.periodLabel ? `${task.name} (${task.periodLabel})` : task.name;
  return recheckOf(checks, {
    oldValue: task.deliverable?.fileName ?? '',
    value: i.value,
    displayOld: task.deliverable ? `Deliverable now: ${task.deliverable.fileName}` : '',
    displayNew: `${i.value} as the deliverable on ${title} for ${loaded.companyName}`,
  });
}

async function execute(actx: ActionContext, i: Input): Promise<ActionResult> {
  const task = await loadTask(actx, i);
  if (!task) return { ok: false, error: 'This task is not available.' };
  const file = await copyAskAttachment(actx, i.attachmentId);
  if (!file) return { ok: false, error: 'The file is no longer available.' };
  if (file.sizeBytes > TASK_ATTACHMENT_MAX_BYTES) return { ok: false, error: TOO_LARGE };
  try {
    const previousDeliverableId = task.deliverable?.id ?? null;
    const added = await addTaskAttachment(actx.auth, task.id, { name: file.fileName, type: file.contentType ?? '', bytes: file.bytes }, { deliverable: true });
    const undo: UndoData = { taskId: task.id, taskAttachmentId: added.id, previousDeliverableId };
    return { ok: true, summary: `Attached ${added.fileName} to ${task.name}`, undo: undo as unknown as JsonValue };
  } catch (error) {
    if (error instanceof ComplianceTaskError) return { ok: false, error: error.code === 'file_size' ? TOO_LARGE : 'This task did not take the file.' };
    throw error;
  }
}

/**
 * Removes the file the card added and marks the deliverable it replaced again. When that earlier file
 * has since been removed, the removal still counts as undone and the summary says so.
 */
async function undo(actx: ActionContext, raw: JsonValue): Promise<ActionResult> {
  const data = raw as unknown as UndoData;
  try {
    await removeTaskAttachment(actx.auth, data.taskId, data.taskAttachmentId);
    if (data.previousDeliverableId) {
      try {
        await markTaskDeliverable(actx.auth, data.taskId, data.previousDeliverableId);
        return { ok: true, summary: 'Removed the file from the task and marked the earlier deliverable again' };
      } catch (error) {
        if (!(error instanceof ComplianceTaskError)) throw error;
        return { ok: true, summary: 'Removed the file from the task; the earlier deliverable is no longer there' };
      }
    }
    return { ok: true, summary: 'Removed the file from the task' };
  } catch (error) {
    if (error instanceof ComplianceTaskError) return { ok: false, error: error.code === 'forbidden' ? 'You cannot remove this file.' : 'The file is no longer on the task.' };
    throw error;
  }
}

export const attachEvidence = defineAction({
  name: 'compliance.attachEvidence',
  description: 'Attach a file from the chat to a compliance task as its deliverable (evidence the filing was done), after a person approves it.',
  capability: 'Attach a filed return or other evidence from the chat to a compliance task (after you approve it)',
  input,
  tier: 'T2',
  roles: STAFF_ROLES,
  async preview(actx, i) {
    const checked = await check(actx, i);
    const { value: _value, ...target } = i;
    return oneRow({
      title: 'Compliance evidence',
      tier: 'T2',
      engagementId: i.engagementId,
      action: 'compliance.attachEvidence',
      target: jsonTarget(target),
      label: 'Task deliverable',
      checked,
      source: { kind: 'attachment', attachmentId: i.attachmentId, fileName: i.value },
    });
  },
  recheck: (actx, i) => check(actx, i),
  execute,
  undo,
});
