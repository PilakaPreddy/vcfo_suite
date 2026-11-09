import 'server-only';

import { z } from 'zod';
import { createDocument, deleteVaultDocument } from '@/db/repositories/documents';
import type { JsonValue, RowCheck } from '@/lib/ask/changeset/types';
import { ENGAGEMENT_DOCUMENTS_BUCKET } from '@/lib/board-resolution/board-resolution-storage';
import { formatUploadFileSize, MAX_UPLOAD_BYTES } from '@/lib/upload-limits';
import { bucketKey, deleteObject, putObject } from '@/storage/s3';
import { copyAskAttachment, findAskAttachment, jsonTarget, loadEngagement, oneRow, recheckOf, STAFF_ROLES, unavailable } from '../shared';
import { defineAction, type ActionContext, type ActionRecheck, type ActionResult } from '../types';

/**
 * A file from the chat filed into a client's document vault, for anything that has no better home
 * (a contract, a letter, a bank statement). The bytes are copied to `engagement-documents` and
 * indexed with `createDocument`, the same index the vault lists. Undo is the vault's own soft
 * delete, so the file can still be brought back from the vault.
 */

const input = z.object({
  engagementId: z.string().min(1),
  attachmentId: z.string().uuid(),
  /** The vault folder, for example "Contracts" or "Other". */
  category: z.string().trim().min(1).max(64),
  /** The file name, shown on the card. */
  value: z.string(),
});
type Input = z.infer<typeof input>;

interface UndoData {
  documentId: string;
}

const TOO_LARGE = `A vault file can be at most ${formatUploadFileSize(MAX_UPLOAD_BYTES)}.`;

async function check(actx: ActionContext, i: Input): Promise<ActionRecheck> {
  const loaded = await loadEngagement(actx.auth, i.engagementId);
  if (!loaded) return unavailable();
  const checks: RowCheck[] = [{ rule: 'scope', ok: true }];
  const file = await findAskAttachment(actx, i.attachmentId);
  if (!file) checks.push({ rule: 'file', ok: false, message: 'Held: the file is no longer available.' });
  else if (file.sizeBytes > MAX_UPLOAD_BYTES) checks.push({ rule: 'file', ok: false, message: `Held: ${TOO_LARGE}` });
  else checks.push({ rule: 'file', ok: true });
  return recheckOf(checks, {
    oldValue: '',
    value: i.value,
    displayOld: '',
    displayNew: `${i.value} into the vault under ${i.category} for ${loaded.companyName}`,
  });
}

async function execute(actx: ActionContext, i: Input): Promise<ActionResult> {
  const loaded = await loadEngagement(actx.auth, i.engagementId);
  if (!loaded) return { ok: false, error: 'This project is not available.' };
  const file = await copyAskAttachment(actx, i.attachmentId);
  if (!file) return { ok: false, error: 'The file is no longer available.' };
  if (file.sizeBytes > MAX_UPLOAD_BYTES) return { ok: false, error: TOO_LARGE };
  const safe = file.fileName.replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || 'file';
  const objectKey = bucketKey(ENGAGEMENT_DOCUMENTS_BUCKET, `${loaded.row.id}/vault/${actx.now.getTime()}-${safe}`);
  await putObject(objectKey, file.bytes, file.contentType ?? undefined);
  try {
    const doc = await createDocument(actx.auth, {
      engagementId: i.engagementId,
      fileName: file.fileName,
      objectKey,
      category: i.category,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
    });
    const undo: UndoData = { documentId: doc.id };
    return { ok: true, summary: `Filed ${file.fileName} in the vault under ${i.category}`, undo: undo as unknown as JsonValue };
  } catch (error) {
    await deleteObject(objectKey).catch(() => undefined);
    throw error;
  }
}

async function undo(actx: ActionContext, raw: JsonValue): Promise<ActionResult> {
  const data = raw as unknown as UndoData;
  try {
    const removed = await deleteVaultDocument(actx.auth, data.documentId);
    return removed ? { ok: true, summary: `Removed ${removed.fileName} from the vault` } : { ok: false, error: 'The file is no longer in the vault.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'in_use') return { ok: false, error: 'A checklist step now holds this file, so it stays in the vault.' };
    if (message.includes('not permitted')) return { ok: false, error: 'You cannot remove this file.' };
    throw error;
  }
}

export const fileToVault = defineAction({
  name: 'documents.fileToVault',
  description: 'File a document from the chat into one client\'s document vault under a category, after a person approves it. Use it for files with no checklist, labour register or compliance task home.',
  capability: 'File documents from the chat into a client\'s vault (after you approve it)',
  input,
  tier: 'T2',
  roles: STAFF_ROLES,
  async preview(actx, i) {
    const checked = await check(actx, i);
    const { value: _value, ...target } = i;
    return oneRow({
      title: 'Document vault',
      tier: 'T2',
      engagementId: i.engagementId,
      action: 'documents.fileToVault',
      target: jsonTarget(target),
      label: `Vault · ${i.category}`,
      checked,
      source: { kind: 'attachment', attachmentId: i.attachmentId, fileName: i.value },
    });
  },
  recheck: (actx, i) => check(actx, i),
  execute,
  undo,
});
