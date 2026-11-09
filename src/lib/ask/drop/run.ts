import 'server-only';

import { randomUUID } from 'node:crypto';
import type { AuthContext } from '@/auth/guards';
import type { AnswerEnvelope } from '@/data/ask/schema';
import {
  createAskAttachment,
  getOwnAskAttachments,
  listAskRunAttachments,
  updateOwnAskAttachment,
  type AskAttachmentRow,
} from '@/db/repositories/ask-attachments';
import { appendAskMessage } from '@/db/repositories/ask-messages';
import { appendAskRunStep, askRunActor, updateAskRun, type AskRunRow } from '@/db/repositories/ask-runs';
import type { JsonValue } from '@/lib/ask/changeset/types';
import { readFile, readPaste, ReadRefused } from '@/lib/ask/data-router/read';
import type { ReadResult } from '@/lib/ask/data-router/types';
import { createRunContext, RUN_OVER_BUDGET_COPY, RunOverBudget } from '@/lib/ask/do/run-context';
import { maskIdentityNumbers } from '@/lib/ask/mask';
import { DROP_MAX_BYTES, DROP_MAX_FILES } from '@/lib/upload-limits';
import { getObjectBuffer, putObject } from '@/storage/s3';
import { assembleDrop, type DropRead } from './assemble';
import { dropSummaryLine, NOT_READ_BUDGET } from './summary';
import { dropContentType, dropFileRefusal, isZipName, safeFileName } from './extensions';
import { ASK_DROP_EVENT, DROP_WORKFLOW, emptyDropState, type DropFile, type DropState } from './types';
import { DEFAULT_UNZIP_LIMITS, unzipDrop, UnzipRefused } from './unzip';

/**
 * The drop job's work, one function per step: unpack the ZIPs, read each file, sort them into cards,
 * and write the closing message. `src/jobs/ask-drop.ts` runs each as an Inngest step, so a retry
 * repeats only the step that failed; `runAskDrop` runs them one after another when no Inngest is
 * reachable.
 *
 * Every step rebuilds the owner's AuthContext from the run (`askRunActor`) and reads and writes only
 * through repositories with it, so the job reaches exactly what the person could. Each step reads the
 * run's state fresh and writes it back, and a step that finds its work already done does nothing.
 *
 * What a file read is kept in storage beside the file (`reads/<attachment>.json`), never in the run
 * row or in Inngest's step results: the run row is masked, so it cannot carry an identity number to
 * the card, and step results leave our infrastructure. The stored read holds nothing the file itself
 * does not.
 */

export { ASK_DROP_EVENT, dropSummaryLine };


/** A drop run's state, with every field present. */
export function dropStateOf(run: Pick<AskRunRow, 'state'>): DropState {
  const raw = (run.state ?? null) as unknown as Partial<DropState> | null;
  return { ...emptyDropState(), ...(raw ?? {}) };
}

const asJson = (state: DropState) => state as unknown as JsonValue;

function readKey(ctx: AuthContext, runId: string, attachmentId: string): string {
  return `ask/attachments/${ctx.userId}/drops/${runId}/reads/${attachmentId}.json`;
}

/** The owner's context and the run, only for a drop the job may still work on. */
async function openDrop(runId: string): Promise<{ ctx: AuthContext; run: AskRunRow; state: DropState } | null> {
  const found = await askRunActor(runId);
  if (!found || found.run.workflow !== DROP_WORKFLOW) return null;
  if (found.run.status !== 'queued' && found.run.status !== 'running') return null;
  return { ...found, state: dropStateOf(found.run) };
}

function pathOf(row: AskAttachmentRow): string {
  if (row.kind === 'paste') return 'Pasted text';
  return row.relativePath?.trim() || row.fileName;
}

/** The folder a ZIP's entries are filed under: its own path without `.zip`. */
function zipFolder(zip: AskAttachmentRow): string {
  return pathOf(zip).replace(/\.zip$/i, '');
}

/**
 * Step 1. Unpacks every ZIP of the drop into rows of its own (with `parent_id` and the path inside
 * the ZIP) within what is left of the drop's 50 files and 200 MB, then lists every file to read.
 * Returns the attachment ids still to read, in order, or null when the drop is not to be worked on.
 */
export async function dropUnpackStep(runId: string): Promise<string[] | null> {
  const open = await openDrop(runId);
  if (!open) return null;
  const { ctx, run, state } = open;
  if (run.status === 'queued') await updateAskRun(ctx, runId, { status: 'running' });

  const rows = await listAskRunAttachments(ctx, runId);
  const zips = rows.filter((r) => !r.parentId && r.kind === 'file' && isZipName(r.fileName));
  const plain = rows.filter((r) => !r.parentId && !zips.includes(r));
  const used = { files: plain.length, bytes: plain.reduce((sum, r) => sum + r.sizeBytes, 0) };
  const skipped: DropFile[] = [];

  for (const zip of zips) {
    const children = rows.filter((r) => r.parentId === zip.id);
    used.files += children.length;
    used.bytes += children.reduce((sum, r) => sum + r.sizeBytes, 0);
    if (zip.status !== 'uploaded') continue; // unpacked, or refused, on an earlier try
    const bytes = zip.s3Key ? await getObjectBuffer(zip.s3Key) : null;
    try {
      if (!bytes) throw new UnzipRefused('That ZIP file is no longer available. Please drop it again.');
      const { entries, skipped: zipSkipped } = unzipDrop(bytes, {
        ...DEFAULT_UNZIP_LIMITS,
        maxEntries: Math.max(0, DROP_MAX_FILES - used.files),
        maxTotalBytes: Math.max(0, DROP_MAX_BYTES - used.bytes),
      });
      const done = new Set(children.map((c) => c.relativePath));
      const folder = zipFolder(zip);
      for (const entry of entries) {
        const relativePath = `${folder}/${entry.path}`;
        if (done.has(relativePath)) continue;
        const refusal = dropFileRefusal(entry.fileName);
        if (refusal) {
          skipped.push({ attachmentId: zip.id, path: relativePath, size: entry.data.length, status: 'skipped', reason: refusal });
          continue;
        }
        const fileName = safeFileName(entry.fileName);
        const contentType = dropContentType(fileName);
        const s3Key = `ask/attachments/${ctx.userId}/${randomUUID()}/${fileName}`;
        await putObject(s3Key, entry.data, contentType);
        await createAskAttachment(ctx, {
          kind: 'file',
          fileName,
          contentType,
          sizeBytes: entry.data.length,
          s3Key,
          conversationId: run.conversationId,
          runId,
          relativePath,
          parentId: zip.id,
        });
        used.files += 1;
        used.bytes += entry.data.length;
      }
      for (const skip of zipSkipped) skipped.push({ attachmentId: zip.id, path: `${folder}/${skip.path}`, size: 0, status: 'skipped', reason: skip.reason });
      await updateOwnAskAttachment(ctx, zip.id, { status: 'read', docType: 'zip' });
      await appendAskRunStep(ctx, runId, { kind: 'tool', name: 'unpack', label: 'Unpacking', output: { entries: entries.length, skipped: zipSkipped.length } });
    } catch (error) {
      const reason = error instanceof UnzipRefused ? error.message : 'This ZIP file could not be unpacked.';
      if (!(error instanceof UnzipRefused)) console.error('[ask-vcfo] unzip failed', maskIdentityNumbers(String(error)));
      await updateOwnAskAttachment(ctx, zip.id, { status: 'failed', error: reason });
      skipped.push({ attachmentId: zip.id, path: pathOf(zip), size: zip.sizeBytes, status: 'failed', reason });
    }
  }

  // The file list: every file but the unpacked ZIPs themselves, keeping what an earlier try learnt.
  // Keyed on the masked path, because the stored state is masked.
  const keyOf = (f: { attachmentId: string; path: string }) => `${f.attachmentId}|${maskIdentityNumbers(f.path)}`;
  const known = new Map(state.files.map((f) => [keyOf(f), f]));
  const fresh = await listAskRunAttachments(ctx, runId);
  const files: DropFile[] = [];
  for (const row of fresh) {
    if (row.kind === 'file' && isZipName(row.fileName) && !row.parentId) continue;
    const path = pathOf(row);
    const before = known.get(keyOf({ attachmentId: row.id, path }));
    if (before) {
      files.push(before);
      continue;
    }
    const refusal = row.kind === 'file' ? dropFileRefusal(row.fileName) : null;
    files.push({ attachmentId: row.id, path, size: row.sizeBytes, status: refusal ? 'skipped' : 'queued', ...(refusal ? { reason: refusal } : {}) });
  }
  for (const skip of skipped) if (!known.has(keyOf(skip))) files.push(skip);
  const listed = new Set(files.map(keyOf));
  for (const before of state.files) if (!listed.has(keyOf(before))) files.push(before);

  const toRead = files.filter((f) => f.status === 'queued').map((f) => f.attachmentId);
  const total = files.filter((f) => f.status !== 'skipped' && f.status !== 'failed').length;
  const next: DropState = { ...state, files, progress: { done: total - toRead.length, total, label: toRead.length > 0 ? 'Reading…' : 'Sorting…' } };
  await updateAskRun(ctx, runId, { state: asJson(next) });
  return toRead;
}

/** Step 2, once per file. Reads it with the run's budget and keeps the read beside the file. */
export async function dropReadStep(runId: string, attachmentId: string): Promise<DropFile['status'] | null> {
  const open = await openDrop(runId);
  if (!open) return null;
  const { ctx, run, state } = open;
  const file = state.files.find((f) => f.attachmentId === attachmentId && f.status === 'queued');
  if (!file) return state.files.find((f) => f.attachmentId === attachmentId)?.status ?? null;

  const runCtx = createRunContext({ ctx, run, now: new Date() });
  const save = async (patch: Partial<DropFile>, flags: Partial<DropState> = {}) => {
    Object.assign(file, patch);
    const done = Math.min(state.progress.done + 1, state.progress.total);
    const next: DropState = { ...state, ...flags, progress: { ...state.progress, done, label: `Read ${done} of ${state.progress.total}` } };
    await runCtx.recordUsage();
    await runCtx.close('running', { state: asJson(next) });
  };

  if (runCtx.spentTokens() >= run.budgetTokens) {
    await save({ status: 'skipped', reason: NOT_READ_BUDGET }, { overBudget: true });
    return 'skipped';
  }
  const [attachment] = await getOwnAskAttachments(ctx, [attachmentId]);
  try {
    if (!attachment?.s3Key) throw new ReadRefused('That file is no longer available. Please drop it again.');
    const bytes = await getObjectBuffer(attachment.s3Key);
    if (!bytes) throw new ReadRefused('That file is no longer available. Please drop it again.');
    const result: ReadResult = attachment.kind === 'paste'
      ? await readPaste(bytes.toString('utf8'), runCtx.deps)
      : await readFile({ fileName: attachment.fileName, data: bytes }, runCtx.deps);
    await putObject(readKey(ctx, runId, attachmentId), JSON.stringify(result), 'application/json');
    await updateOwnAskAttachment(ctx, attachmentId, { status: 'read', docType: result.docType, sensitive: result.sensitive });
    await appendAskRunStep(ctx, runId, { kind: result.usedModel ? 'model' : 'tool', name: 'read', label: 'Reading', output: { path: file.path, docType: result.docType, values: result.values.length } });
    await save({ status: 'read', docType: result.docType });
    return 'read';
  } catch (error) {
    if (error instanceof RunOverBudget) {
      await save({ status: 'skipped', reason: NOT_READ_BUDGET }, { overBudget: true });
      return 'skipped';
    }
    const known = error instanceof ReadRefused;
    if (!known) console.error('[ask-vcfo] drop read failed', maskIdentityNumbers(error instanceof Error ? (error.stack ?? error.message) : String(error)));
    const reason = maskIdentityNumbers(known ? error.message : 'This file could not be read.');
    if (attachment) await updateOwnAskAttachment(ctx, attachmentId, { status: 'failed', error: reason });
    await save({ status: 'failed', reason });
    return 'failed';
  }
}

/**
 * What was read from each of these files, from storage. A file whose stored read is gone is marked
 * failed in place, so the caller's state says so.
 */
export async function loadDropReads(ctx: AuthContext, runId: string, files: DropFile[]): Promise<DropRead[]> {
  const readFiles = files.filter((f) => f.status === 'read');
  const rows = await getOwnAskAttachments(ctx, readFiles.map((f) => f.attachmentId));
  const reads: DropRead[] = [];
  for (const file of readFiles) {
    const attachment = rows.find((r) => r.id === file.attachmentId);
    const stored = attachment ? await getObjectBuffer(readKey(ctx, runId, file.attachmentId)) : null;
    if (!attachment || !stored) {
      Object.assign(file, { status: 'failed', reason: 'What was read from this file is no longer available. Please drop it again.' });
      continue;
    }
    reads.push({ attachment: { id: attachment.id, kind: attachment.kind, fileName: attachment.fileName }, path: file.path, result: JSON.parse(stored.toString('utf8')) as ReadResult });
  }
  return reads;
}

/** Step 3. Sorts what was read into review cards, through `assembleDrop`. */
export async function dropAssembleStep(runId: string): Promise<{ groups: number; unplaced: number } | null> {
  const open = await openDrop(runId);
  if (!open) return null;
  const { ctx, run, state } = open;
  if (state.groups.length > 0 || state.unplaced.length > 0) return { groups: state.groups.length, unplaced: state.unplaced.length };
  const runCtx = createRunContext({ ctx, run, now: new Date() });

  const reads = await loadDropReads(ctx, runId, state.files);

  let next: DropState = { ...state, progress: { ...state.progress, label: 'Sorting…' } };
  try {
    const result = await assembleDrop({ runCtx, conversationId: run.conversationId, instruction: state.instruction, page: state.page, reads, files: state.files, now: new Date() });
    next = {
      ...next,
      files: result.files,
      groups: result.groups,
      unplaced: result.unplaced,
      notes: result.notes.map(maskIdentityNumbers),
      ...(result.overBudget ? { overBudget: true } : {}),
    };
  } catch (error) {
    if (!(error instanceof RunOverBudget)) throw error;
    next = { ...next, overBudget: true, notes: [RUN_OVER_BUDGET_COPY] };
  }
  await runCtx.recordUsage();
  await runCtx.close('running', { state: asJson(next) });
  return { groups: next.groups.length, unplaced: next.unplaced.length };
}

/**
 * The status a drop settles in. A drop with files still waiting for "Where should these go?" waits
 * for the reply even when it already made cards, because the reply is how those files are placed;
 * the cards are open either way.
 */
export function dropStatus(state: DropState): string {
  if (state.overBudget) return 'over_budget';
  if (state.unplaced.length > 0) return 'waiting_reply';
  if (state.groups.length > 0) return 'waiting_approval';
  return state.files.some((f) => f.status === 'placed' || f.status === 'read' || f.status === 'skipped') ? 'done' : 'failed';
}

/** Step 4. Writes the closing message into the conversation and settles the run's status. */
export async function dropFinishStep(runId: string): Promise<{ status: string } | null> {
  const open = await openDrop(runId);
  if (!open) return null;
  const { ctx, run, state } = open;
  const status = dropStatus(state);
  const next: DropState = { ...state, progress: { ...state.progress, done: state.progress.total, label: 'Done' } };
  if (!next.answerMessageId && run.conversationId) {
    const text = dropSummaryLine(state, { role: ctx.role });
    const answer: AnswerEnvelope = {
      line: text,
      citations: [],
      actions: [],
      origin: 'work',
      depth: 'normal',
      runId,
      ...(state.groups[0] ? { changesetId: state.groups[0].changesetId } : {}),
    };
    const message = await appendAskMessage(ctx, run.conversationId, { sender: 'assistant', text, answer, origin: 'work', path: 'fixed_workflow' });
    if (message) next.answerMessageId = message.id;
  }
  const open_ = status === 'waiting_approval' || status === 'waiting_reply';
  await updateAskRun(ctx, runId, { status, state: asJson(next), ...(open_ ? {} : { finishedAt: new Date() }) });
  return { status };
}

/** After the job gave up: the run is failed, and the person is told in the chat. */
export async function failAskDrop(runId: string, error: unknown): Promise<void> {
  const found = await askRunActor(runId);
  if (!found || found.run.workflow !== DROP_WORKFLOW) return;
  const { ctx, run } = found;
  if (run.status !== 'queued' && run.status !== 'running') return;
  console.error('[ask-vcfo] drop failed', runId, maskIdentityNumbers(error instanceof Error ? (error.stack ?? error.message) : String(error)));
  const state = dropStateOf(run);
  const text = 'Something went wrong while I was working through these files, so I stopped. Nothing was saved. Please try the drop again.';
  if (!state.answerMessageId && run.conversationId) {
    const message = await appendAskMessage(ctx, run.conversationId, {
      sender: 'assistant',
      text,
      answer: { line: text, citations: [], actions: [], origin: 'work', depth: 'normal', runId },
      origin: 'work',
      path: 'fixed_workflow',
    });
    if (message) state.answerMessageId = message.id;
  }
  await updateAskRun(ctx, runId, { status: 'failed', error: 'drop job failed', state: asJson(state), finishedAt: new Date() });
}

/** The whole drop in this process, step after step, for when no Inngest is reachable. */
export async function runAskDrop(runId: string): Promise<{ status: string } | null> {
  try {
    const toRead = await dropUnpackStep(runId);
    if (toRead === null) return null;
    for (const attachmentId of toRead) await dropReadStep(runId, attachmentId);
    await dropAssembleStep(runId);
    return await dropFinishStep(runId);
  } catch (error) {
    await failAskDrop(runId, error).catch((inner) => console.error('[ask-vcfo] drop failure not recorded', inner));
    return { status: 'failed' };
  }
}

/**
 * Queues a drop on Inngest; when no Inngest is reachable (local dev, or cloud keys not yet set) it
 * runs in this process, so a drop never sits in "queued" for ever. The profile id is in the event
 * only for the job's one-drop-at-a-time-per-person concurrency key.
 */
export async function queueAskDrop(runId: string, opts: { profileId?: string } = {}): Promise<'queued' | 'inline'> {
  try {
    const { inngest } = await import('@/jobs/client');
    await inngest.send({ name: ASK_DROP_EVENT, data: { runId, ...(opts.profileId ? { profileId: opts.profileId } : {}) } });
    return 'queued';
  } catch (error) {
    console.warn('[ask-vcfo] inngest unavailable; running the drop inline', error);
    void runAskDrop(runId);
    return 'inline';
  }
}
