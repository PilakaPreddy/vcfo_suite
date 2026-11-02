import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { boardMeetingDocuments, boardMeetingSignatureEvents, boardMeetings } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { bucketKey, putObject, signedDownloadUrl } from '@/storage/s3';
import { isIsoDate, todayIst } from '@/lib/board-meetings/dates';
import type { MeetingStatus } from '@/lib/board-meetings/model';
import type { DirectorRow } from './directors';
import { directorsOfEngagement } from './directors';
import type { MeetingDocumentDto } from './meetings';
import { syncTask } from './meetings';
import { UUID, conflict, invalid, isStaff, notFound, recordMeetingEvent, scopedMeeting, scopedMeetingForWrite, type MeetingRow } from './shared';

/**
 * BOARD MEETING DOCUMENTS — the MoM and the resolutions added after the meeting, with one
 * signing loop (docs/specs/board-meetings/PLAN.md):
 *   draft (uploaded MoM, or a resolution drafted on the letterhead) → sent to the directors for
 *   signature → the lead uploads the signed copy → locked (no edit, no replace) → final copy
 *   emailed to all directors, admin and lead (the route does the emails).
 * Staff in scope write. A client reads locked documents only.
 */

export type DocumentRow = typeof boardMeetingDocuments.$inferSelect;

const MAX_BYTES = 20 * 1024 * 1024;

function storagePath(meetingId: string, docId: string, name: string): string {
  const safe = name.replace(/[^\w.-]+/g, '_').slice(-120) || 'file.pdf';
  return `board-meetings/${meetingId}/${docId}/${Date.now()}-${safe}`;
}

export async function listMeetingDocuments(meeting: MeetingRow, directors: DirectorRow[], clientView: boolean): Promise<MeetingDocumentDto[]> {
  const rows = await db.select().from(boardMeetingDocuments).where(eq(boardMeetingDocuments.meetingId, meeting.id)).orderBy(asc(boardMeetingDocuments.createdAt));
  const visible = clientView ? rows.filter((r) => r.status === 'locked') : rows;
  if (visible.length === 0) return [];
  const events = await db
    .select()
    .from(boardMeetingSignatureEvents)
    .where(inArray(boardMeetingSignatureEvents.documentId, visible.map((r) => r.id)))
    .orderBy(asc(boardMeetingSignatureEvents.createdAt));
  return visible.map((r) => {
    const signers = r.signerIds.map((id) => {
      const d = directors.find((x) => x.id === id);
      const log = events.filter((e) => e.documentId === r.id && e.directorId === id).map((e) => ({ event: e.event, at: e.createdAt.toISOString() }));
      const has = (ev: string) => log.some((l) => l.event === ev);
      const state = r.status === 'locked' ? 'signed' : has('reminded') ? 'reminded' : has('opened') ? 'opened' : has('sent') ? 'sent' : 'not_sent';
      return { id, name: d?.name ?? 'Director', din: d?.din ?? null, state: state as MeetingDocumentDto['signers'][number]['state'], log: clientView ? [] : log };
    });
    return {
      id: r.id,
      kind: r.kind as 'mom' | 'resolution',
      title: r.title,
      description: r.description,
      resolutionDate: r.resolutionDate,
      changesItem: r.changesItem,
      reason: clientView ? null : r.reason,
      signerIds: r.signerIds,
      signers,
      status: r.status as MeetingDocumentDto['status'],
      fileName: r.fileName,
      signedName: r.signedName,
      hasFile: Boolean(r.fileKey),
      hasSigned: Boolean(r.signedKey),
      sentAt: r.sentAt?.toISOString() ?? null,
      lockedAt: r.lockedAt?.toISOString() ?? null,
      finalSentAt: r.finalSentAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export interface UploadedFile {
  name: string;
  type: string;
  bytes: Uint8Array;
}

function checkPdf(file: UploadedFile): void {
  if (!file.bytes.length) throw invalid('empty_file');
  if (file.bytes.length > MAX_BYTES) throw invalid('too_large');
  const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!pdf) throw invalid('pdf_only');
}

/** Directors who attended or were invited: the MoM signers by default. */
function defaultSigners(meeting: MeetingRow): string[] {
  return meeting.recipients.filter((r) => r.kind === 'to' && r.directorId).map((r) => r.directorId!);
}

async function scopedDocument(ctx: AuthContext, docId: string): Promise<{ doc: DocumentRow; meeting: MeetingRow }> {
  if (!UUID.test(docId)) throw notFound();
  const [doc] = await db.select().from(boardMeetingDocuments).where(eq(boardMeetingDocuments.id, docId)).limit(1);
  if (!doc) throw notFound();
  const { meeting } = await scopedMeeting(ctx, doc.meetingId);
  if (ctx.role === 'client' && doc.status !== 'locked') throw notFound();
  return { doc, meeting };
}

async function scopedDocumentForWrite(ctx: AuthContext, docId: string): Promise<{ doc: DocumentRow; meeting: MeetingRow }> {
  if (!isStaff(ctx.role)) throw notFound();
  const found = await scopedDocument(ctx, docId);
  if (found.doc.status === 'locked') throw conflict('locked');
  return found;
}

/** Upload MoM: the one button. Replaces an unlocked MoM file; a locked MoM cannot change. */
export async function uploadMom(ctx: AuthContext, meetingId: string, file: UploadedFile): Promise<DocumentRow> {
  const { meeting } = await scopedMeetingForWrite(ctx, meetingId);
  const status = meeting.status as MeetingStatus;
  if (status === 'draft' || status === 'pending_approval' || status === 'cancelled') throw conflict('not_held');
  if (meeting.meetingDate > todayIst()) throw conflict('before_meeting');
  checkPdf(file);
  const [existing] = await db.select().from(boardMeetingDocuments).where(and(eq(boardMeetingDocuments.meetingId, meeting.id), eq(boardMeetingDocuments.kind, 'mom'))).limit(1);
  if (existing?.status === 'locked') throw conflict('locked');
  const id = existing?.id ?? crypto.randomUUID();
  const key = storagePath(meeting.id, id, file.name);
  await putObject(bucketKey('engagement-documents', key), file.bytes, 'application/pdf');
  let row: DocumentRow | undefined;
  if (existing) {
    [row] = await db
      .update(boardMeetingDocuments)
      .set({ fileKey: key, fileName: file.name.slice(0, 200), status: 'draft', sentAt: null, updatedAt: new Date() })
      .where(eq(boardMeetingDocuments.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(boardMeetingDocuments)
      .values({ id, meetingId: meeting.id, kind: 'mom', title: `Minutes of meeting · ${meeting.meetingNo}`, signerIds: defaultSigners(meeting), fileKey: key, fileName: file.name.slice(0, 200), createdBy: ctx.userId })
      .returning();
  }
  await recordMeetingEvent(ctx.userId, meeting.id, existing ? 'Replaced the MoM file' : 'Uploaded the MoM');
  return row!;
}

export interface ResolutionInput {
  title: string;
  description: string;
  resolutionDate: string;
  changesItem?: string | null;
  reason?: string | null;
  signerIds: string[];
}

async function checkResolution(meeting: MeetingRow, input: ResolutionInput): Promise<void> {
  if (!input.title?.trim()) throw invalid('title_required');
  if (!input.description?.trim()) throw invalid('description_required');
  if (!isIsoDate(input.resolutionDate)) throw invalid('bad_date');
  const directors = await directorsOfEngagement(meeting.engagementId);
  const ids = [...new Set(input.signerIds ?? [])];
  if (ids.length === 0) throw invalid('signers_required');
  if (ids.some((id) => !directors.some((d) => d.id === id))) throw invalid('bad_signer');
}

/** A resolution passed after the meeting (Sec 175 layout). Open until the next notice is sent. */
export async function createResolution(ctx: AuthContext, meetingId: string, input: ResolutionInput): Promise<DocumentRow> {
  const { meeting } = await scopedMeetingForWrite(ctx, meetingId);
  if (meeting.lockedAt) throw conflict('meeting_locked');
  if (meeting.status !== 'sent' && meeting.status !== 'held') throw conflict('not_held');
  if (meeting.meetingDate > todayIst()) throw conflict('before_meeting');
  await checkResolution(meeting, input);
  const [row] = await db
    .insert(boardMeetingDocuments)
    .values({
      meetingId: meeting.id,
      kind: 'resolution',
      title: input.title.trim().slice(0, 200),
      description: input.description.trim().slice(0, 4000),
      resolutionDate: input.resolutionDate,
      changesItem: input.changesItem?.trim().slice(0, 200) || null,
      reason: input.reason?.trim().slice(0, 1000) || null,
      signerIds: [...new Set(input.signerIds)],
      createdBy: ctx.userId,
    })
    .returning();
  await recordMeetingEvent(ctx.userId, meeting.id, `Added a resolution: ${row!.title}`);
  return row!;
}

/** Edit while not locked (draft, or sent and waiting for signatures). */
export async function updateResolution(ctx: AuthContext, docId: string, input: ResolutionInput): Promise<DocumentRow> {
  const { doc, meeting } = await scopedDocumentForWrite(ctx, docId);
  if (doc.kind !== 'resolution') throw invalid('not_resolution');
  await checkResolution(meeting, input);
  const [row] = await db
    .update(boardMeetingDocuments)
    .set({
      title: input.title.trim().slice(0, 200),
      description: input.description.trim().slice(0, 4000),
      resolutionDate: input.resolutionDate,
      changesItem: input.changesItem?.trim().slice(0, 200) || null,
      reason: input.reason?.trim().slice(0, 1000) || null,
      signerIds: [...new Set(input.signerIds)],
      // Changed text has to be signed again.
      status: 'draft',
      sentAt: null,
      updatedAt: new Date(),
    })
    .where(eq(boardMeetingDocuments.id, doc.id))
    .returning();
  await recordMeetingEvent(ctx.userId, meeting.id, `Edited the resolution: ${row!.title}`);
  return row!;
}

/** Mark sent for signature and log one "sent" (or "reminded") event per signer. The route emails. */
export async function markSentForSignature(ctx: AuthContext, docId: string, reminder = false): Promise<{ doc: DocumentRow; meeting: MeetingRow }> {
  const { doc, meeting } = await scopedDocumentForWrite(ctx, docId);
  if (doc.kind === 'mom' && !doc.fileKey) throw invalid('no_file');
  if (doc.signerIds.length === 0) throw invalid('signers_required');
  if (reminder && doc.status !== 'sent') throw conflict('not_sent');
  const [row] = await db
    .update(boardMeetingDocuments)
    .set({ status: 'sent', sentAt: reminder ? doc.sentAt : new Date(), updatedAt: new Date() })
    .where(eq(boardMeetingDocuments.id, doc.id))
    .returning();
  await db.insert(boardMeetingSignatureEvents).values(doc.signerIds.map((directorId) => ({ documentId: doc.id, directorId, event: reminder ? 'reminded' : 'sent' })));
  await recordMeetingEvent(ctx.userId, meeting.id, `${reminder ? 'Reminded the directors to sign' : 'Sent for signature'}: ${doc.title}`);
  return { doc: row!, meeting };
}

/** The signed copy: locks the document. A locked MoM completes the meeting's task. */
export async function uploadSigned(ctx: AuthContext, docId: string, file: UploadedFile): Promise<{ doc: DocumentRow; meeting: MeetingRow }> {
  const { doc, meeting } = await scopedDocumentForWrite(ctx, docId);
  checkPdf(file);
  const key = storagePath(meeting.id, doc.id, `signed-${file.name}`);
  await putObject(bucketKey('engagement-documents', key), file.bytes, 'application/pdf');
  const [row] = await db
    .update(boardMeetingDocuments)
    .set({ signedKey: key, signedName: file.name.slice(0, 200), status: 'locked', lockedAt: new Date(), lockedBy: ctx.userId, updatedAt: new Date() })
    .where(and(eq(boardMeetingDocuments.id, doc.id), inArray(boardMeetingDocuments.status, ['draft', 'sent'])))
    .returning();
  if (!row) throw conflict('locked');
  await db.insert(boardMeetingSignatureEvents).values(doc.signerIds.map((directorId) => ({ documentId: doc.id, directorId, event: 'signed' })));
  await recordMeetingEvent(ctx.userId, meeting.id, `Signed copy uploaded and locked: ${doc.title}`);
  await recordAuditEvent(ctx, { engagementId: meeting.engagementId, action: 'board_meeting.document_locked', summary: `Locked ${doc.kind === 'mom' ? 'the MoM' : 'a resolution'} of ${meeting.meetingNo}`, metadata: { documentId: doc.id } });
  if (doc.kind === 'mom') {
    const [m] = await db.select().from(boardMeetings).where(eq(boardMeetings.id, meeting.id)).limit(1);
    if (m) await syncTask(m, true);
  }
  return { doc: row, meeting };
}

export async function systemMarkFinalSent(docId: string, directorIds: string[]): Promise<void> {
  await db.update(boardMeetingDocuments).set({ finalSentAt: new Date() }).where(eq(boardMeetingDocuments.id, docId));
  if (directorIds.length) await db.insert(boardMeetingSignatureEvents).values(directorIds.map((directorId) => ({ documentId: docId, directorId, event: 'final_sent' })));
}

/** A short-lived link to the uploaded file or the signed copy. Clients: signed copies only. */
export async function documentFileUrl(ctx: AuthContext, docId: string, which: 'file' | 'signed'): Promise<{ url: string; fileName: string }> {
  const { doc } = await scopedDocument(ctx, docId);
  if (ctx.role === 'client' && which !== 'signed') throw notFound();
  const key = which === 'signed' ? doc.signedKey : doc.fileKey;
  if (!key) throw notFound();
  return { url: await signedDownloadUrl(bucketKey('engagement-documents', key)), fileName: (which === 'signed' ? doc.signedName : doc.fileName) ?? 'document.pdf' };
}

/** For emails: the document row after an access check by the caller. */
export async function systemDocument(docId: string): Promise<DocumentRow | null> {
  const [doc] = await db.select().from(boardMeetingDocuments).where(eq(boardMeetingDocuments.id, docId)).limit(1);
  return doc ?? null;
}
