import 'server-only';

import { and, desc, eq, inArray, isNotNull, isNull, like, ne, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  documentRequestDetails,
  documentRequestFiles,
  documentRequests,
  documents,
  engagements,
  profiles,
} from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isAdminOrManager, isFirmWideAdmin } from '@/lib/auth';
import { ENGAGEMENT_DOCUMENTS_BUCKET } from '@/lib/board-resolution/board-resolution-storage';
import {
  fileNameFromStoragePath,
  isMilestoneStoragePath,
  MILESTONE_DOCUMENTS_BUCKET,
} from '@/lib/documents/milestone-document-storage';
import { checklistItemForFieldId } from '@/lib/documents/vault-documents';
import { bucketKey, type StorageBucket } from '@/storage/s3';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { createNotification } from '@/db/repositories/notifications';
import { normalizeChecklistItemSlice } from '@/lib/checklist/checklist-state-key';
import { checklistViewerForRole, isStepReleasedTo } from '@/lib/checklist/checklist-visibility';
import { appEngagementId, engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import {
  assertEngagementAccess,
  getEngagementById,
  managerOwnsEngagement,
} from '@/db/repositories/engagements';
import { listLeadMemberEngagementIds } from '@/db/repositories/engagement-leads-membership';
import { listManagerMemberEngagementIds } from '@/db/repositories/engagement-managers-membership';

/**
 * DOCUMENTS REPOSITORY.
 *
 * Forward-looking index for per-engagement files (certificates, filings,
 * milestone attachments). Milestone upload/download still works off object
 * paths in checklist_state — a row here is optional metadata.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 * No original RLS (new table). Product default:
 *   admin: all
 *   manager: via owned engagements (manager_id / legacy admin_id)
 *   intern: via assigned engagement
 *   client: via own engagement; list only shared_with_client = true
 *
 * On top of the row scope, a file attached to a checklist step follows that
 * step's release (`checklist-visibility.ts`): the lead's uploads stay theirs
 * until they ask for approval, and the client's until the manager accepts.
 */

type DocumentRow = typeof documents.$inferSelect;

export interface DocumentDto {
  id: string;
  engagementId: string;
  category: string | null;
  fileName: string;
  objectKey: string;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedBy: string | null;
  stepId: string | null;
  sharedWithClient: boolean;
  createdAt: string;
  /** Vault review (G-26): none | pending | approved | changes. */
  reviewStatus: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  /** When a newer upload to the same checklist field took this file's place (P-575). */
  replacedAt: string | null;
  replacedById: string | null;
  /** The uploader's name and role, for the vault's "From" fact (P-593). List reads only. */
  uploadedByName?: string | null;
  uploadedByRole?: string | null;
  companyName?: string;
  slug?: string | null;
  stage?: string | null;
}

function mapRow(
  row: DocumentRow,
  extra?: {
    companyName?: string;
    slug?: string | null;
    stage?: string | null;
    uploaderName?: string | null;
    uploaderRole?: string | null;
  },
): DocumentDto {
  return {
    id: row.id,
    engagementId: appEngagementId(row.engagementId),
    category: row.category,
    fileName: row.fileName,
    objectKey: row.objectKey,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    uploadedBy: row.uploadedBy,
    stepId: row.stepId,
    sharedWithClient: row.sharedWithClient,
    createdAt: row.createdAt.toISOString(),
    reviewStatus: row.reviewStatus,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    reviewNote: row.reviewNote,
    replacedAt: row.replacedAt ? row.replacedAt.toISOString() : null,
    replacedById: row.replacedById ?? null,
    uploadedByName: extra?.uploaderName ?? null,
    uploadedByRole: extra?.uploaderRole ?? null,
    companyName: extra?.companyName,
    slug: extra?.slug,
    stage: extra?.stage,
  };
}

const joinedSelect = {
  doc: documents,
  companyName: engagements.companyName,
  slug: engagements.slug,
  stage: engagements.stage,
  /** Only the owning step's slice — never the whole `checklist_state` blob. */
  stepSlice: sql<unknown>`${engagements.checklistState} -> ${documents.stepId}`,
  /** The uploader (left join on profiles), for the vault's "From" fact. */
  uploaderName: profiles.name,
  uploaderRole: profiles.role,
};

type JoinedRow = {
  doc: DocumentRow;
  companyName: string;
  slug: string | null;
  stage: string;
  stepSlice: unknown;
  uploaderName?: string | null;
  uploaderRole?: string | null;
};

/** A file deleted from the vault (P-596) is hidden from every read until Undo restores it. */
const notDeletedDoc = isNull(documents.deletedAt);

/** A step-attached file is readable once its step is released to this viewer. */
function stepReleasedForViewer(
  ctx: Pick<AuthContext, 'role'>,
  stepId: string | null,
  stepSlice: unknown,
): boolean {
  if (!stepId) return true;
  const viewer = checklistViewerForRole(ctx.role);
  if (viewer === 'lead') return true;
  return isStepReleasedTo(viewer, normalizeChecklistItemSlice(stepSlice, stepId), stepId);
}

function mapJoinedRows(ctx: Pick<AuthContext, 'role'>, rows: JoinedRow[]): DocumentDto[] {
  return rows
    .filter((row) => stepReleasedForViewer(ctx, row.doc.stepId, row.stepSlice))
    .map((row) =>
      mapRow(row.doc, {
        companyName: row.companyName,
        slug: row.slug,
        stage: row.stage,
        uploaderName: row.uploaderName ?? null,
        uploaderRole: row.uploaderRole ?? null,
      }),
    );
}

function clientEngagementScope(ctx: AuthContext) {
  if (ctx.clientId) {
    return or(
      eq(engagements.clientUserId, ctx.userId),
      eq(engagements.clientId, ctx.clientId),
    );
  }
  return eq(engagements.clientUserId, ctx.userId);
}

export async function listDocuments(
  ctx: AuthContext,
  engagementId?: string,
): Promise<DocumentDto[]> {
  if (engagementId) {
    const access = await assertEngagementAccess(ctx, engagementId);
    if (!access.ok) return [];

    const where =
      ctx.role === 'client'
        ? and(
            eq(documents.engagementId, access.dbId),
            eq(documents.sharedWithClient, true),
            notDeletedDoc,
          )
        : and(eq(documents.engagementId, access.dbId), notDeletedDoc);

    const rows = await db
      .select(joinedSelect)
      .from(documents)
      .innerJoin(engagements, eq(engagements.id, documents.engagementId))
      .leftJoin(profiles, eq(profiles.id, documents.uploadedBy))
      .where(where)
      .orderBy(desc(documents.createdAt));
    return mapJoinedRows(ctx, rows);
  }

  // Files on a soft-deleted project stay hidden, as everywhere else that
  // reads through `scopeFor()` or `assertEngagementAccess()`.
  const notDeleted = and(isNull(engagements.deletedAt), notDeletedDoc);

  if (isFirmWideAdmin(ctx.role)) {
    const rows = await db
      .select(joinedSelect)
      .from(documents)
      .innerJoin(engagements, eq(engagements.id, documents.engagementId))
      .leftJoin(profiles, eq(profiles.id, documents.uploadedBy))
      .where(notDeleted)
      .orderBy(desc(documents.createdAt));
    return mapJoinedRows(ctx, rows);
  }

  if (ctx.role === 'manager') {
    const memberIds = await listManagerMemberEngagementIds(ctx.userId);
    const conds = [managerOwnsEngagement(ctx.userId)];
    if (memberIds.length > 0) conds.push(inArray(engagements.id, memberIds));
    const roleScope = conds.length === 1 ? conds[0] : or(...conds);
    const rows = await db
      .select(joinedSelect)
      .from(documents)
      .innerJoin(engagements, eq(engagements.id, documents.engagementId))
      .leftJoin(profiles, eq(profiles.id, documents.uploadedBy))
      .where(and(notDeleted, roleScope))
      .orderBy(desc(documents.createdAt));
    return mapJoinedRows(ctx, rows);
  }

  if (ctx.role === 'intern') {
    if (!ctx.internId) return [];
    const memberIds = await listLeadMemberEngagementIds(ctx.internId);
    const scope =
      memberIds.length > 0
        ? or(eq(engagements.internId, ctx.internId), inArray(engagements.id, memberIds))
        : eq(engagements.internId, ctx.internId);
    const rows = await db
      .select(joinedSelect)
      .from(documents)
      .innerJoin(engagements, eq(engagements.id, documents.engagementId))
      .leftJoin(profiles, eq(profiles.id, documents.uploadedBy))
      .where(and(notDeleted, scope))
      .orderBy(desc(documents.createdAt));
    return mapJoinedRows(ctx, rows);
  }

  const rows = await db
    .select(joinedSelect)
    .from(documents)
    .innerJoin(engagements, eq(engagements.id, documents.engagementId))
    .leftJoin(profiles, eq(profiles.id, documents.uploadedBy))
    .where(and(notDeleted, eq(documents.sharedWithClient, true), clientEngagementScope(ctx)))
    .orderBy(desc(documents.createdAt));
  return mapJoinedRows(ctx, rows);
}

/** Single index row, scoped by engagement access (clients: shared rows only). */
export async function getDocumentById(
  ctx: AuthContext,
  id: string,
): Promise<DocumentDto | null> {
  const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!row || row.deletedAt) return null;

  const access = await assertEngagementAccess(ctx, row.engagementId);
  if (!access.ok) return null;
  if (ctx.role === 'client' && !row.sharedWithClient) return null;
  const state = access.row.checklistState as Record<string, unknown> | null;
  if (!stepReleasedForViewer(ctx, row.stepId, row.stepId ? state?.[row.stepId] : undefined)) {
    return null;
  }

  return mapRow(row);
}

export interface CreateDocumentInput {
  engagementId: string;
  fileName: string;
  objectKey: string;
  category?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  stepId?: string | null;
  sharedWithClient?: boolean;
}

export async function createDocument(
  ctx: AuthContext,
  input: CreateDocumentInput,
): Promise<DocumentDto> {
  if (ctx.role === 'client') {
    throw new Error('Clients may not create document index rows');
  }

  const engagement = await getEngagementById(ctx, engagementDbId(input.engagementId));
  if (!engagement) throw new Error('Engagement not found or not permitted');

  const objectKey = input.objectKey.trim();
  const [existing] = await db
    .select()
    .from(documents)
    .where(eq(documents.objectKey, objectKey))
    .limit(1);
  if (existing) {
    const access = await assertEngagementAccess(ctx, existing.engagementId);
    if (!access.ok) throw new Error('Engagement not found or not permitted');
    return mapRow(existing);
  }

  const [row] = await db
    .insert(documents)
    .values({
      engagementId: engagement.id,
      fileName: input.fileName.trim(),
      objectKey,
      category: input.category?.trim() || null,
      contentType: input.contentType?.trim() || null,
      sizeBytes: input.sizeBytes ?? null,
      stepId: input.stepId?.trim() || null,
      sharedWithClient: input.sharedWithClient ?? false,
      uploadedBy: ctx.userId,
    })
    .returning();

  return mapRow(row);
}

/* ------------------------------------------------------------------ */
/* Vault (G-26): object references, request files, review status      */
/* ------------------------------------------------------------------ */

/**
 * One vault file the caller names: an indexed document, a checklist (milestone) upload by its
 * storage path, or a file uploaded against a document request. `folder` is only a label for
 * the ZIP and is cleaned by the caller.
 */
export type VaultFileRef =
  | { documentId: string; folder?: string }
  | { path: string; folder?: string }
  | { requestFileId: string; folder?: string };

export interface ResolvedVaultFile {
  kind: 'document' | 'milestone' | 'request-file';
  /** The id or path the caller sent. */
  ref: string;
  /** Database id of the owning engagement. */
  engagementId: string;
  fileName: string;
  /** Full S3 key (bucket prefix applied). */
  storageKey: string;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string | null;
  folder?: string;
}

/**
 * S3 key for a `documents.object_key`. Rows hold either a prefixed key
 * (`engagement-documents/…`, `milestone-documents/…`) or a bare milestone path
 * (`{engagement}/{field}/{ts}-{name}`); a bare key from elsewhere lives under
 * `engagement-documents/`. Same rule as `/api/documents/:id/signed-url`.
 */
export function documentStorageKey(objectKey: string): string {
  const clean = objectKey.replace(/^\/+/, '');
  const buckets: StorageBucket[] = [MILESTONE_DOCUMENTS_BUCKET, ENGAGEMENT_DOCUMENTS_BUCKET];
  for (const bucket of buckets) {
    if (clean.startsWith(`${bucket}/`)) return bucketKey(bucket, clean.slice(bucket.length + 1));
  }
  if (isMilestoneStoragePath(clean)) return bucketKey(MILESTONE_DOCUMENTS_BUCKET, clean);
  return bucketKey(ENGAGEMENT_DOCUMENTS_BUCKET, clean);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EngagementAccess = Awaited<ReturnType<typeof assertEngagementAccess>>;

/** Engagement access, asked once per engagement for a batch of files. */
function accessCache(ctx: AuthContext) {
  const cache = new Map<string, Promise<EngagementAccess>>();
  return (engagementId: string) => {
    const key = engagementDbId(engagementId);
    let hit = cache.get(key);
    if (!hit) {
      hit = assertEngagementAccess(ctx, key);
      cache.set(key, hit);
    }
    return hit;
  };
}

/**
 * A checklist upload by path, with the checks of `/api/milestone-documents/signed-url`: the
 * first segment names the engagement the caller must reach, and for anyone but the lead the
 * step the field belongs to must be released to them.
 */
async function resolveMilestonePath(
  ctx: AuthContext,
  rawPath: string,
  access: (engagementId: string) => Promise<EngagementAccess>,
): Promise<ResolvedVaultFile | null> {
  const path = rawPath.trim().replace(/^\/+/, '');
  if (!isMilestoneStoragePath(path)) return null;
  const segments = path.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null;
  const engagementSegment = segments[0] ?? '';
  if (!engagementSegment) return null;
  const granted = await access(engagementSegment);
  if (!granted.ok) return null;

  const viewer = checklistViewerForRole(ctx.role);
  if (viewer !== 'lead') {
    const item = segments
      .slice(1, -1)
      .map((segment) => checklistItemForFieldId(segment.split('.')[0] ?? segment))
      .find(Boolean);
    if (item) {
      const state = granted.row.checklistState as Record<string, unknown> | null;
      const slice = normalizeChecklistItemSlice(state?.[item.id], item.id);
      if (!isStepReleasedTo(viewer, slice, item.id)) return null;
    }
  }

  return {
    kind: 'milestone',
    ref: path,
    engagementId: granted.dbId,
    fileName: fileNameFromStoragePath(path),
    storageKey: bucketKey(MILESTONE_DOCUMENTS_BUCKET, path),
    contentType: null,
    sizeBytes: null,
    createdAt: null,
  };
}

async function resolveRequestFile(
  ctx: AuthContext,
  id: string,
  access: (engagementId: string) => Promise<EngagementAccess>,
): Promise<ResolvedVaultFile | null> {
  if (!UUID_RE.test(id)) return null;
  const [row] = await db
    .select()
    .from(documentRequestFiles)
    .where(eq(documentRequestFiles.id, id))
    .limit(1);
  if (!row) return null;
  const granted = await access(row.engagementId);
  if (!granted.ok) return null;
  return {
    kind: 'request-file',
    ref: row.id,
    engagementId: granted.dbId,
    fileName: row.fileName,
    storageKey: documentStorageKey(row.objectKey),
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    createdAt: row.uploadedAt.toISOString(),
  };
}

async function resolveOne(
  ctx: AuthContext,
  ref: VaultFileRef,
  access: (engagementId: string) => Promise<EngagementAccess>,
): Promise<ResolvedVaultFile | null> {
  let out: ResolvedVaultFile | null = null;
  if ('documentId' in ref) {
    if (!UUID_RE.test(ref.documentId)) return null;
    const doc = await getDocumentById(ctx, ref.documentId);
    if (doc) {
      out = {
        kind: 'document',
        ref: doc.id,
        engagementId: engagementDbId(doc.engagementId),
        fileName: doc.fileName,
        storageKey: documentStorageKey(doc.objectKey),
        contentType: doc.contentType,
        sizeBytes: doc.sizeBytes,
        createdAt: doc.createdAt,
      };
    }
  } else if ('path' in ref) {
    out = await resolveMilestonePath(ctx, ref.path, access);
  } else if ('requestFileId' in ref) {
    out = await resolveRequestFile(ctx, ref.requestFileId, access);
  }
  if (out && ref.folder) out.folder = ref.folder;
  return out;
}

/**
 * The files the caller may read, in the order asked. A file outside the caller's scope (another
 * firm's engagement, a client's file on a step not yet released, a missing row) is left out, so
 * the result never says whether it exists.
 */
export async function resolveVaultFiles(
  ctx: AuthContext,
  refs: VaultFileRef[],
): Promise<ResolvedVaultFile[]> {
  if (ctx.role === 'developer' || ctx.role === 'partner') return [];
  const access = accessCache(ctx);
  const out: ResolvedVaultFile[] = [];
  for (const ref of refs) {
    const file = await resolveOne(ctx, ref, access);
    if (file) out.push(file);
  }
  return out;
}

/** One vault file, or null when it is out of scope. */
export async function resolveVaultFile(
  ctx: AuthContext,
  ref: VaultFileRef,
): Promise<ResolvedVaultFile | null> {
  const [file] = await resolveVaultFiles(ctx, [ref]);
  return file ?? null;
}

function isStaff(ctx: AuthContext): boolean {
  return isAdminOrManager(ctx.role) || ctx.role === 'intern';
}

export interface VaultRequestFileDto {
  kind: 'document' | 'request-file';
  id: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedAt: string;
}

export interface VaultRequestDto {
  id: string;
  engagementId: string;
  title: string;
  detail: string | null;
  /** pending | fulfilled | cancelled (approved and rejected are kept as written). */
  status: string;
  dueOn: string | null;
  stepId: string | null;
  createdAt: string;
  files: VaultRequestFileDto[];
}

/**
 * The engagement's document requests with the files sent against them, for the staff vault.
 * Files come from `document_request_files` (current versions only) and from `documents` rows
 * stored under `engagement-documents/{engagement}/requests/{request}/`. Staff only, scoped by
 * `assertEngagementAccess`.
 */
export async function listVaultRequests(
  ctx: AuthContext,
  engagementId: string,
): Promise<VaultRequestDto[]> {
  if (!isStaff(ctx)) return [];
  const access = await assertEngagementAccess(ctx, engagementId);
  if (!access.ok) return [];
  const dbId = access.dbId;

  const rows = await db
    .select({ req: documentRequests, det: documentRequestDetails })
    .from(documentRequests)
    .leftJoin(documentRequestDetails, eq(documentRequestDetails.requestId, documentRequests.id))
    .where(eq(documentRequests.engagementId, dbId))
    .orderBy(desc(documentRequests.createdAt));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.req.id);

  const files = await db
    .select()
    .from(documentRequestFiles)
    .where(
      and(
        eq(documentRequestFiles.engagementId, dbId),
        inArray(documentRequestFiles.requestId, ids),
        isNull(documentRequestFiles.replacedAt),
      ),
    )
    .orderBy(desc(documentRequestFiles.uploadedAt));

  const prefix = `${ENGAGEMENT_DOCUMENTS_BUCKET}/${dbId}/requests/`;
  const indexed = await db
    .select()
    .from(documents)
    .where(and(eq(documents.engagementId, dbId), like(documents.objectKey, `${prefix}%`)))
    .orderBy(desc(documents.createdAt));

  const byRequest = new Map<string, VaultRequestFileDto[]>();
  const push = (requestId: string, file: VaultRequestFileDto) => {
    const list = byRequest.get(requestId) ?? [];
    list.push(file);
    byRequest.set(requestId, list);
  };
  for (const f of files) {
    push(f.requestId, {
      kind: 'request-file',
      id: f.id,
      fileName: f.fileName,
      contentType: f.contentType,
      sizeBytes: f.sizeBytes,
      uploadedAt: f.uploadedAt.toISOString(),
    });
  }
  const state = access.row.checklistState as Record<string, unknown> | null;
  for (const d of indexed) {
    const requestId = d.objectKey.slice(prefix.length).split('/')[0] ?? '';
    if (!ids.includes(requestId)) continue;
    if (!stepReleasedForViewer(ctx, d.stepId, d.stepId ? state?.[d.stepId] : undefined)) continue;
    push(requestId, {
      kind: 'document',
      id: d.id,
      fileName: d.fileName,
      contentType: d.contentType,
      sizeBytes: d.sizeBytes,
      uploadedAt: d.createdAt.toISOString(),
    });
  }

  return rows.map(({ req, det }) => ({
    id: req.id,
    engagementId: appEngagementId(dbId),
    title: req.title,
    detail: req.detail,
    status: req.status,
    dueOn: det?.dueOn ?? null,
    stepId: det?.stepId ?? null,
    createdAt: req.createdAt.toISOString(),
    files: byRequest.get(req.id) ?? [],
  }));
}

export type DocumentReviewStatus = 'pending' | 'approved' | 'changes';

export interface SetDocumentReviewInput {
  ref: { documentId: string } | { path: string };
  status: DocumentReviewStatus;
  note?: string | null;
}

const REVIEW_WORD: Record<DocumentReviewStatus, string> = {
  pending: 'in review',
  approved: 'approved',
  changes: 'changes asked',
};

function vaultPathForRole(role: string | null | undefined): string {
  if (role === 'intern') return '/app/intern/vault';
  if (role === 'manager') return '/app/manager/vault';
  if (role === 'client') return '/app/client/documents';
  return '/app/admin/vault';
}

/**
 * Set a vault file's review state (staff only). A checklist upload that has no index row yet
 * gets one, so its state has a home; the row keeps no uploader, because the reviewer is not the
 * one who sent it. "Changes" needs a note. Writes an audit event and, when an admin or manager
 * reviews someone else's file, a notification to the uploader.
 */
export async function setDocumentReview(
  ctx: AuthContext,
  input: SetDocumentReviewInput,
): Promise<DocumentDto | null> {
  if (!isStaff(ctx)) throw new Error('Review is not permitted for this role');
  const note = input.note?.trim().slice(0, 1000) || null;
  if (input.status === 'changes' && !note) throw new Error('review_note_required');

  let row: DocumentRow | undefined;
  let engagementId: string;
  if ('documentId' in input.ref) {
    if (!UUID_RE.test(input.ref.documentId)) return null;
    const doc = await getDocumentById(ctx, input.ref.documentId);
    if (!doc) return null;
    [row] = await db.select().from(documents).where(eq(documents.id, doc.id)).limit(1);
    if (!row) return null;
    engagementId = row.engagementId;
  } else {
    const file = await resolveMilestonePath(ctx, input.ref.path, accessCache(ctx));
    if (!file) return null;
    engagementId = file.engagementId;
    [row] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.engagementId, engagementId), eq(documents.objectKey, file.ref)))
      .limit(1);
    if (!row) {
      const fieldSegment = file.ref.split('/')[1] ?? '';
      const item = checklistItemForFieldId(fieldSegment.split('.')[0] ?? fieldSegment);
      [row] = await db
        .insert(documents)
        .values({
          engagementId,
          fileName: file.fileName,
          objectKey: file.ref,
          category: 'documents',
          stepId: item?.id ?? null,
          sharedWithClient: false,
        })
        .returning();
      if (!row) return null;
    }
  }

  const now = new Date();
  const [updated] = await db
    .update(documents)
    .set({
      reviewStatus: input.status,
      reviewedBy: ctx.userId,
      reviewedAt: now,
      reviewNote: note,
    })
    .where(and(eq(documents.id, row.id), eq(documents.engagementId, engagementId)))
    .returning();
  if (!updated) return null;

  await recordAuditEvent(ctx, {
    engagementId,
    action: 'document.review',
    summary: `${updated.fileName} · ${REVIEW_WORD[input.status]}`,
    metadata: { documentId: updated.id, status: input.status, note },
  });

  if (updated.uploadedBy && updated.uploadedBy !== ctx.userId && isAdminOrManager(ctx.role)) {
    try {
      const [uploader] = await db
        .select({ role: profiles.role })
        .from(profiles)
        .where(eq(profiles.id, updated.uploadedBy))
        .limit(1);
      const [eng] = await db
        .select({ companyName: engagements.companyName })
        .from(engagements)
        .where(eq(engagements.id, engagementId))
        .limit(1);
      await createNotification(ctx, {
        userId: updated.uploadedBy,
        kind: 'checklist.review',
        title: `${updated.fileName} · ${REVIEW_WORD[input.status]}`,
        body: note ?? '',
        engagementId: appEngagementId(engagementId),
        companyName: eng?.companyName ?? '',
        href: vaultPathForRole(uploader?.role),
      });
    } catch (err) {
      console.warn('[documents] review notification failed', err instanceof Error ? err.message : err);
    }
  }

  return mapRow(updated);
}

/* ------------------------------------------------------------------ */
/* Vault: upload index with "Replaced", and delete with Undo          */
/* ------------------------------------------------------------------ */

export interface IndexMilestoneUploadInput {
  /** Database or app id of the engagement the file was stored under. */
  engagementId: string;
  /** The checklist field the file was sent for; `vault` is a loose vault upload. */
  fieldId: string;
  fileName: string;
  /** Bare milestone path `{engagement}/{field}/{ts}-{name}`. */
  objectKey: string;
  category?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  stepId?: string | null;
}

/** Field ids that hold loose files side by side, so a new one never replaces the last. */
const NON_REPLACING_FIELDS = new Set(['vault']);

/** Escape LIKE wildcards in a path prefix (field ids may hold `_`). */
function likePrefix(prefix: string): string {
  return `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Index a checklist (milestone) upload for any role that can reach the engagement, the client
 * included, so the vault can say who sent it (P-593). A newer upload to the same field marks the
 * earlier rows of that field as replaced (P-575); the files stay in storage and in the vault
 * behind the "Replaced" toggle. The row is never shared with the client by this path.
 */
export async function indexMilestoneUpload(
  ctx: AuthContext,
  input: IndexMilestoneUploadInput,
): Promise<DocumentDto> {
  if (ctx.role === 'developer' || ctx.role === 'partner') throw new Error('Upload index is not permitted for this role');
  const access = await assertEngagementAccess(ctx, engagementDbId(input.engagementId));
  if (!access.ok) throw new Error('Engagement not found or not permitted');

  const objectKey = input.objectKey.trim().replace(/^\/+/, '');
  const segments = objectKey.split('/');
  // The first segment names the engagement; a path for another one is refused.
  if (!isMilestoneStoragePath(objectKey) || engagementDbId(segments[0] ?? '') !== access.dbId) {
    throw new Error('Engagement not found or not permitted');
  }

  const [existing] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.engagementId, access.dbId), eq(documents.objectKey, objectKey)))
    .limit(1);
  if (existing) return mapRow(existing);

  const [row] = await db
    .insert(documents)
    .values({
      engagementId: access.dbId,
      fileName: input.fileName.trim(),
      objectKey,
      category: input.category?.trim() || null,
      contentType: input.contentType?.trim() || null,
      sizeBytes: input.sizeBytes ?? null,
      stepId: input.stepId?.trim() || null,
      sharedWithClient: false,
      uploadedBy: ctx.userId,
    })
    .returning();

  const fieldId = input.fieldId.trim();
  if (row && fieldId && !NON_REPLACING_FIELDS.has(fieldId)) {
    const prefix = `${segments[0]}/${fieldId}/`;
    await db
      .update(documents)
      .set({ replacedAt: new Date(), replacedById: row.id })
      .where(
        and(
          eq(documents.engagementId, access.dbId),
          like(documents.objectKey, likePrefix(prefix)),
          ne(documents.id, row.id),
          isNull(documents.replacedAt),
          isNull(documents.deletedAt),
        ),
      );
  }

  return mapRow(row);
}

/** True when the engagement's checklist still points at this object (the step's current file). */
function checklistHoldsObject(checklistState: unknown, objectKey: string): boolean {
  if (!checklistState || !objectKey) return false;
  try {
    return JSON.stringify(checklistState).includes(JSON.stringify(objectKey).slice(1, -1));
  } catch {
    return false;
  }
}

/**
 * Delete a vault file (P-596): a soft delete, so the Undo toast can bring it back. Staff only;
 * a lead may delete only their own uploads. A file a checklist step still holds is refused
 * ("in_use"): it is replaced or cleared from the step, not from the vault. Writes an audit event.
 */
export async function deleteVaultDocument(ctx: AuthContext, documentId: string): Promise<DocumentDto | null> {
  if (!isStaff(ctx)) throw new Error('Delete is not permitted for this role');
  if (!UUID_RE.test(documentId)) return null;
  const doc = await getDocumentById(ctx, documentId);
  if (!doc) return null;
  if (ctx.role === 'intern' && doc.uploadedBy !== ctx.userId) {
    throw new Error('Delete is not permitted for this role');
  }
  const access = await assertEngagementAccess(ctx, engagementDbId(doc.engagementId));
  if (!access.ok) return null;
  if (checklistHoldsObject(access.row.checklistState, doc.objectKey)) throw new Error('in_use');

  const [row] = await db
    .update(documents)
    .set({ deletedAt: new Date(), deletedBy: ctx.userId })
    .where(and(eq(documents.id, doc.id), eq(documents.engagementId, access.dbId), isNull(documents.deletedAt)))
    .returning();
  if (!row) return null;

  await recordAuditEvent(ctx, {
    engagementId: access.dbId,
    action: 'document.delete',
    summary: `${row.fileName} · deleted from the vault`,
    metadata: { documentId: row.id, objectKey: row.objectKey },
  });
  return mapRow(row);
}

/**
 * Undo a vault delete. The person who deleted the file, or an admin or manager on the
 * engagement, may bring it back. Writes an audit event.
 */
export async function restoreVaultDocument(ctx: AuthContext, documentId: string): Promise<DocumentDto | null> {
  if (!isStaff(ctx)) throw new Error('Restore is not permitted for this role');
  if (!UUID_RE.test(documentId)) return null;
  const [found] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), isNotNull(documents.deletedAt)))
    .limit(1);
  if (!found) return null;
  const access = await assertEngagementAccess(ctx, found.engagementId);
  if (!access.ok) return null;
  if (!isAdminOrManager(ctx.role) && found.deletedBy !== ctx.userId) {
    throw new Error('Restore is not permitted for this role');
  }

  const [row] = await db
    .update(documents)
    .set({ deletedAt: null, deletedBy: null })
    .where(and(eq(documents.id, found.id), eq(documents.engagementId, access.dbId)))
    .returning();
  if (!row) return null;

  await recordAuditEvent(ctx, {
    engagementId: access.dbId,
    action: 'document.restore',
    summary: `${row.fileName} · restored to the vault`,
    metadata: { documentId: row.id },
  });
  return mapRow(row);
}
