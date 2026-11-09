import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import * as base from '@/db/schema';
import {
  labourRegisterBatches,
  labourRegisterColumnMaps,
  labourRegisterDocuments,
  labourRegisterUploads,
  labourRegisterCodeRules,
  labourRegisterVerifications,
} from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isAdminOrManager, isFirmWideAdmin } from '@/lib/auth';
import { assertEngagementAccess, listScopedEngagementIds } from '@/db/repositories/engagements';
import type { UploadSlot } from '@/lib/labour-registers/parse';

/**
 * LABOUR REGISTERS — the seam.
 *
 * Access follows the engagement, as everything client-scoped in this codebase does, so the
 * scope helpers are reused rather than a new rule invented: `listScopedEngagementIds` for
 * lists and `assertEngagementAccess` for a single row or a write. Writes are staff-only.
 *
 * Two rules here are specific to registers and are the reason this file refuses more often
 * than a typical repository:
 *
 *  - **A client may read, never write.** The client portal offers downloads. Mapping columns,
 *    generating and attesting are the firm's work and the firm's liability.
 *  - **An attested document is immutable.** `attestDocument` is the only transition into that
 *    state and there is no transition out, no update path and no delete path at all. A
 *    correction is a new row that supersedes the old one. Rule 72 of the OSH (Central) Rules
 *    forbids destroying a register after its retention period unless it has been properly
 *    transferred, and the research found that an electronic register may change its layout but
 *    not its integrity, serial numbering or column contents. That last principle is the
 *    product’s own: a November 2026 research pass could not source it to a rule.
 */

export type BatchRow = typeof labourRegisterBatches.$inferSelect;
export type UploadRow = typeof labourRegisterUploads.$inferSelect;
export type DocumentRow = typeof labourRegisterDocuments.$inferSelect;
export type VerificationRow = typeof labourRegisterVerifications.$inferSelect;
export type CodeRuleOverrideRow = typeof labourRegisterCodeRules.$inferSelect;

function assertStaff(ctx: AuthContext) {
  if (!isAdminOrManager(ctx.role) && ctx.role !== 'intern') {
    throw new Error('not permitted');
  }
}

/** Only a firm-wide admin may force a rebuild or attest. */
function assertFirmAdmin(ctx: AuthContext) {
  if (!isFirmWideAdmin(ctx.role)) throw new Error('not permitted');
}

async function engagement(ctx: AuthContext, engagementId: string) {
  const access = await assertEngagementAccess(ctx, engagementId);
  if (!access.ok) return null;
  return access;
}

/* ── Batches ──────────────────────────────────────────────────────────────── */

/** Every batch the caller may see, newest period first. */
export async function listBatches(ctx: AuthContext, opts: { engagementId?: string } = {}): Promise<BatchRow[]> {
  if (opts.engagementId) {
    const access = await engagement(ctx, opts.engagementId);
    if (!access) return [];
    return db
      .select()
      .from(labourRegisterBatches)
      .where(eq(labourRegisterBatches.engagementId, access.dbId))
      .orderBy(desc(labourRegisterBatches.periodFrom));
  }

  if (isFirmWideAdmin(ctx.role)) {
    return db.select().from(labourRegisterBatches).orderBy(desc(labourRegisterBatches.periodFrom));
  }

  const ids = await listScopedEngagementIds(ctx);
  if (ids.length === 0) return [];
  return db
    .select()
    .from(labourRegisterBatches)
    .where(inArray(labourRegisterBatches.engagementId, ids))
    .orderBy(desc(labourRegisterBatches.periodFrom));
}

/** One batch, or null when the caller may not see it. */
export async function getBatch(ctx: AuthContext, batchId: string): Promise<BatchRow | null> {
  const [row] = await db.select().from(labourRegisterBatches).where(eq(labourRegisterBatches.id, batchId)).limit(1);
  if (!row) return null;
  const access = await engagement(ctx, row.engagementId);
  return access ? row : null;
}

/**
 * Open a batch for a client, a state and a period, or return the one that already exists. The
 * unique index on (engagement, state, period) is what makes a second preparer opening the same
 * month join the first rather than fork it.
 */
export async function openBatch(
  ctx: AuthContext,
  input: { engagementId: string; stateCode: string; periodFrom: string; periodTo: string },
): Promise<BatchRow | null> {
  assertStaff(ctx);
  const access = await engagement(ctx, input.engagementId);
  if (!access) return null;

  const existing = await db
    .select()
    .from(labourRegisterBatches)
    .where(
      and(
        eq(labourRegisterBatches.engagementId, access.dbId),
        eq(labourRegisterBatches.stateCode, input.stateCode),
        eq(labourRegisterBatches.periodFrom, input.periodFrom),
        eq(labourRegisterBatches.periodTo, input.periodTo),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];

  const [row] = await db
    .insert(labourRegisterBatches)
    .values({
      engagementId: access.dbId,
      stateCode: input.stateCode,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      createdBy: ctx.userId,
    })
    .returning();
  return row ?? null;
}

/** Move a batch's status, or record the assumptions a generation was made under. */
export async function updateBatch(
  ctx: AuthContext,
  batchId: string,
  patch: { status?: string; assumptions?: Record<string, unknown> },
): Promise<BatchRow | null> {
  assertStaff(ctx);
  const batch = await getBatch(ctx, batchId);
  if (!batch) return null;
  const [row] = await db
    .update(labourRegisterBatches)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(labourRegisterBatches.id, batch.id))
    .returning();
  return row ?? null;
}

/**
 * Close the period. This is the one transition that permits generation: before it, the batch
 * is being gathered; after it, the uploads and the mapping are fixed and the registers are
 * built from exactly what was locked.
 *
 * `readiness` is the summary the preparer was shown when they confirmed, stored verbatim —
 * what somebody was told at the moment they took responsibility is part of the record, and
 * recomputing it later would answer a different question.
 */
export async function markReady(
  ctx: AuthContext,
  input: { batchId: string; accuracyConfirmed: boolean; readiness: Record<string, unknown> },
): Promise<BatchRow | null> {
  assertStaff(ctx);
  if (!input.accuracyConfirmed) throw new Error('the accuracy confirmation is required');
  const batch = await getBatch(ctx, input.batchId);
  if (!batch) return null;
  if (batch.markedReadyAt) throw new Error('already marked ready — reopen the inputs to change them');

  const [row] = await db
    .update(labourRegisterBatches)
    .set({
      status: 'ready',
      markedReadyBy: ctx.userId,
      markedReadyAt: new Date(),
      accuracyConfirmed: true,
      readinessSnapshot: input.readiness,
      updatedAt: new Date(),
    })
    .where(eq(labourRegisterBatches.id, batch.id))
    .returning();
  return row ?? null;
}

/**
 * Reopen a locked period. The only way back, and it takes a reason: a register that changed
 * after it was produced is a question somebody will eventually ask, and the answer should be
 * on the batch rather than in somebody's memory.
 *
 * Documents already generated are left alone. They keep their content address, so if the
 * inputs come back unchanged the same files answer and nothing is rebuilt; if they change,
 * the address moves and new documents are produced beside the old ones.
 */
export async function reopenInputs(
  ctx: AuthContext,
  input: { batchId: string; reason: string },
): Promise<BatchRow | null> {
  assertStaff(ctx);
  const reason = input.reason.trim();
  if (!reason) throw new Error('a reason is required to reopen a locked period');
  const batch = await getBatch(ctx, input.batchId);
  if (!batch) return null;
  if (!batch.markedReadyAt) return batch;

  const [row] = await db
    .update(labourRegisterBatches)
    .set({
      status: 'open',
      markedReadyBy: null,
      markedReadyAt: null,
      accuracyConfirmed: false,
      reopenedBy: ctx.userId,
      reopenedAt: new Date(),
      reopenReason: reason,
      reopenCount: batch.reopenCount + 1,
      updatedAt: new Date(),
    })
    .where(eq(labourRegisterBatches.id, batch.id))
    .returning();
  return row ?? null;
}

/** What the provenance bar above a generated batch says. */
export interface BatchProvenance {
  periodFrom: string;
  periodTo: string;
  status: string;
  markedReadyAt: string | null;
  markedReadyByName: string | null;
  generatedAt: string | null;
  /** Registers that exist for this batch, and how many were served rather than built. */
  registers: number;
  fromStorage: number;
  /** How many times the period has been reopened, so the bar can say so plainly. */
  reopenCount: number;
  reopenReason: string;
}

/**
 * The provenance of a batch, in one read: who locked it, when, what was generated and how much
 * of it came back from storage rather than being built again. It is the evidence manifest said
 * out loud, which is the point — a number nobody can see is a number nobody trusts.
 */
export async function batchProvenance(ctx: AuthContext, batchId: string): Promise<BatchProvenance | null> {
  const batch = await getBatch(ctx, batchId);
  if (!batch) return null;

  const docs = await db
    .select()
    .from(labourRegisterDocuments)
    .where(eq(labourRegisterDocuments.batchId, batch.id));

  let readyByName: string | null = null;
  if (batch.markedReadyBy) {
    const [who] = await db
      .select({ name: base.profiles.name })
      .from(base.profiles)
      .where(eq(base.profiles.id, batch.markedReadyBy))
      .limit(1);
    readyByName = who?.name ?? null;
  }

  const generatedAt = docs.reduce<Date | null>(
    (latest, d) => (!latest || d.generatedAt > latest ? d.generatedAt : latest),
    null,
  );

  return {
    periodFrom: batch.periodFrom,
    periodTo: batch.periodTo,
    status: batch.status,
    markedReadyAt: batch.markedReadyAt ? batch.markedReadyAt.toISOString() : null,
    markedReadyByName: readyByName,
    generatedAt: generatedAt ? generatedAt.toISOString() : null,
    registers: docs.length,
    /* A document downloaded more than once was served from storage every time after the
       first, which is the saving this feature exists to make. */
    fromStorage: docs.filter((d) => d.downloadCount > 0).length,
    reopenCount: batch.reopenCount,
    reopenReason: batch.reopenReason,
  };
}

/* ── Uploads ──────────────────────────────────────────────────────────────── */

export async function listUploads(ctx: AuthContext, batchId: string): Promise<UploadRow[]> {
  const batch = await getBatch(ctx, batchId);
  if (!batch) return [];
  return db.select().from(labourRegisterUploads).where(eq(labourRegisterUploads.batchId, batch.id));
}

/** Record an uploaded input. Replacing a slot replaces the row, by the unique index. */
export async function recordUpload(
  ctx: AuthContext,
  input: {
    batchId: string;
    slot: UploadSlot;
    fileName: string;
    objectKey: string;
    sha256: string;
    sheetName: string;
    headerRow: number;
    headers: string[];
    rowCount: number;
    gridDetection?: unknown;
  },
): Promise<UploadRow | null> {
  assertStaff(ctx);
  const batch = await getBatch(ctx, input.batchId);
  if (!batch) return null;
  const [row] = await db
    .insert(labourRegisterUploads)
    .values({ ...input, uploadedBy: ctx.userId })
    .onConflictDoUpdate({
      target: [labourRegisterUploads.batchId, labourRegisterUploads.slot],
      set: {
        fileName: input.fileName,
        objectKey: input.objectKey,
        sha256: input.sha256,
        sheetName: input.sheetName,
        headerRow: input.headerRow,
        headers: input.headers,
        rowCount: input.rowCount,
        gridDetection: input.gridDetection ?? null,
        uploadedBy: ctx.userId,
        uploadedAt: new Date(),
      },
    })
    .returning();
  return row ?? null;
}

/** A stored upload as plain JSON, so an undo can put it back exactly as it was. */
export interface UploadSnapshot {
  id: string;
  slot: string;
  fileName: string;
  objectKey: string;
  sha256: string;
  sheetName: string;
  headerRow: number;
  headers: string[];
  rowCount: number;
  gridDetection: unknown;
  uploadedBy: string | null;
  uploadedAt: string;
}

export function uploadSnapshot(row: UploadRow): UploadSnapshot {
  return {
    id: row.id,
    slot: row.slot,
    fileName: row.fileName,
    objectKey: row.objectKey,
    sha256: row.sha256,
    sheetName: row.sheetName,
    headerRow: row.headerRow,
    headers: (row.headers ?? []) as string[],
    rowCount: row.rowCount,
    gridDetection: row.gridDetection ?? null,
    uploadedBy: row.uploadedBy ?? null,
    uploadedAt: (row.uploadedAt instanceof Date ? row.uploadedAt : new Date(row.uploadedAt)).toISOString(),
  };
}

/**
 * Remove one uploaded input, for an undo of a chat upload. Staff only, and refused once the batch's
 * inputs are marked ready: a closed period keeps its inputs, as `recordUpload` callers already
 * enforce. Returns the removed row, or null when it is not there or not visible.
 */
export async function removeUpload(ctx: AuthContext, batchId: string, uploadId: string): Promise<UploadRow | null> {
  assertStaff(ctx);
  const batch = await getBatch(ctx, batchId);
  if (!batch) return null;
  if (batch.markedReadyAt) throw new Error('the period is closed');
  const [row] = await db
    .delete(labourRegisterUploads)
    .where(and(eq(labourRegisterUploads.id, uploadId), eq(labourRegisterUploads.batchId, batch.id)))
    .returning();
  return row ?? null;
}

/**
 * Put a replaced upload back in its slot, with its original uploader and time, for an undo of a
 * chat upload that replaced it. The same lock rule as `removeUpload` applies.
 */
export async function restoreUpload(ctx: AuthContext, batchId: string, snapshot: UploadSnapshot): Promise<UploadRow | null> {
  assertStaff(ctx);
  const batch = await getBatch(ctx, batchId);
  if (!batch) return null;
  if (batch.markedReadyAt) throw new Error('the period is closed');
  const values = {
    fileName: snapshot.fileName,
    objectKey: snapshot.objectKey,
    sha256: snapshot.sha256,
    sheetName: snapshot.sheetName,
    headerRow: snapshot.headerRow,
    headers: snapshot.headers,
    rowCount: snapshot.rowCount,
    gridDetection: snapshot.gridDetection ?? null,
    uploadedBy: snapshot.uploadedBy,
    uploadedAt: new Date(snapshot.uploadedAt),
  };
  const [row] = await db
    .insert(labourRegisterUploads)
    .values({ ...values, batchId: batch.id, slot: snapshot.slot })
    .onConflictDoUpdate({ target: [labourRegisterUploads.batchId, labourRegisterUploads.slot], set: values })
    .returning();
  return row ?? null;
}

/* ── Remembered column maps ───────────────────────────────────────────────── */

/** The mapping remembered for a client and slot, so next month is a confirmation. */
export async function getColumnMap(
  ctx: AuthContext,
  engagementId: string,
  slot: UploadSlot,
): Promise<typeof labourRegisterColumnMaps.$inferSelect | null> {
  const access = await engagement(ctx, engagementId);
  if (!access) return null;
  const [row] = await db
    .select()
    .from(labourRegisterColumnMaps)
    .where(and(eq(labourRegisterColumnMaps.engagementId, access.dbId), eq(labourRegisterColumnMaps.slot, slot)))
    .limit(1);
  return row ?? null;
}

/** Save the mapping a preparer confirmed. */
export async function saveColumnMap(
  ctx: AuthContext,
  input: {
    engagementId: string;
    slot: UploadSlot;
    mapping: Record<string, string>;
    valueMaps?: Record<string, Record<string, string>>;
    lastHeaders: string[];
  },
): Promise<void> {
  assertStaff(ctx);
  const access = await engagement(ctx, input.engagementId);
  if (!access) return;
  await db
    .insert(labourRegisterColumnMaps)
    .values({
      engagementId: access.dbId,
      slot: input.slot,
      mapping: input.mapping,
      valueMaps: input.valueMaps ?? {},
      lastHeaders: input.lastHeaders,
      confirmedBy: ctx.userId,
    })
    .onConflictDoUpdate({
      target: [labourRegisterColumnMaps.engagementId, labourRegisterColumnMaps.slot],
      set: {
        mapping: input.mapping,
        valueMaps: input.valueMaps ?? {},
        lastHeaders: input.lastHeaders,
        confirmedBy: ctx.userId,
        updatedAt: new Date(),
      },
    });
}

/* ── Documents ────────────────────────────────────────────────────────────── */

/** Every document of a batch. Clients may read these; that is the portal's whole job. */
export async function listDocuments(ctx: AuthContext, batchId: string): Promise<DocumentRow[]> {
  const batch = await getBatch(ctx, batchId);
  if (!batch) return [];
  return db
    .select()
    .from(labourRegisterDocuments)
    .where(eq(labourRegisterDocuments.batchId, batch.id))
    .orderBy(desc(labourRegisterDocuments.generatedAt));
}

/**
 * The stored document for a content address, if there is one. This is the call that keeps the
 * bill down: a hit means the register is downloaded rather than built.
 */
export async function findByCacheKey(
  ctx: AuthContext,
  batchId: string,
  formId: string,
  cacheKey: string,
  format = 'xlsx',
): Promise<DocumentRow | null> {
  const batch = await getBatch(ctx, batchId);
  if (!batch) return null;
  const [row] = await db
    .select()
    .from(labourRegisterDocuments)
    .where(
      and(
        eq(labourRegisterDocuments.batchId, batch.id),
        eq(labourRegisterDocuments.formId, formId),
        eq(labourRegisterDocuments.cacheKey, cacheKey),
        eq(labourRegisterDocuments.format, format),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Record a freshly generated document. */
export async function recordDocument(
  ctx: AuthContext,
  input: {
    batchId: string;
    formId: string;
    cacheKey: string;
    objectKey: string;
    artifactSha256: string;
    byteLength: number;
    format?: string;
    templateVersion: string;
    generatorRevision: string;
    manifest: Record<string, unknown>;
    retainUntil: string;
    supersedesId?: string;
  },
): Promise<DocumentRow | null> {
  assertStaff(ctx);
  const batch = await getBatch(ctx, input.batchId);
  if (!batch) return null;
  /* Generation follows the close, never precedes it: a register built from a half-gathered
     month looks exactly like a finished one. */
  if (!batch.markedReadyAt) throw new Error('mark the inputs ready before generating registers');
  const [row] = await db
    .insert(labourRegisterDocuments)
    .values({ ...input, format: input.format ?? 'xlsx', generatedBy: ctx.userId })
    .returning();
  return row ?? null;
}

/**
 * One produced document, scoped the way everything else here is.
 *
 * A document belonging to another firm reads as absent rather than refused: whether a register
 * exists for a client you cannot see is itself something not to disclose.
 */
export async function getDocument(ctx: AuthContext, documentId: string): Promise<DocumentRow | null> {
  const [doc] = await db
    .select()
    .from(labourRegisterDocuments)
    .where(eq(labourRegisterDocuments.id, documentId))
    .limit(1);
  if (!doc) return null;
  const batch = await getBatch(ctx, doc.batchId);
  return batch ? doc : null;
}

/** Count a download, so the saving from not regenerating is observable rather than claimed. */
export async function countDownload(ctx: AuthContext, documentId: string): Promise<void> {
  const [doc] = await db.select().from(labourRegisterDocuments).where(eq(labourRegisterDocuments.id, documentId)).limit(1);
  if (!doc) return;
  const batch = await getBatch(ctx, doc.batchId);
  if (!batch) return;
  await db
    .update(labourRegisterDocuments)
    .set({ downloadCount: doc.downloadCount + 1 })
    .where(eq(labourRegisterDocuments.id, doc.id));
}

/**
 * Sign off a document. The only transition into the attested state, and there is no transition
 * out: afterwards the row is frozen and a correction has to be issued as a new document.
 * Restricted to a firm-wide admin, because this is the firm putting its name to a statutory
 * record.
 */
export async function attestDocument(
  ctx: AuthContext,
  input: {
    documentId: string;
    method: 'printed-wet-signature' | 'dsc' | 'aadhaar-esign';
    /** The signed scan. Required for the printed method, which is the one the firm uses. */
    signedObjectKey?: string;
    signedFileName?: string;
    signedSha256?: string;
    /** Who signed the paper. Not necessarily a user of this product. */
    signedByName?: string;
  },
): Promise<DocumentRow | null> {
  assertFirmAdmin(ctx);
  const [doc] = await db
    .select()
    .from(labourRegisterDocuments)
    .where(eq(labourRegisterDocuments.id, input.documentId))
    .limit(1);
  if (!doc) return null;
  const batch = await getBatch(ctx, doc.batchId);
  if (!batch) return null;
  if (doc.attestedAt) throw new Error('already attested — issue a superseding document instead');

  /* The firm attests by signing a printout. Recording that without the scan would leave a row
     claiming a signature nobody can produce, which is the one thing an attestation must not
     be: the record exists so that somebody can be shown what was signed. */
  if (input.method === 'printed-wet-signature' && !input.signedObjectKey) {
    throw new Error('upload the signed printout before recording the attestation');
  }

  const [row] = await db
    .update(labourRegisterDocuments)
    .set({
      status: 'attested',
      attestedBy: ctx.userId,
      attestedAt: new Date(),
      attestationMethod: input.method,
      signedObjectKey: input.signedObjectKey ?? null,
      signedFileName: input.signedFileName ?? null,
      signedSha256: input.signedSha256 ?? null,
      signedByName: input.signedByName ?? '',
    })
    .where(eq(labourRegisterDocuments.id, doc.id))
    .returning();
  return row ?? null;
}


/**
 * Mark an attested document as replaced by a later one. The file itself is untouched and
 * stays downloadable: a superseded register is part of the record, not a mistake to hide.
 */
export async function supersedeDocument(ctx: AuthContext, oldId: string, newId: string): Promise<void> {
  assertFirmAdmin(ctx);
  const [doc] = await db.select().from(labourRegisterDocuments).where(eq(labourRegisterDocuments.id, oldId)).limit(1);
  if (!doc) return;
  const batch = await getBatch(ctx, doc.batchId);
  if (!batch) return;
  await db.update(labourRegisterDocuments).set({ status: 'superseded' }).where(eq(labourRegisterDocuments.id, oldId));
  await db.update(labourRegisterDocuments).set({ supersedesId: oldId }).where(eq(labourRegisterDocuments.id, newId));
}

/* ── Verification ─────────────────────────────────────────────────────────── */

/**
 * The firm's own verdicts on the catalogue's layouts.
 *
 * Readable by anyone who can see a batch, because the notice printed on a register is
 * something a client is entitled to understand. Writable only by staff: deciding that a
 * statutory layout has been checked is the firm's professional judgement, and a client
 * recording it would be the firm's liability with none of its knowledge.
 */
export async function listVerifications(ctx: AuthContext): Promise<VerificationRow[]> {
  void ctx;
  return db.select().from(labourRegisterVerifications);
}

/** Record, or revise, what the firm has found about one form's layout. */
export async function saveVerification(
  ctx: AuthContext,
  input: {
    formId: string;
    status: 'unverified' | 'disputed' | 'checked-against-sample' | 'gazette-verified';
    against?: string;
    disputedBecause?: string;
    openItems?: string[];
    evidenceKey?: string | null;
    evidenceFileName?: string | null;
    suppressed?: boolean;
    suppressedReason?: string;
  },
): Promise<VerificationRow | null> {
  assertStaff(ctx);

  const values = {
    formId: input.formId,
    status: input.status,
    against: input.against ?? '',
    disputedBecause: input.disputedBecause ?? '',
    openItems: input.openItems ?? [],
    evidenceKey: input.evidenceKey ?? null,
    evidenceFileName: input.evidenceFileName ?? null,
    suppressed: input.suppressed ?? false,
    suppressedReason: input.suppressedReason ?? '',
    verifiedBy: ctx.userId,
  };

  const [row] = await db
    .insert(labourRegisterVerifications)
    .values(values)
    .onConflictDoUpdate({
      target: labourRegisterVerifications.formId,
      set: { ...values, verifiedAt: new Date(), updatedAt: new Date() },
    })
    .returning();
  return row ?? null;
}

/**
 * Undo a verdict, so the catalogue's own claim stands again.
 *
 * Not a delete of history — there is none to lose here, since the row holds the current
 * verdict rather than a log — but it is the only way back from a verdict entered in error,
 * and without it a mistyped "gazette-verified" would be permanent.
 */
export async function clearVerification(ctx: AuthContext, formId: string): Promise<void> {
  assertStaff(ctx);
  await db.delete(labourRegisterVerifications).where(eq(labourRegisterVerifications.formId, formId));
}

/* ── Where each state has got to ──────────────────────────────────────────── */

/**
 * The firm's own reading of which states have notified rules under which code.
 *
 * Readable by anyone who can see a batch, because which rules govern a client's registers is
 * something that client is entitled to understand. Writable only by staff, for the same reason
 * a verification verdict is: it is the firm's professional reading of a gazette.
 */
export async function listCodeRuleOverrides(ctx: AuthContext): Promise<CodeRuleOverrideRow[]> {
  void ctx;
  return db.select().from(labourRegisterCodeRules);
}

/** Record, or revise, how far one state has got under one code. */
export async function saveCodeRuleOverride(
  ctx: AuthContext,
  input: {
    stateCode: string;
    code: string;
    stage: 'notified' | 'draft' | 'none';
    notifiedOn?: string;
    source?: string;
    note?: string;
  },
): Promise<CodeRuleOverrideRow | null> {
  assertStaff(ctx);
  const values = {
    stateCode: input.stateCode,
    code: input.code,
    stage: input.stage,
    notifiedOn: input.notifiedOn ?? '',
    source: input.source ?? '',
    note: input.note ?? '',
    verifiedBy: ctx.userId,
  };
  const [row] = await db
    .insert(labourRegisterCodeRules)
    .values(values)
    .onConflictDoUpdate({
      target: [labourRegisterCodeRules.stateCode, labourRegisterCodeRules.code],
      set: { ...values, verifiedAt: new Date(), updatedAt: new Date() },
    })
    .returning();
  return row ?? null;
}

/** Undo an entry, so the catalogue's own reading stands again. */
export async function clearCodeRuleOverride(ctx: AuthContext, stateCode: string, code: string): Promise<void> {
  assertStaff(ctx);
  await db
    .delete(labourRegisterCodeRules)
    .where(and(eq(labourRegisterCodeRules.stateCode, stateCode), eq(labourRegisterCodeRules.code, code)));
}
