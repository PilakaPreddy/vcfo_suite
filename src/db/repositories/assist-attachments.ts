import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { getDocPackInputs } from '@/db/repositories/doc-pack';
import { getDocumentById } from '@/db/repositories/documents';
import { getSpiceAttachments } from '@/db/repositories/spice-attachments';
import { ENGAGEMENT_DOCUMENTS_BUCKET } from '@/lib/board-resolution/board-resolution-storage';
import {
  attachmentSlots,
  contentTypeFromName,
  fileNameFromKey,
  type AttachmentSlot,
} from '@/lib/mca-filing/attachment-files';
import type { AssistAttachmentItem } from '@/lib/mca-filing/types';
import type { SpiceAttachment } from '@/lib/spice-attachments/derive';
import { documentStorageKey } from '@/storage/demo-placeholders';
import { bucketKey, getObjectBuffer, listObjects } from '@/storage/s3';

/**
 * ASSIST ATTACHMENTS — the SPICe+ files for the VCFO Assist extension. Read only.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 *   intern, manager, admin, super admin: the engagements `assertEngagementAccess` admits, through
 *   `getSpiceAttachments` and `getDocPackInputs`. Client and developer: never (403).
 *   A stored path must sit under this engagement's own id, so a value edited to point at another
 *   client's object reads as no file. `available` comes from storage itself, never from a status.
 */

/** The extension base64-encodes the file into a message, so one file stays small. */
export const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;

export type AttachmentAccess<T> = { ok: true; value: T } | { ok: false; status: 403 | 404; error: 'forbidden' | 'not_found' };

/** The accepted board resolution as a storage key inside this engagement, else null. */
async function boardResolutionKey(
  ctx: AuthContext,
  dbId: string,
  item: SpiceAttachment | undefined,
  signedPath: string | null | undefined,
): Promise<string | null> {
  if (!item || (!item.vaultDocumentId && item.detail !== 'Accepted')) return null;
  let key: string | null = null;
  if (item.vaultDocumentId) {
    const doc = await getDocumentById(ctx, item.vaultDocumentId).catch(() => null);
    if (doc?.objectKey) key = documentStorageKey(doc.objectKey);
  }
  if (!key && signedPath?.trim()) key = bucketKey(ENGAGEMENT_DOCUMENTS_BUCKET, signedPath.trim());
  return key && !key.includes('..') && key.includes(`/${dbId}/`) ? key : null;
}

async function slotsFor(ctx: AuthContext, engagementParam: string): Promise<AttachmentAccess<{ dbId: string; slots: AttachmentSlot[] }>> {
  const list = await getSpiceAttachments(ctx, engagementParam);
  if (list.ok === false) return { ok: false, status: list.status, error: list.error };
  const access = await getDocPackInputs(ctx, engagementParam);
  if (access.ok === false) return { ok: false, status: access.status, error: access.error };
  const { inputs } = access;
  const items = list.list.items;
  const boardKey = await boardResolutionKey(ctx, inputs.dbId, items.find((i) => i.key === 'board-resolution'), inputs.brRow?.signedStoragePath);
  return { ok: true, value: { dbId: inputs.dbId, slots: attachmentSlots({ dbId: inputs.dbId, items, state: inputs.checklistState, boardResolutionKey: boardKey }) } };
}

/** The object's size, or null when it is not in storage or storage cannot say. */
async function storedSize(key: string): Promise<number | null> {
  try {
    const hit = (await listObjects(key, 1)).find((o) => o.key === key);
    return hit ? (hit.size ?? 0) : null;
  } catch (e) {
    console.warn('[assist-attachments] storage read failed', e instanceof Error ? e.message : e);
    return null;
  }
}

async function toItem(slot: AttachmentSlot): Promise<AssistAttachmentItem> {
  const size = slot.storageKey ? await storedSize(slot.storageKey) : null;
  const available = size !== null;
  const fileName = available ? fileNameFromKey(slot.storageKey!) : null;
  const contentType = fileName ? contentTypeFromName(fileName) : null;
  let note = slot.note;
  if (slot.storageKey && !available) note = 'The record names a file, but it is not in storage.';
  if (available && contentType !== 'application/pdf') note = 'Stored, but not a PDF. The portal takes PDFs, so convert it first.';
  if (available && size! > MAX_ATTACHMENT_BYTES) note = 'Stored, but over the 6 MB the extension can carry. Attach it by hand.';
  return { key: slot.key, group: slot.group, label: slot.label, status: slot.status, available, fileName, size: available ? size : null, contentType, note };
}

export async function listAssistAttachments(ctx: AuthContext, engagementParam: string): Promise<AttachmentAccess<{ dbId: string; items: AssistAttachmentItem[] }>> {
  const slots = await slotsFor(ctx, engagementParam);
  if (slots.ok === false) return slots;
  return { ok: true, value: { dbId: slots.value.dbId, items: await Promise.all(slots.value.slots.map(toItem)) } };
}

export type AttachmentFile =
  | { ok: true; dbId: string; label: string; fileName: string; contentType: string; bytes: Buffer }
  | { ok: false; status: 403 | 404 | 413; error: 'forbidden' | 'not_found' | 'no_file' | 'file_too_large' };

/** One file by its key. Over the limit is refused before the bytes are read. */
export async function readAssistAttachment(ctx: AuthContext, engagementParam: string, key: string): Promise<AttachmentFile> {
  const slots = await slotsFor(ctx, engagementParam);
  if (slots.ok === false) return slots;
  const slot = slots.value.slots.find((s) => s.key === key);
  if (!slot) return { ok: false, status: 404, error: 'not_found' };
  if (!slot.storageKey) return { ok: false, status: 404, error: 'no_file' };
  const size = await storedSize(slot.storageKey);
  if (size === null) return { ok: false, status: 404, error: 'no_file' };
  if (size > MAX_ATTACHMENT_BYTES) return { ok: false, status: 413, error: 'file_too_large' };
  const bytes = await getObjectBuffer(slot.storageKey);
  if (!bytes) return { ok: false, status: 404, error: 'no_file' };
  if (bytes.length > MAX_ATTACHMENT_BYTES) return { ok: false, status: 413, error: 'file_too_large' };
  const fileName = fileNameFromKey(slot.storageKey);
  return { ok: true, dbId: slots.value.dbId, label: slot.label, fileName, contentType: contentTypeFromName(fileName), bytes };
}
