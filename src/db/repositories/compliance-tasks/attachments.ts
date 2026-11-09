import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { complianceTaskAttachments, complianceTaskEvents } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { bucketKey, deleteObject, putObject, signedDownloadUrl } from '@/storage/s3';
import { ComplianceTaskError, STAFF, canManage, forbidden, notFound, notifyTask, scopedTask } from './shared';

/**
 * TASK ATTACHMENTS — files on a non-statutory task (DR-13), in the `engagement-documents`
 * bucket under `<engagementDbId>/compliance-tasks/<taskId>/`. Staff and the client (on a task
 * it can see) upload; only staff mark the deliverable (F-2). Reads go through the same scoped
 * task read, so a file of another tenant reads as not found.
 */

/** The largest file a task takes; the Ask VCFO evidence action checks it before copying. */
export const TASK_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;
const MAX_BYTES = TASK_ATTACHMENT_MAX_BYTES;

export interface AttachmentDto {
  id: string;
  fileName: string;
  mime: string | null;
  sizeBytes: number | null;
  uploadedBy: { id: string; name: string } | null;
  uploadedAt: string;
  deliverable: boolean;
  byClient: boolean;
}

export async function addTaskAttachment(
  ctx: AuthContext,
  taskId: string,
  file: { name: string; type: string; bytes: Uint8Array },
  opts: { deliverable?: boolean } = {},
): Promise<AttachmentDto> {
  const { task, engagement } = await scopedTask(ctx, taskId);
  if (file.bytes.byteLength === 0 || file.bytes.byteLength > MAX_BYTES) throw new ComplianceTaskError(400, 'file_size');
  const byClient = ctx.role === 'client';
  const deliverable = Boolean(opts.deliverable) && STAFF.has(ctx.role);
  const safe = file.name.replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || 'file';
  const storagePath = `${task.engagementId}/compliance-tasks/${task.id}/${Date.now()}-${safe}`;
  await putObject(bucketKey('engagement-documents', storagePath), file.bytes, file.type || undefined);
  if (deliverable) {
    // One deliverable per task: the newest one wins.
    await db.update(complianceTaskAttachments).set({ isDeliverable: false }).where(eq(complianceTaskAttachments.taskId, task.id));
  }
  const [row] = await db
    .insert(complianceTaskAttachments)
    .values({
      taskId: task.id,
      engagementId: task.engagementId,
      storagePath,
      fileName: safe,
      mime: file.type || null,
      sizeBytes: file.bytes.byteLength,
      isDeliverable: deliverable,
      byClient,
      uploadedBy: ctx.userId,
    })
    .returning();
  await db.insert(complianceTaskEvents).values({ taskId: task.id, actorId: ctx.userId, label: `Uploaded ${safe}${deliverable ? ' (deliverable)' : ''}` });
  if (byClient) {
    await notifyTask(ctx, { task, companyName: engagement.companyName, title: `File added: ${task.name}`, body: safe, recipientIds: [task.ownerId] });
  }
  return {
    id: row!.id,
    fileName: row!.fileName,
    mime: row!.mime ?? null,
    sizeBytes: row!.sizeBytes ?? null,
    uploadedBy: { id: ctx.userId, name: ctx.name },
    uploadedAt: row!.uploadedAt.toISOString(),
    deliverable,
    byClient,
  };
}

async function scopedAttachment(ctx: AuthContext, taskId: string, attachmentId: string) {
  const { task } = await scopedTask(ctx, taskId);
  const [row] = await db
    .select()
    .from(complianceTaskAttachments)
    .where(and(eq(complianceTaskAttachments.id, attachmentId), eq(complianceTaskAttachments.taskId, task.id)))
    .limit(1);
  if (!row) throw notFound();
  return { task, row };
}

/** A short-lived URL for one file. */
export async function getTaskAttachmentUrl(ctx: AuthContext, taskId: string, attachmentId: string): Promise<{ url: string; fileName: string }> {
  const { row } = await scopedAttachment(ctx, taskId, attachmentId);
  return { url: await signedDownloadUrl(bucketKey('engagement-documents', row.storagePath)), fileName: row.fileName };
}

/** Admin, super admin and manager, or the person who uploaded it. */
export async function removeTaskAttachment(ctx: AuthContext, taskId: string, attachmentId: string): Promise<void> {
  const { task, row } = await scopedAttachment(ctx, taskId, attachmentId);
  if (!canManage(ctx.role) && row.uploadedBy !== ctx.userId) throw forbidden();
  await db.delete(complianceTaskAttachments).where(eq(complianceTaskAttachments.id, row.id));
  try {
    await deleteObject(bucketKey('engagement-documents', row.storagePath));
  } catch (err) {
    console.error('[compliance-tasks] could not delete the stored file', err);
  }
  await db.insert(complianceTaskEvents).values({ taskId: task.id, actorId: ctx.userId, label: `Removed ${row.fileName}` });
}

/**
 * Make one of a task's files its deliverable again, for the undo of an Ask VCFO evidence row that
 * replaced it. Staff only, as for marking a deliverable on upload; the one-deliverable rule holds.
 */
export async function markTaskDeliverable(ctx: AuthContext, taskId: string, attachmentId: string): Promise<void> {
  if (!STAFF.has(ctx.role)) throw forbidden();
  const { task, row } = await scopedAttachment(ctx, taskId, attachmentId);
  await db.update(complianceTaskAttachments).set({ isDeliverable: false }).where(eq(complianceTaskAttachments.taskId, task.id));
  await db.update(complianceTaskAttachments).set({ isDeliverable: true }).where(eq(complianceTaskAttachments.id, row.id));
  await db.insert(complianceTaskEvents).values({ taskId: task.id, actorId: ctx.userId, label: `Marked ${row.fileName} as the deliverable` });
}
