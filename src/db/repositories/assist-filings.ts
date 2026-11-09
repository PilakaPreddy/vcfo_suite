import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, inArray, isNull, notInArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { assistFilingDocuments, assistFilingPackets, assistFilingSigners, assistFilings, engagements, profiles } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { AssistForbiddenError } from '@/db/repositories/assist-runs';
import { isStaff, scopeEngagement } from '@/db/repositories/compliance-subject-scope';
import { leadProfileId } from '@/db/repositories/board-meetings/shared';
import { checklistStateFromRow } from '@/db/repositories/engagements/read';
import { displayName, readProposedDirectors } from '@/lib/incorporation/proposed-directors';
import { ENGAGEMENT_DOCUMENTS_BUCKET } from '@/lib/board-resolution/board-resolution-storage';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { internEngagementPath } from '@/lib/projects/project-step-path';
import {
  FILING_FORMS,
  FilingRefusal,
  deadlines,
  deadlinesToAlert,
  istDate,
  movesFrom,
  nextAction,
  planFilingPatch,
  type FilingDeadline,
  type FilingForm,
  type FilingPatch,
  type FilingRemark,
  type FilingState,
} from '@/lib/mca-filing/filing-state';
import type { PdfCompareResult } from '@/lib/mca-filing/pdf-compare';
import { dscDeadlinesToAlert, packetChanges, type DscDeadline, type PacketContent, type PacketPart, type SignerPortalFacts } from '@/lib/mca-filing/readiness';
import type { SignerMatch } from '@/lib/mca-filing/signers';
import type { FilingDocumentDto, FilingDto, SignatureRequestEntry } from '@/lib/mca-filing/types';
import { bucketKey, getObjectBuffer, putObject, signedDownloadUrl } from '@/storage/s3';

/**
 * ASSIST FILINGS (migrations 0048 and 0049) — the human filing record of SPICe+ Part A and Part B,
 * the portal and signed PDFs, what staff confirmed about each signer's MCA set-up, and the frozen
 * filing packets. Suite never drives the MCA portal; these rows only record what people
 * did. No MCA login, password, OTP, DSC PIN or token is ever stored.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 *   intern, manager, admin, super admin: the engagements `assertEngagementAccess` admits (through
 *   `scopeEngagement`). Client, developer, partner: refused before any query. A document of
 *   another engagement reads as not found and writes nothing; every write uses the approved
 *   engagement id, never the one the caller sent. `system*` helpers serve the deadline job only.
 */

type Row = typeof assistFilings.$inferSelect;
type DocRow = typeof assistFilingDocuments.$inferSelect;

const iso = (d: Date | string | null | undefined): string | null => (d ? (d instanceof Date ? d.toISOString() : String(d)) : null);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function staffScope(ctx: AuthContext, engagementParam: string) {
  if (!isStaff(ctx)) throw new AssistForbiddenError('Only firm staff can open MCA filing records');
  return scopeEngagement(ctx, engagementParam);
}

const asRemarks = (raw: unknown): FilingRemark[] => (Array.isArray(raw) ? (raw as FilingRemark[]) : []);
const asRequests = (raw: unknown): SignatureRequestEntry[] => (Array.isArray(raw) ? (raw as SignatureRequestEntry[]) : []);

function toDto(row: Row, reviewedByName: string | null, today: string): FilingDto {
  const form = row.form as FilingForm;
  const state = row.state as FilingState;
  return {
    form,
    state,
    srn: row.srn ?? null,
    srnAt: iso(row.srnAt),
    nameApprovedAt: iso(row.nameApprovedAt),
    signedUploadedAt: iso(row.signedUploadedAt),
    paidAt: iso(row.paidAt),
    lastRemark: row.lastRemark ?? null,
    remarks: asRemarks(row.remarks),
    reviewedBy: reviewedByName,
    reviewedAt: iso(row.reviewedAt),
    reviewNote: row.reviewNote ?? null,
    signatureRequests: asRequests(row.signatureRequests),
    next: nextAction(state, Boolean(row.reviewedAt)),
    deadlines: deadlines({ form, state, srnAt: row.srnAt, signedUploadedAt: row.signedUploadedAt, paidAt: row.paidAt, nameApprovedAt: row.nameApprovedAt }, today),
    moves: movesFrom(form, state),
  };
}

/** A form with no row yet: nothing recorded, so it reads as data ready. */
function blankDto(form: FilingForm): FilingDto {
  return {
    form,
    state: 'data_ready',
    srn: null,
    srnAt: null,
    nameApprovedAt: null,
    signedUploadedAt: null,
    paidAt: null,
    lastRemark: null,
    remarks: [],
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    signatureRequests: [],
    next: nextAction('data_ready'),
    deadlines: [],
    moves: movesFrom(form, 'data_ready'),
  };
}

function toDocDto(row: DocRow, uploadedByName: string | null): FilingDocumentDto {
  return {
    id: row.id,
    form: row.form as FilingForm,
    kind: row.kind as FilingDocumentDto['kind'],
    fileName: row.fileName,
    size: row.sizeBytes ?? null,
    sha256: row.sha256,
    textHash: row.textHash ?? null,
    signers: Array.isArray(row.signers) ? (row.signers as SignerMatch[]) : [],
    check: (row.check ?? {}) as FilingDocumentDto['check'],
    stale: row.stale,
    uploadedBy: uploadedByName,
    createdAt: iso(row.createdAt)!,
  };
}

async function namesOf(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (unique.length === 0) return new Map();
  const rows = await db.select({ id: profiles.id, name: profiles.name, email: profiles.email }).from(profiles).where(inArray(profiles.id, unique));
  return new Map(rows.map((r) => [r.id, r.name?.trim() || r.email]));
}

/** The row of a form, made on first use so a concurrent first write cannot make two. */
async function ensureRow(dbId: string, form: FilingForm): Promise<Row> {
  await db.insert(assistFilings).values({ engagementId: dbId, form }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(assistFilings)
    .where(and(eq(assistFilings.engagementId, dbId), eq(assistFilings.form, form)))
    .limit(1);
  return row!;
}

async function documentsOf(dbId: string, form?: FilingForm): Promise<DocRow[]> {
  return db
    .select()
    .from(assistFilingDocuments)
    .where(form ? and(eq(assistFilingDocuments.engagementId, dbId), eq(assistFilingDocuments.form, form)) : eq(assistFilingDocuments.engagementId, dbId))
    .orderBy(desc(assistFilingDocuments.createdAt))
    .limit(200);
}

const latestOf = (docs: DocRow[], kind: 'portal_pdf' | 'signed_pdf') => docs.find((d) => d.kind === kind);

async function dtoOf(row: Row): Promise<FilingDto> {
  const names = await namesOf([row.reviewedBy]);
  return toDto(row, row.reviewedBy ? (names.get(row.reviewedBy) ?? null) : null, istDate(new Date()));
}

/** Both forms and every document of one engagement; null when out of scope. */
export async function getFilingRecords(
  ctx: AuthContext,
  engagementParam: string,
): Promise<{ dbId: string; engagementId: string; companyName: string; filings: FilingDto[]; documents: FilingDocumentDto[] } | null> {
  const scope = await staffScope(ctx, engagementParam);
  if (!scope) return null;
  const rows = await db.select().from(assistFilings).where(eq(assistFilings.engagementId, scope.dbId)).limit(10);
  const docs = await documentsOf(scope.dbId);
  const names = await namesOf([...rows.map((r) => r.reviewedBy), ...docs.map((d) => d.uploadedBy)]);
  const today = istDate(new Date());
  const filings = FILING_FORMS.map((form) => {
    const row = rows.find((r) => r.form === form);
    return row ? toDto(row, row.reviewedBy ? (names.get(row.reviewedBy) ?? null) : null, today) : blankDto(form);
  });
  return {
    dbId: scope.dbId,
    engagementId: appEngagementId(scope.dbId),
    companyName: scope.row.companyName,
    filings,
    documents: docs.map((d) => toDocDto(d, d.uploadedBy ? (names.get(d.uploadedBy) ?? null) : null)),
  };
}

/** A PATCH: state, SRN, remark and dates, through `planFilingPatch`. Null when out of scope. */
export async function updateFiling(ctx: AuthContext, engagementParam: string, form: FilingForm, patch: FilingPatch): Promise<{ dbId: string; filing: FilingDto; changed: string[] } | null> {
  const scope = await staffScope(ctx, engagementParam);
  if (!scope) return null;
  const row = await ensureRow(scope.dbId, form);
  const docs = await documentsOf(scope.dbId, form);
  const portal = latestOf(docs, 'portal_pdf');
  const hasFreshSignedPdf = docs.some((d) => d.kind === 'signed_pdf' && !d.stale && (!portal || d.textHash === portal.textHash));
  const now = new Date();
  const set = planFilingPatch(
    {
      form,
      state: row.state as FilingState,
      srn: row.srn ?? null,
      srnAt: row.srnAt ?? null,
      signedUploadedAt: row.signedUploadedAt ?? null,
      paidAt: row.paidAt ?? null,
      nameApprovedAt: row.nameApprovedAt ?? null,
      reviewedAt: row.reviewedAt ?? null,
      remarks: asRemarks(row.remarks),
      hasFreshSignedPdf,
    },
    patch,
    now,
    ctx.name,
  );
  const changed = Object.keys(set);
  if (changed.length === 0) return { dbId: scope.dbId, filing: await dtoOf(row), changed };
  const [next] = await db
    .update(assistFilings)
    .set({ ...set, updatedAt: now })
    .where(and(eq(assistFilings.id, row.id), eq(assistFilings.engagementId, scope.dbId)))
    .returning();
  return { dbId: scope.dbId, filing: await dtoOf(next!), changed };
}

/** What an upload needs to know before it runs its checks. Null when out of scope. */
export async function getFilingUploadContext(
  ctx: AuthContext,
  engagementParam: string,
  form: FilingForm,
): Promise<{ dbId: string; reviewedAt: string | null; reviewedByName: string | null; portal: { textHash: string | null } | null } | null> {
  const scope = await staffScope(ctx, engagementParam);
  if (!scope) return null;
  const row = await ensureRow(scope.dbId, form);
  const portal = latestOf(await documentsOf(scope.dbId, form), 'portal_pdf');
  const names = await namesOf([row.reviewedBy]);
  return {
    dbId: scope.dbId,
    reviewedAt: iso(row.reviewedAt),
    reviewedByName: row.reviewedBy ? (names.get(row.reviewedBy) ?? null) : null,
    portal: portal ? { textHash: portal.textHash } : null,
  };
}

async function storeDocument(ctx: AuthContext, dbId: string, form: FilingForm, kind: 'portal_pdf' | 'signed_pdf', input: { fileName: string; bytes: Buffer; sha256: string; textHash: string | null; signers?: SignerMatch[]; check: unknown }): Promise<DocRow> {
  const storageKey = bucketKey(ENGAGEMENT_DOCUMENTS_BUCKET, `${dbId}/assist-filing/${form}/${kind}-${randomUUID()}.pdf`);
  await putObject(storageKey, input.bytes, 'application/pdf');
  const [row] = await db
    .insert(assistFilingDocuments)
    .values({
      engagementId: dbId,
      form,
      kind,
      fileName: input.fileName,
      storageKey,
      sizeBytes: input.bytes.length,
      sha256: input.sha256,
      textHash: input.textHash,
      signers: input.signers ?? [],
      check: input.check as object,
      uploadedBy: ctx.userId,
    })
    .returning();
  return row!;
}

/** The latest document of a kind with these bytes, so a repeat post by the extension adds nothing. */
async function sameBytes(dbId: string, form: FilingForm, kind: 'portal_pdf' | 'signed_pdf', sha256: string): Promise<DocRow | null> {
  const docs = await documentsOf(dbId, form);
  const latest = latestOf(docs, kind);
  return latest && latest.sha256 === sha256 ? latest : null;
}

/** The states a new portal PDF sends a Part B filing back to review from. */
const PORTAL_PDF_MOVES: ReadonlySet<FilingState> = new Set(['data_ready', 'part_b_filling', 'resubmit', 'pdf_review', 'awaiting_signatures', 'signed_ready', 'upload_pending']);

/**
 * Store a portal PDF. When its text differs from the last one, every signed copy goes stale and
 * the approval is cleared, because what was approved and signed is no longer the current form.
 */
export async function savePortalPdf(
  ctx: AuthContext,
  engagementParam: string,
  form: FilingForm,
  input: { fileName: string; bytes: Buffer; sha256: string; textHash: string | null; check: unknown },
): Promise<{ dbId: string; document: FilingDocumentDto; filing: FilingDto; created: boolean; textChanged: boolean } | null> {
  const scope = await staffScope(ctx, engagementParam);
  if (!scope) return null;
  const row = await ensureRow(scope.dbId, form);
  const repeat = await sameBytes(scope.dbId, form, 'portal_pdf', input.sha256);
  if (repeat) return { dbId: scope.dbId, document: toDocDto(repeat, ctx.name), filing: await dtoOf(row), created: false, textChanged: false };

  const previous = latestOf(await documentsOf(scope.dbId, form), 'portal_pdf');
  // No text on either side means the two cannot be shown to read the same, and the bytes differ.
  const textChanged = Boolean(previous) && (previous!.textHash !== input.textHash || input.textHash === null);
  const doc = await storeDocument(ctx, scope.dbId, form, 'portal_pdf', input);
  if (textChanged) {
    await db
      .update(assistFilingDocuments)
      .set({ stale: true })
      .where(and(eq(assistFilingDocuments.engagementId, scope.dbId), eq(assistFilingDocuments.form, form), eq(assistFilingDocuments.kind, 'signed_pdf')));
  }
  const now = new Date();
  const moves = form === 'spice-part-b' && PORTAL_PDF_MOVES.has(row.state as FilingState) && (textChanged || !previous || row.state === 'data_ready' || row.state === 'part_b_filling');
  const [next] = await db
    .update(assistFilings)
    .set({
      updatedAt: now,
      ...(moves ? { state: 'pdf_review' } : {}),
      ...(textChanged ? { reviewedBy: null, reviewedAt: null, reviewNote: null } : {}),
    })
    .where(and(eq(assistFilings.id, row.id), eq(assistFilings.engagementId, scope.dbId)))
    .returning();
  return { dbId: scope.dbId, document: toDocDto(doc, ctx.name), filing: await dtoOf(next!), created: true, textChanged };
}

/** Store a signed PDF that passed `checkSignedPdf`. All signers in: ready; otherwise still awaiting. */
export async function saveSignedPdf(
  ctx: AuthContext,
  engagementParam: string,
  form: FilingForm,
  input: { fileName: string; bytes: Buffer; sha256: string; textHash: string | null; signers: SignerMatch[]; check: unknown; allSigned: boolean },
): Promise<{ dbId: string; document: FilingDocumentDto; filing: FilingDto; created: boolean } | null> {
  const scope = await staffScope(ctx, engagementParam);
  if (!scope) return null;
  const row = await ensureRow(scope.dbId, form);
  const repeat = await sameBytes(scope.dbId, form, 'signed_pdf', input.sha256);
  if (repeat) return { dbId: scope.dbId, document: toDocDto(repeat, ctx.name), filing: await dtoOf(row), created: false };
  const doc = await storeDocument(ctx, scope.dbId, form, 'signed_pdf', input);
  const moves = row.state === 'pdf_review' || row.state === 'awaiting_signatures';
  const [next] = await db
    .update(assistFilings)
    .set({ updatedAt: new Date(), ...(moves ? { state: input.allSigned ? 'signed_ready' : 'awaiting_signatures' } : {}) })
    .where(and(eq(assistFilings.id, row.id), eq(assistFilings.engagementId, scope.dbId)))
    .returning();
  return { dbId: scope.dbId, document: toDocDto(doc, ctx.name), filing: await dtoOf(next!), created: true };
}

/** One document's bytes, for the extension's signed upload. A foreign id reads as not found. */
export async function readFilingDocument(
  ctx: AuthContext,
  engagementParam: string,
  documentId: string,
): Promise<{ dbId: string; fileName: string; contentType: string; bytes: Buffer; kind: string; form: string } | null> {
  const scope = await staffScope(ctx, engagementParam);
  if (!scope || !UUID.test(documentId)) return null;
  const [row] = await db
    .select()
    .from(assistFilingDocuments)
    .where(and(eq(assistFilingDocuments.id, documentId), eq(assistFilingDocuments.engagementId, scope.dbId)))
    .limit(1);
  if (!row || !row.storageKey.startsWith(`${ENGAGEMENT_DOCUMENTS_BUCKET}/${scope.dbId}/`)) return null;
  const bytes = await getObjectBuffer(row.storageKey);
  if (!bytes) return null;
  return { dbId: scope.dbId, fileName: row.fileName, contentType: 'application/pdf', bytes, kind: row.kind, form: row.form };
}

/**
 * The professional approval of the latest portal PDF. Refused while values are missing, the PDF
 * cannot be read or nothing was compared, unless a note says why it is approved anyway.
 */
export async function recordFilingReview(ctx: AuthContext, engagementParam: string, form: FilingForm, note: string | null): Promise<{ dbId: string; filing: FilingDto; withNote: boolean } | null> {
  const scope = await staffScope(ctx, engagementParam);
  if (!scope) return null;
  const row = await ensureRow(scope.dbId, form);
  const portal = latestOf(await documentsOf(scope.dbId, form), 'portal_pdf');
  if (!portal) throw new FilingRefusal('no_portal_pdf', 'Add the PDF from the portal before approving it.');
  const check = (portal.check ?? {}) as Partial<PdfCompareResult>;
  const clean = check.unreadable === false && (check.checked ?? 0) > 0 && (check.missing?.length ?? 0) === 0;
  const text = note?.trim() || null;
  if (!clean && !text) {
    throw new FilingRefusal('missing_values_need_note', check.unreadable ? 'The PDF text cannot be read. Say why you approve it anyway.' : 'Values are missing from the PDF. Say why you approve it anyway.', 422);
  }
  const now = new Date();
  const [next] = await db
    .update(assistFilings)
    .set({ reviewedBy: ctx.userId, reviewedAt: now, reviewNote: text, updatedAt: now })
    .where(and(eq(assistFilings.id, row.id), eq(assistFilings.engagementId, scope.dbId)))
    .returning();
  return { dbId: scope.dbId, filing: await dtoOf(next!), withNote: Boolean(text) };
}

/** A short-lived link to the latest portal PDF, for a signature request. Exactly one object. */
export async function portalPdfForSigners(
  ctx: AuthContext,
  engagementParam: string,
  form: FilingForm,
  expiresInSeconds: number,
): Promise<{ dbId: string; documentId: string; fileName: string; url: string; bytes: Buffer | null; companyName: string } | null> {
  const scope = await staffScope(ctx, engagementParam);
  if (!scope) return null;
  const row = await ensureRow(scope.dbId, form);
  const portal = latestOf(await documentsOf(scope.dbId, form), 'portal_pdf');
  if (!portal) throw new FilingRefusal('no_portal_pdf', 'Add the PDF from the portal before asking for signatures.');
  if (!row.reviewedAt) throw new FilingRefusal('not_reviewed', 'The professional has not approved the PDF yet.');
  if (!portal.storageKey.startsWith(`${ENGAGEMENT_DOCUMENTS_BUCKET}/${scope.dbId}/`)) throw new FilingRefusal('no_portal_pdf', 'The PDF is not in storage.');
  const url = await signedDownloadUrl(portal.storageKey, expiresInSeconds);
  const bytes = (portal.sizeBytes ?? Infinity) <= 7 * 1024 * 1024 ? await getObjectBuffer(portal.storageKey) : null;
  return { dbId: scope.dbId, documentId: portal.id, fileName: portal.fileName, url, bytes, companyName: scope.row.companyName };
}

/** Log the emails sent. The first one that went out moves a filing in review to awaiting signatures. */
export async function recordSignatureRequests(ctx: AuthContext, engagementParam: string, form: FilingForm, entries: SignatureRequestEntry[]): Promise<{ dbId: string; filing: FilingDto } | null> {
  const scope = await staffScope(ctx, engagementParam);
  if (!scope) return null;
  const row = await ensureRow(scope.dbId, form);
  const anySent = entries.some((e) => e.outcome === 'sent');
  const [next] = await db
    .update(assistFilings)
    .set({
      signatureRequests: [...asRequests(row.signatureRequests), ...entries],
      updatedAt: new Date(),
      ...(anySent && row.state === 'pdf_review' ? { state: 'awaiting_signatures' } : {}),
    })
    .where(and(eq(assistFilings.id, row.id), eq(assistFilings.engagementId, scope.dbId)))
    .returning();
  return { dbId: scope.dbId, filing: await dtoOf(next!) };
}

/* ---------------------------------------------------------------------------------------- */
/* The deadline job: no session, so no AuthContext. Called from src/jobs only.                  */
/* ---------------------------------------------------------------------------------------- */

export interface FilingAlert {
  filingId: string;
  engagementId: string;
  companyName: string;
  form: FilingForm;
  recipientId: string;
  href: string;
  due: FilingDeadline[];
  /** DSCs that lapse soon, on one filing per engagement only. */
  dsc: DscDeadline[];
  alertedOn: Record<string, string>;
}

/**
 * Filings with an upload or payment date inside the alert window today, with the person to tell:
 * the engagement's lead, else its manager. Soft-deleted engagements are left out.
 */
export async function systemFilingAlertsDue(today: string): Promise<FilingAlert[]> {
  const rows = await db
    .select({ filing: assistFilings, engagement: engagements })
    .from(assistFilings)
    .innerJoin(engagements, eq(engagements.id, assistFilings.engagementId))
    .where(and(isNull(engagements.deletedAt), notInArray(assistFilings.state, ['submitted', 'approved', 'resubmit', 'cancelled'])))
    .limit(2000);
  // DSC alerts go on one filing per engagement, Part B when it is open, so two forms cannot repeat them.
  const dscRow = new Map<string, string>();
  for (const { filing } of rows) {
    if (!dscRow.has(filing.engagementId) || filing.form === 'spice-part-b') dscRow.set(filing.engagementId, filing.id);
  }
  const out: FilingAlert[] = [];
  for (const { filing, engagement } of rows) {
    const alertedOn = (filing.alertedOn ?? {}) as Record<string, string>;
    const due = deadlinesToAlert(
      { form: filing.form as FilingForm, state: filing.state as FilingState, srnAt: filing.srnAt, signedUploadedAt: filing.signedUploadedAt, paidAt: filing.paidAt, nameApprovedAt: filing.nameApprovedAt },
      today,
      alertedOn,
    );
    const directors = dscRow.get(filing.engagementId) === filing.id ? readProposedDirectors(checklistStateFromRow(engagement)) : [];
    const dsc = dscDeadlinesToAlert(
      directors.map((d) => ({ id: d.id, name: displayName(d.values), hasDsc: d.values.hasDsc === 'no' ? false : d.values.hasDsc === 'yes' ? true : null, dscExpiry: d.values.dscExpiryDate || null })),
      today,
      alertedOn,
    );
    if (due.length === 0 && dsc.length === 0) continue;
    const leadId = await leadProfileId(engagement);
    const recipientId = leadId ?? engagement.managerId ?? engagement.adminId ?? null;
    if (!recipientId) continue;
    const appId = appEngagementId(engagement.id);
    out.push({
      filingId: filing.id,
      engagementId: appId,
      companyName: engagement.companyName,
      form: filing.form as FilingForm,
      recipientId,
      // The card is on the engagement page, not on the project page.
      href: leadId ? internEngagementPath({ id: appId, slug: engagement.slug }) : `/app/${engagement.managerId ? 'manager' : 'admin'}/engagements/${appId}`,
      due,
      dsc,
      alertedOn,
    });
  }
  return out;
}

/** Remember today's alert so a job retry or a second run the same day cannot repeat it. */
export async function systemMarkFilingAlerted(filingId: string, alertedOn: Record<string, string>, keys: string[], today: string): Promise<void> {
  const next = { ...alertedOn };
  for (const key of keys) next[key] = today;
  await db.update(assistFilings).set({ alertedOn: next }).where(eq(assistFilings.id, filingId));
}

/* ---------------------------------------------------------------------------------------- */
/* Signers' MCA set-up                                                                         */
/* ---------------------------------------------------------------------------------------- */

const dateText = (v: string | Date | null | undefined): string | null => (v ? (v instanceof Date ? istDate(v) : String(v).slice(0, 10)) : null);

/** What staff confirmed for each signer of one engagement, by signer id. */
export async function signerFactsOf(dbId: string): Promise<Map<string, SignerPortalFacts>> {
  const rows = await db.select().from(assistFilingSigners).where(eq(assistFilingSigners.engagementId, dbId)).limit(200);
  return new Map(rows.map((r) => [r.signerId, { businessUserOn: dateText(r.businessUserOn), dscAssociatedOn: dateText(r.dscAssociatedOn) }]));
}

export interface SignerFactsPatch {
  businessUserOn?: string | null;
  dscAssociatedOn?: string | null;
}

/**
 * Record or clear what staff confirmed about one signer. The caller has checked that the signer
 * belongs to this engagement. A date cannot be in the future. Null when out of scope.
 */
export async function setSignerFacts(ctx: AuthContext, engagementParam: string, signerId: string, patch: SignerFactsPatch): Promise<{ dbId: string; facts: SignerPortalFacts } | null> {
  const scope = await staffScope(ctx, engagementParam);
  if (!scope) return null;
  const today = istDate(new Date());
  for (const v of [patch.businessUserOn, patch.dscAssociatedOn]) {
    if (v && v > today) throw new FilingRefusal('date_in_future', 'A confirmation date cannot be in the future.', 422);
  }
  const set: Partial<typeof assistFilingSigners.$inferInsert> = { updatedBy: ctx.userId, updatedAt: new Date() };
  if (patch.businessUserOn !== undefined) set.businessUserOn = patch.businessUserOn;
  if (patch.dscAssociatedOn !== undefined) set.dscAssociatedOn = patch.dscAssociatedOn;
  await db
    .insert(assistFilingSigners)
    .values({ engagementId: scope.dbId, signerId, ...set })
    .onConflictDoUpdate({ target: [assistFilingSigners.engagementId, assistFilingSigners.signerId], set });
  const facts = (await signerFactsOf(scope.dbId)).get(signerId) ?? { businessUserOn: null, dscAssociatedOn: null };
  return { dbId: scope.dbId, facts };
}

/* ---------------------------------------------------------------------------------------- */
/* Filing packets                                                                               */
/* ---------------------------------------------------------------------------------------- */

export interface PacketSummary {
  version: number;
  hash: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

type PacketRow = typeof assistFilingPackets.$inferSelect;

async function latestPacketRow(dbId: string): Promise<PacketRow | null> {
  const [row] = await db
    .select()
    .from(assistFilingPackets)
    .where(eq(assistFilingPackets.engagementId, dbId))
    .orderBy(desc(assistFilingPackets.version))
    .limit(1);
  return row ?? null;
}

async function summaryOf(row: PacketRow): Promise<PacketSummary> {
  const names = await namesOf([row.createdBy]);
  return { version: row.version, hash: row.hash, note: row.note ?? null, createdBy: row.createdBy ? (names.get(row.createdBy) ?? null) : null, createdAt: iso(row.createdAt)! };
}

/** The latest packet and what differs from the current data. `dbId` comes from a scoped read. */
export async function packetStatus(dbId: string, current: PacketContent, currentHash: string): Promise<{ latest: PacketSummary | null; changed: PacketPart[] }> {
  const row = await latestPacketRow(dbId);
  if (!row) return { latest: null, changed: [] };
  return { latest: await summaryOf(row), changed: row.hash === currentHash ? [] : packetChanges(row.content as PacketContent, current) };
}

/**
 * Freeze the current data as the next packet. The same data as the latest packet adds nothing,
 * so a repeated press is safe. A concurrent freeze loses the race on the unique version and is
 * read back. Null when out of scope.
 */
export async function freezePacket(
  ctx: AuthContext,
  engagementParam: string,
  content: PacketContent,
  hash: string,
  note: string | null,
): Promise<{ dbId: string; packet: PacketSummary; created: boolean } | null> {
  const scope = await staffScope(ctx, engagementParam);
  if (!scope) return null;
  const latest = await latestPacketRow(scope.dbId);
  if (latest && latest.hash === hash) return { dbId: scope.dbId, packet: await summaryOf(latest), created: false };
  const version = (latest?.version ?? 0) + 1;
  const [row] = await db
    .insert(assistFilingPackets)
    .values({ engagementId: scope.dbId, version, hash, content, note, createdBy: ctx.userId })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    const now = await latestPacketRow(scope.dbId);
    if (!now) throw new FilingRefusal('packet_conflict', 'Another freeze is running. Try again.', 409);
    return { dbId: scope.dbId, packet: await summaryOf(now), created: false };
  }
  return { dbId: scope.dbId, packet: await summaryOf(row), created: true };
}

/** One packet in full, for download. Null when out of scope or not found. */
export async function readPacket(ctx: AuthContext, engagementParam: string, version: number): Promise<{ summary: PacketSummary; content: PacketContent; companyName: string } | null> {
  const scope = await staffScope(ctx, engagementParam);
  if (!scope) return null;
  const [row] = await db
    .select()
    .from(assistFilingPackets)
    .where(and(eq(assistFilingPackets.engagementId, scope.dbId), eq(assistFilingPackets.version, version)))
    .limit(1);
  if (!row) return null;
  return { summary: await summaryOf(row), content: row.content as PacketContent, companyName: scope.row.companyName };
}

/* ---------------------------------------------------------------------------------------- */
/* Remark causes                                                                               */
/* ---------------------------------------------------------------------------------------- */

/**
 * The cause of every MCA remark recorded since `sinceIso`, across the firm. Counts only: no
 * company, remark text or name leaves this function, so every staff member may see them.
 */
export async function remarkCausesSince(ctx: AuthContext, sinceIso: string): Promise<string[]> {
  if (!isStaff(ctx)) throw new AssistForbiddenError('Only firm staff can read remark causes');
  const rows = await db
    .select({ remarks: assistFilings.remarks })
    .from(assistFilings)
    .innerJoin(engagements, eq(engagements.id, assistFilings.engagementId))
    .where(and(isNull(engagements.deletedAt), gte(assistFilings.updatedAt, new Date(sinceIso))))
    .limit(5000);
  const out: string[] = [];
  for (const r of rows) for (const m of asRemarks(r.remarks)) if (m.cause && m.at >= sinceIso) out.push(m.cause);
  return out;
}

