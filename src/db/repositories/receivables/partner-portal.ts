import 'server-only';
import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { receivableInvoiceNotes, receivableInvoices, receivablePartners, receivableReminders, receivableSheets, receivableVersions } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { addDaysIso, sheetDate, todayIst } from '@/lib/receivables/dates';
import type { SnapshotRow } from '@/lib/receivables/model';
import type { PartnerHomeDto, PartnerInvoiceDetailDto, PartnerNoteDto, PartnerReminderDto, PartnerRowDto } from '@/lib/receivables/partner-wire';
import { hitFromRow } from '@/lib/receivables/reminder-rule';
import { ISO_DATE, ReceivablesError, UUID, invalid, invoiceLabel, logChange, notFound } from './shared';

/**
 * RECEIVABLES PARTNER PORTAL (Phase 8, docs/specs/receivables/PLAN.md): what a signed-in client
 * partner reads and writes. The routes are in app/api/receivables/partner/ and the wire shapes in
 * src/lib/receivables/partner-wire.ts.
 *
 * >>> ACCESS CONTROL <<<
 *   Only the `partner` role gets past the first line; every other role is refused with 403
 *   before any query. The partner is found by `receivable_partners.profile_id = ctx.userId` on
 *   an active partner row. A partner reads only the rows of the latest published version whose
 *   partner is one of their own partner rows on that same sheet, never the draft. An invoice
 *   outside that set reads as not found, and a write also needs the live invoice to still be
 *   theirs, so a reassignment in the draft takes effect at once for writes.
 */

/** The longest note a partner may write. */
export const PARTNER_NOTE_MAX = 2000;
/** How far ahead a promise date may be. */
const PROMISE_MAX_DAYS = 366;

type PartnerLink = {
  partnerId: string;
  sheetId: string;
  name: string;
  email: string;
  notifyOnPublish: boolean;
  clientOrgName: string;
  publishedVersionId: string | null;
};

type PartnerScope = {
  links: PartnerLink[];
  /** The partner's own rows of each sheet's latest published version. */
  rows: SnapshotRow[];
  /** The sheet each visible row belongs to. */
  sheetOf: Map<string, string>;
  publishedAt: Date | null;
};

function assertPartner(ctx: AuthContext): void {
  if (ctx.role !== 'partner') throw new ReceivablesError(403, 'forbidden');
}

/** The caller's active partner rows; a partner login with none (disabled) is refused. */
async function partnerLinks(ctx: AuthContext): Promise<PartnerLink[]> {
  assertPartner(ctx);
  const links = await db
    .select({
      partnerId: receivablePartners.id,
      sheetId: receivablePartners.sheetId,
      name: receivablePartners.name,
      email: receivablePartners.email,
      notifyOnPublish: receivablePartners.notifyOnPublish,
      clientOrgName: receivableSheets.clientOrgName,
      publishedVersionId: receivableSheets.publishedVersionId,
    })
    .from(receivablePartners)
    .innerJoin(receivableSheets, eq(receivableSheets.id, receivablePartners.sheetId))
    .where(and(eq(receivablePartners.profileId, ctx.userId), eq(receivablePartners.active, true)))
    .orderBy(asc(receivablePartners.createdAt));
  if (!links.length) throw new ReceivablesError(403, 'forbidden');
  return links;
}

/** The partner's rows of the published versions of their sheets. */
async function partnerScope(ctx: AuthContext): Promise<PartnerScope> {
  const links = await partnerLinks(ctx);
  const versionIds = [...new Set(links.map((l) => l.publishedVersionId).filter((v): v is string => Boolean(v)))];
  const out: PartnerScope = { links, rows: [], sheetOf: new Map(), publishedAt: null };
  if (!versionIds.length) return out;
  const versions = await db
    .select({ id: receivableVersions.id, sheetId: receivableVersions.sheetId, snapshot: receivableVersions.snapshot, publishedAt: receivableVersions.publishedAt })
    .from(receivableVersions)
    .where(inArray(receivableVersions.id, versionIds));
  for (const v of versions) {
    // The version must be the one its sheet points to, and the row's partner one of the caller's on that sheet.
    const mine = new Set(links.filter((l) => l.sheetId === v.sheetId && l.publishedVersionId === v.id).map((l) => l.partnerId));
    if (!mine.size) continue;
    if (!out.publishedAt || v.publishedAt > out.publishedAt) out.publishedAt = v.publishedAt;
    for (const r of v.snapshot ?? []) {
      if (!r.partnerId || !mine.has(r.partnerId)) continue;
      // The page never needs internal ids beyond the invoice's own.
      out.rows.push({ ...r, partnerId: null });
      out.sheetOf.set(r.id, v.sheetId);
    }
  }
  return out;
}

function orgName(links: PartnerLink[]): string {
  return [...new Set(links.map((l) => l.clientOrgName))].join(' · ');
}

async function liveExtras(ids: string[]): Promise<{ promised: Map<string, string | null>; notes: Map<string, number> }> {
  const promised = new Map<string, string | null>();
  const notes = new Map<string, number>();
  if (!ids.length) return { promised, notes };
  const [live, counts] = await Promise.all([
    db.select({ id: receivableInvoices.id, promisedOn: receivableInvoices.promisedOn }).from(receivableInvoices).where(inArray(receivableInvoices.id, ids)),
    db
      .select({ invoiceId: receivableInvoiceNotes.invoiceId, n: count() })
      .from(receivableInvoiceNotes)
      .where(inArray(receivableInvoiceNotes.invoiceId, ids))
      .groupBy(receivableInvoiceNotes.invoiceId),
  ]);
  for (const r of live) promised.set(r.id, r.promisedOn ? String(r.promisedOn) : null);
  for (const c of counts) notes.set(c.invoiceId, Number(c.n) || 0);
  return { promised, notes };
}

function withExtras(r: SnapshotRow, x: { promised: Map<string, string | null>; notes: Map<string, number> }): PartnerRowDto {
  return { ...r, promisedOn: x.promised.get(r.id) ?? null, noteCount: x.notes.get(r.id) ?? 0 };
}

/** GET /api/receivables/partner/me — the partner's own invoices of the latest published version. */
export async function partnerHome(ctx: AuthContext, today: string = todayIst()): Promise<PartnerHomeDto> {
  const scope = await partnerScope(ctx);
  const extras = await liveExtras(scope.rows.map((r) => r.id));
  const first = scope.links[0];
  return {
    partner: { name: first.name, email: ctx.email || first.email, notifyOnPublish: scope.links.every((l) => l.notifyOnPublish) },
    clientOrgName: orgName(scope.links),
    publishedAt: scope.publishedAt ? scope.publishedAt.toISOString() : null,
    today,
    rows: scope.rows.map((r) => withExtras(r, extras)),
  };
}

/** PATCH /api/receivables/partner/me — the "Email me when SBC publishes an update" switch, on every row of the partner. */
export async function setNotifyOnPublish(ctx: AuthContext, notifyOnPublish: boolean): Promise<void> {
  await partnerLinks(ctx);
  await db
    .update(receivablePartners)
    .set({ notifyOnPublish: Boolean(notifyOnPublish) })
    .where(and(eq(receivablePartners.profileId, ctx.userId), eq(receivablePartners.active, true)));
}

/** The published row, if and only if the invoice is the caller's; anything else is not found. */
async function scopedRow(ctx: AuthContext, invoiceId: string): Promise<{ scope: PartnerScope; row: SnapshotRow; sheetId: string }> {
  assertPartner(ctx);
  if (!UUID.test(invoiceId ?? '')) throw notFound();
  const scope = await partnerScope(ctx);
  const row = scope.rows.find((r) => r.id === invoiceId);
  const sheetId = scope.sheetOf.get(invoiceId);
  if (!row || !sheetId) throw notFound();
  return { scope, row, sheetId };
}

/** For a write: the live invoice too, which must still exist on that sheet and still be the caller's. */
async function scopedLiveInvoice(ctx: AuthContext, invoiceId: string) {
  const { scope, row, sheetId } = await scopedRow(ctx, invoiceId);
  const [live] = await db
    .select()
    .from(receivableInvoices)
    .where(and(eq(receivableInvoices.id, invoiceId), eq(receivableInvoices.sheetId, sheetId), isNull(receivableInvoices.deletedAt)))
    .limit(1);
  const mine = new Set(scope.links.filter((l) => l.sheetId === sheetId).map((l) => l.partnerId));
  if (!live || !live.partnerId || !mine.has(live.partnerId)) throw notFound();
  return { row, sheetId, live };
}

/** GET /api/receivables/partner/invoices/:id — one invoice with its reminders, pause and notes. */
export async function partnerInvoiceDetail(ctx: AuthContext, invoiceId: string, today: string = todayIst()): Promise<PartnerInvoiceDetailDto> {
  const { row, sheetId } = await scopedRow(ctx, invoiceId);
  const [[live], reminders, notes] = await Promise.all([
    db
      .select({ promisedOn: receivableInvoices.promisedOn, remindersPausedUntil: receivableInvoices.remindersPausedUntil, pauseReason: receivableInvoices.pauseReason })
      .from(receivableInvoices)
      .where(and(eq(receivableInvoices.id, invoiceId), eq(receivableInvoices.sheetId, sheetId)))
      .limit(1),
    db
      .select({ forDate: receivableReminders.forDate, kind: receivableReminders.kind, daysLeft: receivableReminders.daysLeft, status: receivableReminders.status, sentAt: receivableReminders.sentAt })
      .from(receivableReminders)
      .where(and(eq(receivableReminders.invoiceId, invoiceId), eq(receivableReminders.sheetId, sheetId)))
      .orderBy(desc(receivableReminders.forDate))
      .limit(60),
    db
      .select({ id: receivableInvoiceNotes.id, text: receivableInvoiceNotes.text, authorName: receivableInvoiceNotes.authorName, fromSbc: receivableInvoiceNotes.fromSbc, createdAt: receivableInvoiceNotes.createdAt })
      .from(receivableInvoiceNotes)
      .where(and(eq(receivableInvoiceNotes.invoiceId, invoiceId), eq(receivableInvoiceNotes.sheetId, sheetId)))
      .orderBy(asc(receivableInvoiceNotes.createdAt))
      .limit(200),
  ]);
  const pausedUntil = live?.remindersPausedUntil ? String(live.remindersPausedUntil) : null;
  const reminderDtos: PartnerReminderDto[] = reminders.map((r) => ({
    forDate: String(r.forDate),
    label: hitFromRow(r).label,
    status: (['queued', 'skipped', 'sent', 'failed'].includes(r.status) ? r.status : 'queued') as PartnerReminderDto['status'],
    sentAt: r.sentAt ? new Date(r.sentAt).toISOString() : null,
  }));
  const noteDtos: PartnerNoteDto[] = notes.map((n) => ({
    id: n.id,
    text: n.text,
    authorName: n.authorName || (n.fromSbc ? 'SBC' : 'Client partner'),
    fromSbc: n.fromSbc,
    createdAt: new Date(n.createdAt).toISOString(),
  }));
  return {
    row: { ...row, promisedOn: live?.promisedOn ? String(live.promisedOn) : null, noteCount: noteDtos.length },
    reminders: reminderDtos,
    pause: pausedUntil && pausedUntil >= today ? { until: pausedUntil, reason: live?.pauseReason ?? null } : null,
    notes: noteDtos,
  };
}

function cleanNote(text: string | null | undefined, code: string): string | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  if (t.length > PARTNER_NOTE_MAX) throw invalid(code);
  return t;
}

/**
 * POST /api/receivables/partner/invoices/:id/promise — the client promised to pay by a date. The
 * invoice's reminders pause until that date (a longer pause already set by the manager is kept),
 * the change log records it without needing an Update, and an optional note joins the thread.
 */
export async function setPromise(ctx: AuthContext, invoiceId: string, promisedOn: string, note?: string | null, today: string = todayIst()): Promise<void> {
  assertPartner(ctx);
  if (typeof promisedOn !== 'string' || !ISO_DATE.test(promisedOn) || Number.isNaN(Date.parse(`${promisedOn}T00:00:00Z`))) throw invalid('promised_on');
  if (promisedOn < today || promisedOn > addDaysIso(today, PROMISE_MAX_DAYS)) throw invalid('promised_on');
  const text = cleanNote(note, 'note');
  const { sheetId, live } = await scopedLiveInvoice(ctx, invoiceId);
  if (live.status !== 'open') throw invalid('not_open');

  const pausedUntil = live.remindersPausedUntil ? String(live.remindersPausedUntil) : null;
  const keepPause = pausedUntil !== null && pausedUntil > promisedOn;
  const before = live.promisedOn ? String(live.promisedOn) : null;
  await db.transaction(async (tx) => {
    await tx
      .update(receivableInvoices)
      .set({
        promisedOn,
        promisedBy: ctx.userId,
        promisedAt: new Date(),
        ...(keepPause ? {} : { remindersPausedUntil: promisedOn, pauseReason: `Promised to pay on ${sheetDate(promisedOn)}` }),
        updatedAt: new Date(),
      })
      .where(eq(receivableInvoices.id, live.id));
    await logChange(
      {
        sheetId,
        invoiceId: live.id,
        actorId: ctx.userId,
        summary: `${invoiceLabel(live)} promised to pay on ${sheetDate(promisedOn)} (${ctx.name})`,
        field: 'promisedOn',
        before,
        after: promisedOn,
        affectsPage: false,
      },
      tx,
    );
    if (text) {
      await tx.insert(receivableInvoiceNotes).values({ sheetId, invoiceId: live.id, authorId: ctx.userId, authorName: ctx.name, fromSbc: false, text });
    }
  });
}

/** POST /api/receivables/partner/invoices/:id/notes — a note to SBC on one of the partner's invoices. */
export async function addPartnerNote(ctx: AuthContext, invoiceId: string, text: string): Promise<void> {
  assertPartner(ctx);
  const clean = cleanNote(typeof text === 'string' ? text : '', 'text');
  if (!clean) throw invalid('text');
  const { sheetId, live } = await scopedLiveInvoice(ctx, invoiceId);
  await db.insert(receivableInvoiceNotes).values({ sheetId, invoiceId: live.id, authorId: ctx.userId, authorName: ctx.name, fromSbc: false, text: clean });
}

/** GET /api/receivables/partner/export — the partner's own published rows, for the Excel download. */
export async function partnerExportRows(ctx: AuthContext): Promise<{ clientOrgName: string; rows: SnapshotRow[] }> {
  const scope = await partnerScope(ctx);
  return { clientOrgName: orgName(scope.links), rows: scope.rows };
}
