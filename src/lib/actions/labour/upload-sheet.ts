import 'server-only';

import { z } from 'zod';
import { stateByCode } from '@/data/labour-registers/states';
import {
  getBatch,
  getColumnMap,
  listBatches,
  listUploads,
  openBatch,
  removeUpload,
  restoreUpload,
  uploadSnapshot,
  type BatchRow,
  type UploadSnapshot,
} from '@/db/repositories/labour-registers';
import type { JsonValue, RowCheck } from '@/lib/ask/changeset/types';
import { gridIndices } from '@/lib/labour-registers/attendance-grid';
import { formsFor, inputFields } from '@/lib/labour-registers/catalogue';
import { CLOSED_PERIOD_MESSAGE, ingestRegisterUpload, readRegisterSheet, RegisterUploadRefused, type RegisterSheetSummary } from '@/lib/labour-registers/ingest-upload';
import { matchColumns, matchSummary } from '@/lib/labour-registers/match';
import { normaliseHeader } from '@/lib/labour-registers/normalise';
import { guessSlot, UPLOAD_SLOTS, type UploadSlot } from '@/lib/labour-registers/parse';
import { periodLabel } from '@/lib/labour-registers/storage';
import { deleteObject } from '@/storage/s3';
import { copyAskAttachment, dayInput, jsonTarget, loadEngagement, oneRow, recheckOf, STAFF_ROLES, unavailable } from '../shared';
import { defineAction, type ActionContext, type ActionRecheck, type ActionResult } from '../types';

/**
 * A payroll, attendance, overtime, employee or leave sheet from the chat, filed into one client's
 * labour register for one state and period. It runs the same code as the batch screen's upload
 * (`openBatch`, then `ingestRegisterUpload`), so a closed period refuses it here as it does there.
 *
 * The card shows what the batch screen would show after the upload (the sheet's rows and headings
 * and how its columns match the mapping remembered for this client), so the person sees whether the
 * right file is going to the right month before anything is stored.
 */

const input = z.object({
  engagementId: z.string().min(1),
  stateCode: z.string().trim().min(2).max(3),
  periodFrom: dayInput,
  periodTo: dayInput,
  slot: z.enum(UPLOAD_SLOTS),
  attachmentId: z.string().uuid(),
  /** The state was not found in the file or an earlier batch; it is the registered office's. */
  stateAssumed: z.boolean().optional(),
  /** The file name, shown on the card. */
  value: z.string(),
});
type Input = z.infer<typeof input>;

interface UndoData {
  batchId: string;
  slot: UploadSlot;
  uploadId: string;
  sha256: string;
  objectKey: string;
  previous: UploadSnapshot | null;
}

export const SLOT_LABEL: Record<UploadSlot, string> = {
  paysheet: 'Paysheet',
  attendance: 'Attendance',
  overtime: 'Overtime',
  employees: 'Employee list',
  leave: 'Leave',
};

/** The batch screen for this role; the super admin's sits under the practice area. */
function registerHref(role: string, batchId: string): string {
  const base = role === 'super_admin' ? '/app/super/practice' : `/app/${role}`;
  return `${base}/labour-registers?batch=${batchId}`;
}

/*
 * Reading a sheet costs a download and a parse, and a card rechecks every row each time one is
 * edited. A chat attachment never changes, so its summary is kept for a while by id.
 */
const SHEET_CACHE = new Map<string, RegisterSheetSummary>();
const SHEET_CACHE_SIZE = 32;

async function readSheet(actx: ActionContext, attachmentId: string): Promise<{ summary: RegisterSheetSummary } | { error: string }> {
  const cached = SHEET_CACHE.get(attachmentId);
  if (cached) return { summary: cached };
  const file = await copyAskAttachment(actx, attachmentId);
  if (!file) return { error: 'The file is no longer available.' };
  try {
    const { summary } = await readRegisterSheet(file.bytes, file.fileName);
    if (SHEET_CACHE.size >= SHEET_CACHE_SIZE) SHEET_CACHE.delete(SHEET_CACHE.keys().next().value as string);
    SHEET_CACHE.set(attachmentId, summary);
    return { summary };
  } catch (error) {
    if (error instanceof RegisterUploadRefused) return { error: error.message };
    throw error;
  }
}

async function findBatch(actx: ActionContext, i: Input): Promise<BatchRow | null> {
  const batches = await listBatches(actx.auth, { engagementId: i.engagementId });
  return batches.find((b) => b.stateCode === i.stateCode && b.periodFrom === i.periodFrom && b.periodTo === i.periodTo) ?? null;
}

/** "14 of 16 columns matched, 12 remembered from the last filing, 2 to confirm". */
async function columnLine(actx: ActionContext, i: Input, headers: string[], grid: RegisterSheetSummary['grid']): Promise<string> {
  const fields = inputFields(formsFor(i.stateCode, { from: i.periodFrom, to: i.periodTo }));
  if (fields.length === 0) return '';
  const stored = await getColumnMap(actx.auth, i.engagementId, i.slot);
  const remembered = Object.fromEntries(Object.entries((stored?.mapping ?? {}) as Record<string, string>).map(([field, heading]) => [field, normaliseHeader(heading)]));
  const exclude = grid ? gridIndices(grid) : [];
  const matches = matchColumns({ fields, headers, remembered, exclude });
  const summary = matchSummary(matches);
  const fromMap = matches.filter((m) => m.reason === 'remembered from last filing').length;
  const parts = [`${summary.auto} of ${fields.length} columns matched`];
  if (stored) parts.push(fromMap > 0 ? `${fromMap} from the saved column map` : 'none from the saved column map');
  if (summary.suggested > 0) parts.push(`${summary.suggested} to confirm`);
  return parts.join(', ');
}

async function check(actx: ActionContext, i: Input): Promise<ActionRecheck> {
  const loaded = await loadEngagement(actx.auth, i.engagementId);
  if (!loaded) return unavailable();
  const checks: RowCheck[] = [{ rule: 'scope', ok: true }];

  const state = stateByCode(i.stateCode);
  checks.push(state ? { rule: 'state', ok: true } : { rule: 'state', ok: false, message: 'Held: choose the state for this register.' });
  checks.push(i.periodFrom <= i.periodTo ? { rule: 'period', ok: true } : { rule: 'period', ok: false, message: 'Held: the period ends before it starts.' });

  const batch = await findBatch(actx, i);
  checks.push(batch?.markedReadyAt ? { rule: 'lock', ok: false, message: `Held: ${CLOSED_PERIOD_MESSAGE}` } : { rule: 'lock', ok: true });
  const existing = batch ? (await listUploads(actx.auth, batch.id)).find((u) => u.slot === i.slot) ?? null : null;

  const sheet = await readSheet(actx, i.attachmentId);
  const lines = [
    loaded.companyName,
    `${state?.name ?? i.stateCode}${i.stateAssumed ? ' (assumed from the registered office)' : ''}`,
    periodLabel({ from: i.periodFrom, to: i.periodTo }),
    SLOT_LABEL[i.slot],
  ];
  if ('error' in sheet) {
    checks.push({ rule: 'file', ok: false, message: `Held: ${sheet.error}` });
  } else {
    const { headers, rowCount, grid } = sheet.summary;
    checks.push({ rule: 'file', ok: true });
    const looksLike = guessSlot(headers);
    // A sheet that looks like another slot is still the person's call; the card says so.
    if (looksLike && looksLike !== i.slot) checks.push({ rule: 'slot', ok: true, message: `This sheet looks like ${SLOT_LABEL[looksLike].toLowerCase()}.` });
    const named = headers.filter((h) => h.trim());
    lines.push(`${rowCount} row${rowCount === 1 ? '' : 's'}`);
    lines.push(`columns: ${named.slice(0, 8).join(', ')}${named.length > 8 ? ` and ${named.length - 8} more` : ''}`);
    const columns = state ? await columnLine(actx, i, headers, grid) : '';
    if (columns) lines.push(columns);
  }
  if (existing) lines.push(`replaces ${existing.fileName}`);

  return recheckOf(checks, {
    oldValue: existing?.fileName ?? '',
    value: i.value,
    displayOld: existing ? `${existing.fileName} (${existing.rowCount} rows)` : '',
    displayNew: `${i.value}: ${lines.join(' · ')}`,
  });
}

async function execute(actx: ActionContext, i: Input): Promise<ActionResult> {
  const batch = await openBatch(actx.auth, { engagementId: i.engagementId, stateCode: i.stateCode, periodFrom: i.periodFrom, periodTo: i.periodTo });
  if (!batch) return { ok: false, error: 'This project is not available.' };
  if (batch.markedReadyAt) return { ok: false, error: CLOSED_PERIOD_MESSAGE };
  const previousRow = (await listUploads(actx.auth, batch.id)).find((u) => u.slot === i.slot);
  const file = await copyAskAttachment(actx, i.attachmentId);
  if (!file) return { ok: false, error: 'The file is no longer available.' };
  try {
    const { upload, sha256 } = await ingestRegisterUpload(actx.auth, { batch, slot: i.slot, bytes: file.bytes, fileName: file.fileName });
    const undo: UndoData = {
      batchId: batch.id,
      slot: i.slot,
      uploadId: upload.id,
      sha256,
      objectKey: upload.objectKey,
      previous: previousRow ? uploadSnapshot(previousRow) : null,
    };
    return {
      ok: true,
      summary: `Filed ${file.fileName} as the ${SLOT_LABEL[i.slot].toLowerCase()} for ${periodLabel({ from: i.periodFrom, to: i.periodTo })}`,
      href: registerHref(actx.auth.role, batch.id),
      undo: undo as unknown as JsonValue,
    };
  } catch (error) {
    if (error instanceof RegisterUploadRefused) return { ok: false, error: error.message };
    throw error;
  }
}

async function undo(actx: ActionContext, raw: JsonValue): Promise<ActionResult> {
  const data = raw as unknown as UndoData;
  const batch = await getBatch(actx.auth, data.batchId);
  if (!batch) return { ok: false, error: 'This register is not available.' };
  if (batch.markedReadyAt) return { ok: false, error: 'The period is closed, so the file stays. Reopen the inputs to change it.' };
  const current = (await listUploads(actx.auth, batch.id)).find((u) => u.slot === data.slot);
  if (!current || current.sha256 !== data.sha256) return { ok: false, error: 'This slot was changed after the upload, so it was left as it is.' };
  if (data.previous) await restoreUpload(actx.auth, batch.id, data.previous);
  else await removeUpload(actx.auth, batch.id, current.id);
  // The new file's object is only this slot's, so it goes unless the old upload shares its bytes.
  if (data.objectKey !== data.previous?.objectKey) {
    await deleteObject(data.objectKey).catch((error) => console.error('[labour.uploadSheet] could not delete the stored file', error));
  }
  return { ok: true, summary: data.previous ? `Put back ${data.previous.fileName}` : `Removed the ${SLOT_LABEL[data.slot].toLowerCase()}` };
}

export const uploadSheet = defineAction({
  name: 'labour.uploadSheet',
  description:
    'File a payroll, attendance, overtime, employee or leave spreadsheet from the chat into one client\'s labour register for a state and period, after a person approves it. A full slot is replaced.',
  capability: 'File payroll and attendance sheets into a client\'s labour register for the right state and month (after you approve it)',
  input,
  tier: 'T2',
  roles: STAFF_ROLES,
  async preview(actx, i) {
    const checked = await check(actx, i);
    const { value: _value, ...target } = i;
    return oneRow({
      title: `Labour register: ${SLOT_LABEL[i.slot]}`,
      tier: 'T2',
      engagementId: i.engagementId,
      action: 'labour.uploadSheet',
      target: jsonTarget(target),
      label: `${SLOT_LABEL[i.slot]} · ${periodLabel({ from: i.periodFrom, to: i.periodTo })}`,
      checked,
      source: { kind: 'attachment', attachmentId: i.attachmentId, fileName: i.value },
    });
  },
  recheck: (actx, i) => check(actx, i),
  execute,
  undo,
});
