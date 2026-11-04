import { companyShortName } from '@/lib/client-portal/company';
import 'server-only';

import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  documentRequestDetails,
  documentRequestFiles,
  documentRequests,
  profiles,
} from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import {
  assertEngagementAccess,
  checklistStateForViewer,
  checklistStateFromRow,
  getMyEngagement,
  type EngagementDbRow,
} from '@/db/repositories/engagements';
import { getDocumentById, listDocuments } from '@/db/repositories/documents';
import { getBoardResolutionByEngagementId } from '@/db/repositories/board-resolution';
import { resolveEngagementRecipients } from '@/db/repositories/engagement-recipients';
import { checklist, getItem } from '@/data/checklist';
import { extractItemResponses, getClientResponseFields } from '@/lib/checklist/checklist-responses';
import { repeatFieldLabel } from '@/lib/checklist/checklist-repeat';
import { isStepReleasedTo } from '@/lib/checklist/checklist-visibility';
import { checklistItemForFieldId } from '@/lib/documents/vault-documents';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import {
  fileNameFromStoragePath,
  isMilestoneStoragePath,
  MILESTONE_DOCUMENTS_BUCKET,
  uploadTimestampFromStoragePath,
} from '@/lib/documents/milestone-document-storage';
import { ENGAGEMENT_DOCUMENTS_BUCKET } from '@/lib/board-resolution/board-resolution-storage';
import {
  EXTENSION_TO_MIME,
  MAX_UPLOAD_BYTES,
  MILESTONE_DOCUMENT_EXTENSIONS,
  maxUploadSizeError,
  maxUploadSizeLabel,
  resolveUploadContentType,
  resolveUploadExtension,
} from '@/lib/upload-limits';
import {
  categoryFor,
  DOC_CATEGORIES,
  isStaleProof,
  OTHER_PHASE_ID,
  OTHER_PHASE_TITLE,
  portalForField,
  stepNumbers,
  zipSegment,
  type ClientDocumentsPayload,
  type DocNode,
  type OpenRequest,
} from '@/lib/client-portal/documents';
import { bucketKey, deleteObject, getObjectBuffer, listObjects, putObject, type StorageBucket } from '@/storage/s3';

/**
 * CLIENT DOCUMENTS REPOSITORY (client portal v7 — Documents page).
 *
 * >>> ACCESS CONTROL (Path A) <<<
 * Client role only. Every function resolves the caller's OWN engagement
 * (`getMyEngagement` + `assertEngagementAccess`) — no caller-supplied
 * engagement id is ever trusted — and then reads only:
 *   - the client-redacted checklist state (`checklistStateForViewer`): a step's
 *     files appear once the step is released to the client;
 *   - `documents` rows through `listDocuments` / `getDocumentById` (client:
 *     shared_with_client = true + released step);
 *   - the board resolution only once finalized (drafts never reach a client);
 *   - `document_requests` / `document_request_details` / `document_request_files`
 *     rows whose engagement_id is that engagement.
 * File refs handed to the browser are re-checked on every download (the ref
 * is resolved against the same rules, never trusted). Uploads go only to the
 * caller's own PENDING requests; Undo only removes the caller's own upload,
 * within 10 minutes.
 *
 * One read is shared with staff: `getClientDocuments(ctx, engagementId)` gives
 * a staff member the same document tree for an engagement that passes
 * `assertEngagementAccess` (firm-wide admins, the engagement's manager or its
 * assigned lead), so the Vault can render the client's own Documents page.
 * Staff see what their role allows (unreleased steps, unshared index rows);
 * every write above stays client-only.
 */

export class ClientDocumentsForbiddenError extends Error {}

const UNDO_WINDOW_MS = 10 * 60_000;

function assertClient(ctx: AuthContext) {
  if (ctx.role !== 'client') throw new ClientDocumentsForbiddenError('Documents portal is for clients only');
}

async function myEngagement(ctx: AuthContext): Promise<{ dbId: string; row: EngagementDbRow } | null> {
  assertClient(ctx);
  const mine = await getMyEngagement(ctx);
  if (!mine) return null;
  const access = await assertEngagementAccess(ctx, mine.id);
  if (!access.ok) return null;
  return { dbId: access.dbId, row: access.row };
}

function shortCompany(name: string): string {
  return companyShortName(name) || name;
}

function todayIST(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

function contentTypeForName(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return (EXTENSION_TO_MIME as Record<string, string>)[ext] ?? null;
}

/** "ravi-kumar_pan.pdf" → "Ravi kumar pan". */
function readableName(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : fileName;
}

/** documents.object_key → bucket + path (same mapping as /api/documents/[id]/signed-url). */
function indexedKey(objectKey: string): { bucket: StorageBucket; path: string } {
  const clean = objectKey.replace(/^\/+/, '');
  if (clean.startsWith(`${MILESTONE_DOCUMENTS_BUCKET}/`)) {
    return { bucket: MILESTONE_DOCUMENTS_BUCKET, path: clean.slice(MILESTONE_DOCUMENTS_BUCKET.length + 1) };
  }
  if (clean.startsWith(`${ENGAGEMENT_DOCUMENTS_BUCKET}/`)) {
    return { bucket: ENGAGEMENT_DOCUMENTS_BUCKET, path: clean.slice(ENGAGEMENT_DOCUMENTS_BUCKET.length + 1) };
  }
  if (isMilestoneStoragePath(clean)) return { bucket: MILESTONE_DOCUMENTS_BUCKET, path: clean };
  return { bucket: ENGAGEMENT_DOCUMENTS_BUCKET, path: clean };
}

/**
 * A request or file saved without a step: put it under the step its label
 * clearly names (a utility bill is step "Registered Office Address", a DIR-2
 * is "Director KYC") instead of the "Other documents" folder. Only plain,
 * unambiguous names; anything else stays step-less.
 */
const LABEL_STEP: Array<[RegExp, string]> = [
  [/utility bill|electricity bill|lease deed|rent agreement|\bnoc\b.*(owner|property|premises)|property owner/i, 'pre-14'],
  [/\bdir-?2\b|director kyc/i, 'pre-6'],
  [/signed board resolution|board resolution \(final\)/i, 'pre-3'],
  [/subscriber sheet|\binc-?35\b|\binc-?9\b/i, 'pre-16'],
  [/\bsh-?1\b|share certificate/i, 'post-5'],
  [/\badt-?1\b|auditor consent/i, 'post-2'],
  [/fc-?gpr|\bfirc\b/i, 'post-7'],
];

function stepFor(stepId: string | null | undefined, label: string): string | undefined {
  if (stepId && getItem(stepId)) return stepId;
  for (const [re, id] of LABEL_STEP) if (re.test(label) && getItem(id)) return id;
  return undefined;
}

function noteFromDetail(detail: string | null): string | undefined {
  if (!detail) return undefined;
  const text = detail
    .split('\n')
    .filter((l) => !/^(file|uploadedAt):/.test(l.trim()))
    .join(' ')
    .trim();
  return text || undefined;
}

/* ------------------------------------------------------------------ */
/* Aggregate: every document source for the client's engagement        */
/* ------------------------------------------------------------------ */

/** The engagement to read: a client's own, or for staff the one they named and may access. */
async function documentsEngagement(
  ctx: AuthContext,
  engagementId?: string,
): Promise<{ dbId: string; row: EngagementDbRow } | null> {
  if (ctx.role === 'client') return myEngagement(ctx);
  if (!engagementId) return null;
  const access = await assertEngagementAccess(ctx, engagementId);
  if (!access.ok) return null;
  return { dbId: access.dbId, row: access.row };
}

type DocumentsEngagement = { dbId: string; row: EngagementDbRow };

export async function getClientDocuments(ctx: AuthContext, engagementId?: string): Promise<ClientDocumentsPayload | null> {
  const mine = await documentsEngagement(ctx, engagementId);
  return mine ? documentsFor(ctx, mine) : null;
}

async function documentsFor(ctx: AuthContext, mine: DocumentsEngagement): Promise<ClientDocumentsPayload> {
  const { dbId, row } = mine;
  const company = shortCompany(row.companyName);
  const state = checklistStateForViewer(ctx, checklistStateFromRow(row));
  const today = todayIST();
  const now = new Date();

  const [recipients, indexed, br, s3Objects, reqRows] = await Promise.all([
    resolveEngagementRecipients(dbId).catch(() => null),
    listDocuments(ctx, dbId).catch(() => []),
    getBoardResolutionByEngagementId(ctx, dbId).catch(() => null),
    listObjects(`${MILESTONE_DOCUMENTS_BUCKET}/${dbId}/`).catch(() => [] as Awaited<ReturnType<typeof listObjects>>),
    db
      .select({ req: documentRequests, det: documentRequestDetails, askedBy: profiles.name })
      .from(documentRequests)
      .leftJoin(documentRequestDetails, eq(documentRequestDetails.requestId, documentRequests.id))
      .leftJoin(profiles, eq(profiles.id, documentRequests.requestedBy))
      .where(and(eq(documentRequests.engagementId, dbId), ne(documentRequests.status, 'cancelled')))
      .orderBy(desc(documentRequests.createdAt)),
  ]);
  const leadName = recipients?.leads?.[0]?.name;
  const sbcFrom = leadName ? `SBC · ${leadName}` : 'SBC';

  const nodes: DocNode[] = [];
  const usedPaths = new Set<string>();

  /* ---- earlier uploads per milestone field (S3 listing) ---- */
  const versionsByField = new Map<string, Array<{ path: string; size: number | null }>>();
  const prefix = `${MILESTONE_DOCUMENTS_BUCKET}/`;
  for (const o of s3Objects) {
    const path = o.key.startsWith(prefix) ? o.key.slice(prefix.length) : o.key;
    if (!isMilestoneStoragePath(path)) continue;
    const parts = path.split('/');
    const field = parts.slice(1, -1).join('/');
    const list = versionsByField.get(field) ?? [];
    list.push({ path, size: o.size });
    versionsByField.set(field, list);
  }
  const sizeByPath = new Map<string, number | null>(s3Objects.map((o): [string, number | null] => [o.key.startsWith(prefix) ? o.key.slice(prefix.length) : o.key, o.size]));

  /* ---- checklist uploads ---- */
  for (const item of checklist) {
    const slice = state[item.id];
    if (!slice || !isStepReleasedTo('client', slice)) continue;
    const responses = extractItemResponses(item, slice);
    const fields = getClientResponseFields(item);
    const fieldById = new Map(fields.map((f) => [f.id, f]));
    const firmStep = item.responsibleRole !== 'client';
    const done =
      slice.status === 'completed' ||
      slice.status === 'not-applicable' ||
      Boolean(slice.deliveredToClientAt?.trim()) ||
      slice.reviewStatus === 'accepted';
    const status: DocNode['status'] = firmStep ? (done ? 'Final' : 'In review') : done ? 'Approved' : 'In review';
    const from = firmStep ? sbcFrom : company;

    const add = (fieldId: string, path: string, label: string) => {
      const ts = uploadTimestampFromStoragePath(path);
      const date = ts ? new Date(ts).toISOString() : slice.deliveredToClientAt || slice.clientSubmittedAt || undefined;
      usedPaths.add(path);
      nodes.push({
        id: `m-${item.id}-${fieldId}`,
        ref: `m:${path}`,
        label,
        fileName: fileNameFromStoragePath(path),
        contentType: contentTypeForName(path),
        sizeBytes: sizeByPath.get(path) ?? null,
        status,
        replaced: false,
        from,
        fromSbc: firmStep,
        date,
        stepId: item.id,
        categoryId: categoryFor(item.id, label),
        stale: isStaleProof(label, date, now),
        ...(/Signed(Url)?$/.test(fieldId) ? { signed: true } : {}),
        portal: portalForField(fieldId),
        source: 'milestone',
      });
      // earlier uploads of the same field → Replaced versions (v1, v2…)
      const older = (versionsByField.get(fieldId) ?? [])
        .filter((v) => v.path !== path && (uploadTimestampFromStoragePath(v.path) ?? 0) < (ts ?? Number.MAX_SAFE_INTEGER))
        .sort((a, b) => (uploadTimestampFromStoragePath(a.path) ?? 0) - (uploadTimestampFromStoragePath(b.path) ?? 0));
      older.forEach((v, k) => {
        const vts = uploadTimestampFromStoragePath(v.path);
        usedPaths.add(v.path);
        nodes.push({
          id: `m-${item.id}-${fieldId}-v${k + 1}`,
          ref: `m:${v.path}`,
          label: `${label} (v${k + 1})`,
          fileName: fileNameFromStoragePath(v.path),
          contentType: contentTypeForName(v.path),
          sizeBytes: v.size,
          status: 'Replaced',
          replaced: true,
          from,
          fromSbc: firmStep,
          date: vts ? new Date(vts).toISOString() : undefined,
          stepId: item.id,
          categoryId: categoryFor(item.id, label),
          source: 'milestone',
        });
      });
    };

    const used = new Set<string>();
    for (const field of fields) {
      if (field.type !== 'file') continue;
      const p = String(responses[field.id] ?? '').trim();
      if (!isMilestoneStoragePath(p)) continue;
      used.add(field.id);
      add(field.id, p, field.label);
    }
    for (const [fieldId, value] of Object.entries(responses)) {
      if (used.has(fieldId) || typeof value !== 'string' || !isMilestoneStoragePath(value)) continue;
      const field = fieldById.get(fieldId);
      const label = field?.label ?? repeatFieldLabel(fields, responses, fieldId) ?? readableName(fileNameFromStoragePath(value));
      add(fieldId, value.trim(), label);
    }
  }

  /* ---- indexed documents shared with the client ---- */
  if (indexed.length) {
    const uploaderIds = [...new Set(indexed.map((d) => d.uploadedBy).filter(Boolean) as string[])];
    const ups = uploaderIds.length
      ? await db.select({ id: profiles.id, name: profiles.name, role: profiles.role }).from(profiles).where(inArray(profiles.id, uploaderIds))
      : [];
    const upById = new Map(ups.map((u) => [u.id, u]));
    for (const d of indexed) {
      const { bucket, path } = indexedKey(d.objectKey);
      if (bucket === MILESTONE_DOCUMENTS_BUCKET && usedPaths.has(path)) continue;
      const up = d.uploadedBy ? upById.get(d.uploadedBy) : undefined;
      const fromClient = up?.role === 'client';
      const label = readableName(d.fileName);
      nodes.push({
        id: `d-${d.id}`,
        ref: `d:${d.id}`,
        label,
        fileName: d.fileName,
        contentType: d.contentType ?? contentTypeForName(d.fileName),
        sizeBytes: d.sizeBytes,
        status: fromClient ? 'Approved' : 'Final',
        replaced: false,
        from: fromClient ? company : up?.name ? `SBC · ${up.name}` : 'SBC',
        fromSbc: !fromClient,
        date: d.createdAt,
        stepId: stepFor(d.stepId, label),
        categoryId: categoryFor(stepFor(d.stepId, label), `${label} ${d.category ?? ''}`),
        stale: isStaleProof(label, d.createdAt, now),
        source: 'index',
      });
    }
  }

  /* ---- board resolution (finalized only; never a draft) ---- */
  if (br && br.status === 'finalized') {
    const finalizer = br.finalizedBy
      ? (await db.select({ name: profiles.name }).from(profiles).where(eq(profiles.id, br.finalizedBy)).limit(1))[0]?.name
      : undefined;
    const signed = br.signedStoragePath?.trim();
    if (signed) {
      nodes.push({
        id: 'br-signed',
        ref: 'br:signed',
        label: 'Board resolution (final)',
        fileName: signed.split('/').pop() || 'signed-board-resolution.pdf',
        contentType: contentTypeForName(signed),
        status: 'Final',
        replaced: false,
        from: company,
        fromSbc: false,
        date: br.signedUploadedAt ?? undefined,
        stepId: 'pre-3',
        categoryId: 'c3',
        signed: true,
        source: 'board-resolution',
      });
    }
    if (br.storagePath?.trim()) {
      nodes.push({
        id: 'br-final',
        ref: 'br:final',
        label: signed ? 'Board resolution (unsigned)' : 'Board resolution (final)',
        fileName: 'board-resolution.docx',
        contentType: EXTENSION_TO_MIME.docx,
        status: signed ? 'Replaced' : 'Final',
        replaced: Boolean(signed),
        from: finalizer ? `SBC · ${finalizer}` : sbcFrom,
        fromSbc: true,
        date: br.finalizedAt ?? undefined,
        stepId: 'pre-3',
        categoryId: 'c3',
        source: 'board-resolution',
      });
    }
  }

  /* ---- document requests ---- */
  const reqIds = reqRows.map((r) => r.req.id);
  const files = reqIds.length
    ? await db
        .select()
        .from(documentRequestFiles)
        .where(and(eq(documentRequestFiles.engagementId, dbId), inArray(documentRequestFiles.requestId, reqIds)))
        .orderBy(desc(documentRequestFiles.uploadedAt))
    : [];
  const filesByReq = new Map<string, typeof files>();
  for (const f of files) {
    const list = filesByReq.get(f.requestId) ?? [];
    list.push(f);
    filesByReq.set(f.requestId, list);
  }
  const openRequests: OpenRequest[] = [];
  for (const { req, det, askedBy } of reqRows) {
    const stepId = stepFor(det?.stepId, req.title);
    const reqFiles = filesByReq.get(req.id) ?? [];
    const pending = req.status === 'pending';
    const due = det?.dueOn ?? undefined;
    const overdue = Boolean(pending && due && due < today);
    const note = det?.reviewNote?.trim() || (pending && reqFiles.length ? noteFromDetail(req.detail) : undefined);
    const noteBy = det?.reviewNote?.trim() ? undefined : askedBy ?? undefined;
    const cat = categoryFor(stepId, req.title);
    if (pending) {
      openRequests.push({ id: req.id, label: req.title, due, overdue, stepId, note, noteBy, askedBy: askedBy ?? undefined, reupload: reqFiles.length > 0 });
      nodes.push({
        id: `req-${req.id}`,
        label: req.title,
        fileName: '—',
        status: 'Missing',
        replaced: false,
        from: askedBy ? `Asked by ${askedBy}` : 'Asked by SBC',
        fromSbc: true,
        date: due,
        due,
        overdue,
        stepId,
        categoryId: cat,
        requestId: req.id,
        note,
        noteBy,
        source: 'request',
      });
    }
    const current = pending ? undefined : reqFiles.find((f) => !f.replacedAt) ?? reqFiles[0];
    const older = reqFiles.filter((f) => f !== current).reverse();
    if (current) {
      nodes.push({
        id: `rf-${current.id}`,
        ref: `r:${current.id}`,
        label: req.title,
        fileName: current.fileName,
        contentType: current.contentType,
        sizeBytes: current.sizeBytes,
        status: req.status === 'approved' ? 'Approved' : 'In review',
        replaced: false,
        from: company,
        fromSbc: false,
        date: current.uploadedAt.toISOString(),
        stepId,
        categoryId: cat,
        stale: isStaleProof(req.title, current.uploadedAt.toISOString(), now),
        requestId: req.id,
        source: 'request',
      });
    }
    older.forEach((f, k) => {
      nodes.push({
        id: `rf-${f.id}`,
        ref: `r:${f.id}`,
        label: `${req.title} (v${k + 1})`,
        fileName: f.fileName,
        contentType: f.contentType,
        sizeBytes: f.sizeBytes,
        status: 'Replaced',
        replaced: true,
        from: company,
        fromSbc: false,
        date: f.uploadedAt.toISOString(),
        stepId,
        categoryId: cat,
        requestId: req.id,
        source: 'request',
      });
    });
  }

  return {
    engagementId: appEngagementId(dbId),
    companyName: row.companyName,
    companyShort: company,
    nodes,
    openRequests,
    accept: { exts: [...MILESTONE_DOCUMENT_EXTENSIONS], maxLabel: maxUploadSizeLabel() },
  };
}

/* ------------------------------------------------------------------ */
/* Resolve a file ref (re-checked on every download)                   */
/* ------------------------------------------------------------------ */

export interface ResolvedClientFile {
  key: string;
  fileName: string;
  contentType: string;
}

async function resolveClientDocumentFile(
  ctx: AuthContext,
  ref: string,
  engagementId?: string,
): Promise<ResolvedClientFile | null> {
  const mine = await documentsEngagement(ctx, engagementId);
  return mine ? resolveFileIn(ctx, mine, ref) : null;
}

/** Resolve one ref inside an engagement the caller was already checked against. */
async function resolveFileIn(
  ctx: AuthContext,
  mine: DocumentsEngagement,
  ref: string,
  boardResolution: () => ReturnType<typeof getBoardResolutionByEngagementId> = () => getBoardResolutionByEngagementId(ctx, mine.dbId),
): Promise<ResolvedClientFile | null> {
  const { dbId, row } = mine;
  const ct = (name: string) => contentTypeForName(name) ?? 'application/octet-stream';

  if (ref.startsWith('m:')) {
    const path = ref.slice(2).trim();
    if (!isMilestoneStoragePath(path) || path.split('/')[0] !== dbId) return null;
    const item = path
      .split('/')
      .slice(1, -1)
      .map((seg) => checklistItemForFieldId(seg.split('.')[0] ?? seg))
      .find(Boolean);
    // a path whose field names no step is not shown; a client also waits for the step's release
    if (!item || (ctx.role === 'client' && !isStepReleasedTo('client', checklistStateFromRow(row)[item.id]))) return null;
    const name = fileNameFromStoragePath(path);
    return { key: bucketKey(MILESTONE_DOCUMENTS_BUCKET, path), fileName: name, contentType: ct(name) };
  }
  if (ref.startsWith('d:')) {
    const doc = await getDocumentById(ctx, ref.slice(2));
    if (!doc || appEngagementId(dbId) !== doc.engagementId) return null;
    const { bucket, path } = indexedKey(doc.objectKey);
    return { key: bucketKey(bucket, path), fileName: doc.fileName, contentType: doc.contentType || ct(doc.fileName) };
  }
  if (ref === 'br:final' || ref === 'br:signed') {
    const br = await boardResolution();
    if (!br || br.status !== 'finalized') return null;
    const path = ref === 'br:final' ? br.storagePath?.trim() : br.signedStoragePath?.trim();
    if (!path) return null;
    const name = ref === 'br:final' ? 'board-resolution.docx' : path.split('/').pop() || 'signed-board-resolution.pdf';
    return { key: bucketKey(ENGAGEMENT_DOCUMENTS_BUCKET, path), fileName: name, contentType: ct(name) };
  }
  if (ref.startsWith('r:')) {
    const id = ref.slice(2);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [f] = await db
      .select()
      .from(documentRequestFiles)
      .where(and(eq(documentRequestFiles.id, id), eq(documentRequestFiles.engagementId, dbId)))
      .limit(1);
    if (!f) return null;
    return { key: f.objectKey, fileName: f.fileName, contentType: f.contentType || ct(f.fileName) };
  }
  return null;
}

export async function readClientDocumentFile(
  ctx: AuthContext,
  ref: string,
  engagementId?: string,
): Promise<(ResolvedClientFile & { bytes: Buffer }) | null> {
  const file = await resolveClientDocumentFile(ctx, ref, engagementId);
  if (!file) return null;
  const bytes = await getObjectBuffer(file.key);
  if (!bytes) return null;
  return { ...file, bytes };
}

/* ------------------------------------------------------------------ */
/* ZIP — real step names as folders                                    */
/* ------------------------------------------------------------------ */

export interface ClientZipEntry {
  /** Path inside the archive. */
  name: string;
  /** Storage key to stream the bytes from. */
  key: string;
  /** Size from the listing or index row; null when unknown. */
  sizeBytes: number | null;
}

/**
 * The files of one folder of the documents tree, ready to stream as a ZIP (finding 4 of the
 * 2026-11-04 audit): the engagement is resolved once and every file is re-checked against it,
 * but no bytes are read here. The route streams the entries with `createZipStream`.
 */
export async function listClientDocumentsZip(
  ctx: AuthContext,
  folder: string,
  engagementId?: string,
): Promise<{ engagementId: string; filename: string; entries: ClientZipEntry[]; missing: number } | null> {
  const mine = await documentsEngagement(ctx, engagementId);
  if (!mine) return null;
  const payload = await documentsFor(ctx, mine);
  const steps = stepNumbers();
  const byCategory = folder.startsWith('cat:');
  const pick = payload.nodes.filter((nd) => {
    if (nd.replaced || nd.status === 'Missing' || !nd.ref) return false;
    if (folder === 'all') return true;
    if (folder.startsWith('phase:')) {
      const ph = folder.slice(6);
      return ph === OTHER_PHASE_ID ? !nd.stepId || !steps[nd.stepId] : !!nd.stepId && steps[nd.stepId]?.phaseId === ph;
    }
    if (folder.startsWith('step:')) return nd.stepId === folder.slice(5);
    if (byCategory) return nd.categoryId === folder.slice(4);
    return false;
  });

  let rootName = `${payload.companyShort} documents`;
  if (folder.startsWith('phase:')) {
    const ph = folder.slice(6);
    rootName = ph === OTHER_PHASE_ID ? OTHER_PHASE_TITLE : Object.values(steps).find((s) => s.phaseId === ph)?.phaseTitle ?? rootName;
  } else if (folder.startsWith('step:')) rootName = steps[folder.slice(5)]?.title ?? rootName;
  else if (byCategory) rootName = DOC_CATEGORIES.find((c) => c.id === folder.slice(4))?.name ?? rootName;
  rootName = zipSegment(rootName);

  // The board resolution row is read once for both of its refs.
  let br: ReturnType<typeof getBoardResolutionByEngagementId> | undefined;
  const boardResolution = () => (br ??= getBoardResolutionByEngagementId(ctx, mine.dbId));
  const used = new Set<string>();
  const entries: ClientZipEntry[] = [];
  let missing = 0;
  for (const nd of pick) {
    const file = await resolveFileIn(ctx, mine, nd.ref!, boardResolution);
    if (!file) {
      missing += 1;
      continue;
    }
    const ext = file.fileName.includes('.') ? `.${file.fileName.split('.').pop()}` : '';
    const st = nd.stepId ? steps[nd.stepId] : undefined;
    const parts: string[] = [rootName];
    if (folder === 'all' || folder.startsWith('phase:')) {
      if (folder === 'all') parts.push(zipSegment(st ? st.phaseTitle : OTHER_PHASE_TITLE));
      parts.push(zipSegment(st ? `${st.n} · ${st.title}` : 'Requested files'));
    } else if (byCategory && st) {
      parts.push(zipSegment(`${st.n} · ${st.title}`));
    }
    let path = `${parts.join('/')}/${zipSegment(nd.label)}${ext}`;
    for (let k = 2; used.has(path); k += 1) path = `${parts.join('/')}/${zipSegment(nd.label)} (${k})${ext}`;
    used.add(path);
    entries.push({ name: path, key: file.key, sizeBytes: nd.sizeBytes ?? null });
  }
  return { engagementId: payload.engagementId, filename: `${rootName}.zip`, entries, missing };
}

/* ------------------------------------------------------------------ */
/* Upload against an open request · Undo                               */
/* ------------------------------------------------------------------ */

export class UploadRejectedError extends Error {}

function safeName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'document';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'document';
}

async function uploadRequestFile(
  ctx: AuthContext,
  requestId: string,
  file: { name: string; type: string; size: number; bytes: Buffer },
): Promise<{ fileId: string; requestLabel: string; engagementId: string; requestId: string } | null> {
  const out = await uploadRequestFiles(ctx, requestId, [file]);
  if (!out) return null;
  if (!out.fileIds.length) throw new UploadRejectedError(out.rejected[0]?.error ?? 'Upload failed');
  return { fileId: out.fileIds[0]!, requestLabel: out.requestLabel, engagementId: out.engagementId, requestId };
}

/** Most files one request upload may carry (G-09). */
export const MAX_FILES_PER_REQUEST_UPLOAD = 10;

/**
 * G-09: several files answer one open request in one go. Each file is checked
 * on its own (size, type); a refused file is named in `rejected` and the rest
 * still go in. Earlier files of the request become "Replaced" once, every new
 * file shares one `uploadedAt` (so Undo removes the whole batch), and the
 * request turns fulfilled when at least one file landed.
 */
export async function uploadRequestFiles(
  ctx: AuthContext,
  requestId: string,
  files: Array<{ name: string; type: string; size: number; bytes: Buffer }>,
): Promise<{
  fileIds: string[];
  files: Array<{ fileId: string; fileName: string }>;
  rejected: Array<{ fileName: string; error: string }>;
  requestLabel: string;
  engagementId: string;
  requestId: string;
} | null> {
  const mine = await myEngagement(ctx);
  if (!mine) return null;
  const { dbId } = mine;
  const [req] = await db
    .select()
    .from(documentRequests)
    .where(and(eq(documentRequests.id, requestId), eq(documentRequests.engagementId, dbId)))
    .limit(1);
  if (!req) return null;
  if (req.status !== 'pending') throw new UploadRejectedError('This request is not open any more');
  if (files.length === 0) throw new UploadRejectedError('Choose a file to upload');
  if (files.length > MAX_FILES_PER_REQUEST_UPLOAD) throw new UploadRejectedError(`Up to ${MAX_FILES_PER_REQUEST_UPLOAD} files at a time`);

  const rejected: Array<{ fileName: string; error: string }> = [];
  const stored: Array<{ key: string; fileName: string; contentType: string; size: number }> = [];
  for (const file of files) {
    const fileName = file.name.split(/[/\\]/).pop() || 'document';
    if (file.size === 0) {
      rejected.push({ fileName, error: `${fileName} · the file is empty` });
      continue;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      rejected.push({ fileName, error: `${fileName} · ${maxUploadSizeError()}` });
      continue;
    }
    if (!resolveUploadExtension(file, MILESTONE_DOCUMENT_EXTENSIONS)) {
      rejected.push({ fileName, error: `${fileName} · this file type can't be opened` });
      continue;
    }
    const contentType = resolveUploadContentType(file, MILESTONE_DOCUMENT_EXTENSIONS);
    const key = bucketKey(ENGAGEMENT_DOCUMENTS_BUCKET, `${dbId}/requests/${requestId}/${Date.now()}-${stored.length}-${safeName(file.name)}`);
    await putObject(key, file.bytes, contentType);
    stored.push({ key, fileName, contentType, size: file.size });
  }
  if (stored.length === 0) {
    return { fileIds: [], files: [], rejected, requestLabel: req.title, engagementId: appEngagementId(dbId), requestId };
  }

  const now = new Date();
  const inserted = await db.transaction(async (tx) => {
    await tx
      .update(documentRequestFiles)
      .set({ replacedAt: now })
      .where(and(eq(documentRequestFiles.requestId, requestId), isNull(documentRequestFiles.replacedAt)));
    const rows = await tx
      .insert(documentRequestFiles)
      .values(
        stored.map((f) => ({
          requestId,
          engagementId: dbId,
          objectKey: f.key,
          fileName: f.fileName,
          contentType: f.contentType,
          sizeBytes: f.size,
          uploadedBy: ctx.userId,
          uploadedAt: now,
        })),
      )
      .returning();
    // closed_at feeds the staff home trend lines (migration 0027).
    await tx.update(documentRequests).set({ status: 'fulfilled', closedAt: now }).where(eq(documentRequests.id, requestId));
    return rows;
  });
  return {
    fileIds: inserted.map((r) => r.id),
    files: inserted.map((r) => ({ fileId: r.id, fileName: r.fileName })),
    rejected,
    requestLabel: req.title,
    engagementId: appEngagementId(dbId),
    requestId,
  };
}

/**
 * Undo (own upload, within 10 minutes). The file named is the first of its
 * batch: every file the caller added to the request at the same moment goes
 * with it, and the request reopens.
 */
export async function undoRequestUpload(ctx: AuthContext, requestId: string, fileId: string): Promise<boolean> {
  const mine = await myEngagement(ctx);
  if (!mine) return false;
  const [f] = await db
    .select()
    .from(documentRequestFiles)
    .where(
      and(
        eq(documentRequestFiles.id, fileId),
        eq(documentRequestFiles.requestId, requestId),
        eq(documentRequestFiles.engagementId, mine.dbId),
        eq(documentRequestFiles.uploadedBy, ctx.userId),
      ),
    )
    .limit(1);
  if (!f || Date.now() - f.uploadedAt.getTime() > UNDO_WINDOW_MS) return false;
  const [req] = await db.select().from(documentRequests).where(eq(documentRequests.id, requestId)).limit(1);
  if (!req || req.status !== 'fulfilled') return false;
  const batch = await db
    .select({ id: documentRequestFiles.id, objectKey: documentRequestFiles.objectKey })
    .from(documentRequestFiles)
    .where(
      and(
        eq(documentRequestFiles.requestId, requestId),
        eq(documentRequestFiles.engagementId, mine.dbId),
        eq(documentRequestFiles.uploadedBy, ctx.userId),
        eq(documentRequestFiles.uploadedAt, f.uploadedAt),
      ),
    );
  const ids = batch.length ? batch.map((b) => b.id) : [fileId];
  await db.transaction(async (tx) => {
    await tx.delete(documentRequestFiles).where(and(inArray(documentRequestFiles.id, ids), eq(documentRequestFiles.requestId, requestId)));
    await tx.update(documentRequests).set({ status: 'pending', closedAt: null }).where(eq(documentRequests.id, requestId));
  });
  for (const b of batch.length ? batch : [{ objectKey: f.objectKey }]) await deleteObject(b.objectKey).catch(() => undefined);
  return true;
}

/* ------------------------------------------------------------------ */
/* Staff: request details (due date, step, field, re-upload note)      */
/* ------------------------------------------------------------------ */

export interface DocumentRequestDetailsInput {
  dueOn?: string | null;
  stepId?: string | null;
  fieldId?: string | null;
  reviewNote?: string | null;
}

/** Staff only; the request's engagement must pass `assertEngagementAccess`. */
export async function setDocumentRequestDetails(
  ctx: AuthContext,
  requestId: string,
  input: DocumentRequestDetailsInput,
): Promise<boolean> {
  if (ctx.role === 'client') throw new ClientDocumentsForbiddenError('Clients may not edit request details');
  const [req] = await db.select().from(documentRequests).where(eq(documentRequests.id, requestId)).limit(1);
  if (!req) return false;
  const access = await assertEngagementAccess(ctx, req.engagementId);
  if (!access.ok) return false;
  const dueOn = input.dueOn && /^\d{4}-\d{2}-\d{2}/.test(input.dueOn) ? input.dueOn.slice(0, 10) : input.dueOn === null ? null : undefined;
  const set = {
    ...(dueOn !== undefined ? { dueOn } : {}),
    ...(input.stepId !== undefined ? { stepId: input.stepId && getItem(input.stepId) ? input.stepId : null } : {}),
    ...(input.fieldId !== undefined ? { fieldId: input.fieldId?.trim() || null } : {}),
    ...(input.reviewNote !== undefined ? { reviewNote: input.reviewNote?.trim() || null, reviewNoteBy: ctx.userId } : {}),
    updatedAt: new Date(),
  };
  await db
    .insert(documentRequestDetails)
    .values({ requestId, engagementId: req.engagementId, ...set })
    .onConflictDoUpdate({ target: documentRequestDetails.requestId, set });
  return true;
}
