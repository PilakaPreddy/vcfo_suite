import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { engagementNotes, profiles } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { assertEngagementAccess } from '@/db/repositories/engagements';
import { isFirmWideAdmin } from '@/lib/auth';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import type { EngagementNote } from '@/lib/notes/types';
import { queueIndexRefresh } from '@/lib/ask/index-cards/queue';

export type { EngagementNote };

/**
 * ENGAGEMENT NOTES — staff notes on a client record (G-19, G-20). Never shown to the
 * client.
 *
 * >>> ACCESS CONTROL (Path A, product decision) <<<
 *   client, developer — nothing; refused before the first query.
 *   intern / manager — engagements `assertEngagementAccess` allows (assigned lead,
 *            owned or co-managed); super_admin / admin — every engagement.
 *   Anyone with access reads, adds and pins notes. Only the author edits the text.
 *   The author deletes their own note; super_admin and admin delete any note.
 *   Delete is soft (`deleted_at`); a deleted note is never read again.
 * Every change writes an audit event (R-40). The summary never quotes the note: a client
 * can read the audit events of its own engagement (`GET /api/audit-logs`), and a staff
 * note must not reach it that way. Writes target `access.dbId`, never the id the caller
 * sent.
 */

export class EngagementNotesError extends Error {
  constructor(
    public code: 'forbidden' | 'not_found' | 'empty_body',
    public status: 400 | 403 | 404,
  ) {
    super(code);
  }
}

const STAFF = new Set(['super_admin', 'admin', 'manager', 'intern']);
export const NOTE_MAX_LENGTH = 4000;

async function staffAccess(ctx: AuthContext, engagementId: string): Promise<string> {
  if (!STAFF.has(ctx.role)) throw new EngagementNotesError('forbidden', 403);
  const access = await assertEngagementAccess(ctx, engagementId);
  if (!access.ok) throw new EngagementNotesError('notFound' in access ? 'not_found' : 'forbidden', 'notFound' in access ? 404 : 403);
  return access.dbId;
}

type Row = {
  id: string;
  engagementId: string;
  body: string;
  pinned: boolean;
  authorId: string | null;
  authorName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toNote(ctx: AuthContext, row: Row): EngagementNote {
  const mine = Boolean(row.authorId && row.authorId === ctx.userId);
  return {
    id: row.id,
    engagementId: appEngagementId(row.engagementId),
    body: row.body,
    pinned: row.pinned,
    authorId: row.authorId,
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    mine,
    canDelete: mine || isFirmWideAdmin(ctx.role),
  };
}

const columns = {
  id: engagementNotes.id,
  engagementId: engagementNotes.engagementId,
  body: engagementNotes.body,
  pinned: engagementNotes.pinned,
  authorId: engagementNotes.authorId,
  authorName: profiles.name,
  createdAt: engagementNotes.createdAt,
  updatedAt: engagementNotes.updatedAt,
};

/** The engagement's live notes: pinned first, then newest first. */
export async function listEngagementNotes(ctx: AuthContext, engagementId: string): Promise<EngagementNote[]> {
  const dbId = await staffAccess(ctx, engagementId);
  const rows = await db
    .select(columns)
    .from(engagementNotes)
    .leftJoin(profiles, eq(profiles.id, engagementNotes.authorId))
    .where(and(eq(engagementNotes.engagementId, dbId), isNull(engagementNotes.deletedAt)))
    .orderBy(desc(engagementNotes.pinned), desc(engagementNotes.createdAt));
  return rows.map((r) => toNote(ctx, r));
}

function cleanBody(body: string): string {
  const text = body.trim().slice(0, NOTE_MAX_LENGTH);
  if (!text) throw new EngagementNotesError('empty_body', 400);
  return text;
}

export async function createEngagementNote(
  ctx: AuthContext,
  engagementId: string,
  input: { body: string; pinned?: boolean },
): Promise<EngagementNote> {
  const dbId = await staffAccess(ctx, engagementId);
  const body = cleanBody(input.body);
  const [row] = await db
    .insert(engagementNotes)
    .values({ engagementId: dbId, authorId: ctx.userId, body, pinned: Boolean(input.pinned) })
    .returning();
  queueIndexRefresh('note', row!.id);
  void recordAuditEvent(ctx, {
    engagementId: dbId,
    action: 'notes.created',
    summary: 'added a note',
    metadata: { noteId: row!.id },
  });
  return toNote(ctx, { ...row!, authorName: ctx.name ?? null });
}

/** Load one live note on the approved engagement, or throw not_found. */
async function loadNote(dbId: string, noteId: string): Promise<Row> {
  const [row] = await db
    .select(columns)
    .from(engagementNotes)
    .leftJoin(profiles, eq(profiles.id, engagementNotes.authorId))
    .where(and(eq(engagementNotes.id, noteId), eq(engagementNotes.engagementId, dbId), isNull(engagementNotes.deletedAt)))
    .limit(1);
  if (!row) throw new EngagementNotesError('not_found', 404);
  return row;
}

/** Edit the text (author only) and/or pin or unpin (anyone with access). */
export async function updateEngagementNote(
  ctx: AuthContext,
  engagementId: string,
  noteId: string,
  patch: { body?: string; pinned?: boolean },
): Promise<EngagementNote> {
  const dbId = await staffAccess(ctx, engagementId);
  const cur = await loadNote(dbId, noteId);
  const set: { body?: string; pinned?: boolean; updatedAt: Date } = { updatedAt: new Date() };
  if (patch.body !== undefined) {
    if (cur.authorId !== ctx.userId) throw new EngagementNotesError('forbidden', 403);
    set.body = cleanBody(patch.body);
  }
  if (patch.pinned !== undefined) set.pinned = patch.pinned;
  if (set.body === undefined && set.pinned === undefined) return toNote(ctx, cur);

  await db
    .update(engagementNotes)
    .set(set)
    .where(and(eq(engagementNotes.id, cur.id), eq(engagementNotes.engagementId, dbId)));
  const edited = set.body !== undefined && set.body !== cur.body;
  if (edited) queueIndexRefresh('note', cur.id);
  const pinChanged = set.pinned !== undefined && set.pinned !== cur.pinned;
  if (edited || pinChanged) {
    void recordAuditEvent(ctx, {
      engagementId: dbId,
      action: edited ? 'notes.edited' : set.pinned ? 'notes.pinned' : 'notes.unpinned',
      summary: edited ? 'edited a note' : set.pinned ? 'pinned a note' : 'unpinned a note',
      metadata: { noteId: cur.id },
    });
  }
  return toNote(ctx, { ...cur, body: set.body ?? cur.body, pinned: set.pinned ?? cur.pinned, updatedAt: set.updatedAt });
}

/** Soft delete: the author, or a firm-wide admin. */
export async function deleteEngagementNote(ctx: AuthContext, engagementId: string, noteId: string): Promise<void> {
  const dbId = await staffAccess(ctx, engagementId);
  const cur = await loadNote(dbId, noteId);
  if (cur.authorId !== ctx.userId && !isFirmWideAdmin(ctx.role)) throw new EngagementNotesError('forbidden', 403);
  await db
    .update(engagementNotes)
    .set({ deletedAt: new Date() })
    .where(and(eq(engagementNotes.id, cur.id), eq(engagementNotes.engagementId, dbId)));
  queueIndexRefresh('note', cur.id);
  void recordAuditEvent(ctx, {
    engagementId: dbId,
    action: 'notes.deleted',
    summary: cur.authorId === ctx.userId ? 'deleted a note' : `deleted a note by ${cur.authorName ?? 'another person'}`,
    metadata: { noteId: cur.id },
  });
}
