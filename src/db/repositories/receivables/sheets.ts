import 'server-only';
import { and, asc, count, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { profiles, receivableChanges, receivableInvoiceNotes, receivableInvoices, receivablePartners, receivableSheets, receivableVersions } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isFirmWideAdmin } from '@/lib/auth';
import { newPublicKey } from '@/lib/receivables/public-key';
import { DEFAULT_REMINDER_RULES, type Partner, type ReminderRules } from '@/lib/receivables/model';
import type { ManagerInvoiceDto, PartnerDto } from '@/lib/receivables/wire';
import { toPartnerDto } from './partner-logins';
import { assertEditorRole, invalid, scopedSheet, toInvoice, type SheetRow } from './shared';

export type SheetSummary = Pick<SheetRow, 'id' | 'name' | 'clientOrgName' | 'managerUserId' | 'requireKey' | 'publishedVersionId'>;

export type ManagerSheet = {
  sheet: SheetRow;
  /** Phase 8: each partner carries their login state. */
  partners: PartnerDto[];
  /** Phase 8: each invoice carries the partner's promise date and its note count. */
  invoices: ManagerInvoiceDto[];
  /** Changes since the last Update that the public page does not show yet. */
  unpublishedChanges: number;
  latestVersion: { id: string; seq: number; publishedAt: Date; publishedByName: string } | null;
};

/** The sheets the caller may edit: all for firm-wide admins, their own for a manager. */
export async function listMySheets(ctx: AuthContext): Promise<SheetSummary[]> {
  assertEditorRole(ctx);
  const cols = {
    id: receivableSheets.id,
    name: receivableSheets.name,
    clientOrgName: receivableSheets.clientOrgName,
    managerUserId: receivableSheets.managerUserId,
    requireKey: receivableSheets.requireKey,
    publishedVersionId: receivableSheets.publishedVersionId,
  };
  if (isFirmWideAdmin(ctx.role)) return db.select(cols).from(receivableSheets).orderBy(asc(receivableSheets.name));
  return db.select(cols).from(receivableSheets).where(eq(receivableSheets.managerUserId, ctx.userId)).orderBy(asc(receivableSheets.name));
}

export function toPartner(row: typeof receivablePartners.$inferSelect): Partner {
  return { id: row.id, slug: row.slug, name: row.name, email: row.email, active: row.active };
}

/** Everything the manager area needs for one sheet. */
export async function getManagerSheet(ctx: AuthContext, sheetId: string): Promise<ManagerSheet> {
  const sheet = await scopedSheet(ctx, sheetId);
  const [partners, invoices, versions] = await Promise.all([
    db
      .select({ partner: receivablePartners, profileStatus: profiles.status })
      .from(receivablePartners)
      .leftJoin(profiles, eq(profiles.id, receivablePartners.profileId))
      .where(eq(receivablePartners.sheetId, sheet.id))
      .orderBy(asc(receivablePartners.name)),
    db
      .select()
      .from(receivableInvoices)
      .where(and(eq(receivableInvoices.sheetId, sheet.id), isNull(receivableInvoices.deletedAt)))
      .orderBy(asc(receivableInvoices.invoiceMonth), asc(receivableInvoices.dueDate)),
    db
      .select({ id: receivableVersions.id, seq: receivableVersions.seq, publishedAt: receivableVersions.publishedAt, publishedByName: receivableVersions.publishedByName })
      .from(receivableVersions)
      .where(eq(receivableVersions.sheetId, sheet.id))
      .orderBy(desc(receivableVersions.seq))
      .limit(1),
  ]);
  const latestVersion = versions[0] ?? null;
  const since = latestVersion
    ? and(eq(receivableChanges.sheetId, sheet.id), eq(receivableChanges.affectsPage, true), gt(receivableChanges.createdAt, latestVersion.publishedAt))
    : and(eq(receivableChanges.sheetId, sheet.id), eq(receivableChanges.affectsPage, true));
  const [{ n }] = await db.select({ n: count() }).from(receivableChanges).where(since);
  // The notes are few per sheet, so they are counted here rather than with a GROUP BY.
  const notes = await db.select({ invoiceId: receivableInvoiceNotes.invoiceId }).from(receivableInvoiceNotes).where(eq(receivableInvoiceNotes.sheetId, sheet.id));
  const noteCount = new Map<string, number>();
  for (const note of notes ?? []) noteCount.set(note.invoiceId, (noteCount.get(note.invoiceId) ?? 0) + 1);
  return {
    sheet,
    partners: partners.map((r) => toPartnerDto(r.partner, r.partner.profileId ? { status: r.profileStatus ?? null } : null)),
    invoices: invoices.map((row) => ({ ...toInvoice(row), promisedOn: row.promisedOn ? String(row.promisedOn) : null, noteCount: noteCount.get(row.id) ?? 0 })),
    unpublishedChanges: Number(n),
    latestVersion,
  };
}

function validRules(r: ReminderRules): ReminderRules {
  const days = [...new Set((r.daysBefore ?? []).map(Number))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 60).sort((a, b) => b - a);
  const hour = Number(r.sendHourIst);
  if (!Number.isInteger(hour) || hour < 6 || hour > 20) throw invalid('send_hour');
  return { enabled: Boolean(r.enabled), daysBefore: days, onDueDate: Boolean(r.onDueDate), dailyAfterDue: Boolean(r.dailyAfterDue), skipWeekends: Boolean(r.skipWeekends), sendHourIst: hour };
}

export async function updateSheetSettings(ctx: AuthContext, sheetId: string, patch: { requireKey?: boolean; reminderRules?: ReminderRules }): Promise<SheetRow> {
  const sheet = await scopedSheet(ctx, sheetId);
  const set: Partial<typeof receivableSheets.$inferInsert> = { updatedAt: new Date() };
  if (typeof patch.requireKey === 'boolean') set.requireKey = patch.requireKey;
  if (patch.reminderRules) set.reminderRules = validRules(patch.reminderRules);
  const [row] = await db.update(receivableSheets).set(set).where(eq(receivableSheets.id, sheet.id)).returning();
  return row;
}

/**
 * SYSTEM (no AuthContext): creates a sheet for the seed and import scripts, which run outside a
 * request. Not reachable from any route.
 */
export async function systemCreateSheet(input: { name: string; clientOrgName: string; managerUserId: string | null }): Promise<SheetRow> {
  const [row] = await db
    .insert(receivableSheets)
    .values({ name: input.name, clientOrgName: input.clientOrgName, managerUserId: input.managerUserId, publicKey: newPublicKey(), requireKey: true, reminderRules: DEFAULT_REMINDER_RULES })
    .returning();
  return row;
}
