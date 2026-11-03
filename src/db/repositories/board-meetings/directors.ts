import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { companyDirectors, complianceEvents } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { checklistStateFromRow } from '@/db/repositories/engagements';
import type { EngagementDbRow } from '@/db/repositories/engagements';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { displayName, readProposedDirectors } from '@/lib/incorporation/proposed-directors';
import { addDaysIso, isIsoDate, todayIst } from '@/lib/board-meetings/dates';
import { UUID, invalid, notFound, scopedEngagement } from './shared';

/**
 * COMPANY DIRECTORS — the director list of one client company over time. The director picker
 * of every notice reads the current ones (no `ceased_on`, or one after the meeting date).
 * The first read copies the proposed directors from the incorporation checklist (`pre-15`).
 * Adding a director or marking one as left records a DIR-12 event-based filing (30 days).
 * Staff in scope read and write; clients read their own company's current directors.
 */

export type DirectorRow = typeof companyDirectors.$inferSelect;

export interface DirectorDto {
  id: string;
  name: string;
  din: string | null;
  email: string | null;
  phone: string | null;
  designation: string;
  appointedOn: string | null;
  ceasedOn: string | null;
  ceaseReason: string | null;
  current: boolean;
}

export function toDirectorDto(r: DirectorRow, onDate: string = todayIst()): DirectorDto {
  return {
    id: r.id,
    name: r.name,
    din: r.din,
    email: r.email,
    phone: r.phone,
    designation: r.designation,
    appointedOn: r.appointedOn,
    ceasedOn: r.ceasedOn,
    ceaseReason: r.ceaseReason,
    current: !r.ceasedOn || r.ceasedOn > onDate,
  };
}

/** Copy the proposed directors from the incorporation answers when the list is still empty. */
export async function systemSeedDirectors(engagement: EngagementDbRow): Promise<void> {
  const existing = await db.select({ id: companyDirectors.id }).from(companyDirectors).where(eq(companyDirectors.engagementId, engagement.id)).limit(1);
  if (existing.length) return;
  let proposed: ReturnType<typeof readProposedDirectors>;
  try {
    proposed = readProposedDirectors(checklistStateFromRow(engagement) as never);
  } catch {
    proposed = [];
  }
  const rows = proposed
    .map((d) => {
      const name = displayName(d.values).trim();
      if (!name) return null;
      const email = (d.values.officialMailId || d.values.personalMailId || '').trim() || null;
      return {
        engagementId: engagement.id,
        name,
        din: (d.values.din ?? '').replace(/\s+/g, '').trim() || null,
        email,
        phone: (d.values.mobileNumber ?? '').trim() || null,
        designation: 'Director',
        appointedOn: engagement.incorporationDate ?? null,
        source: 'incorporation',
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (rows.length) await db.insert(companyDirectors).values(rows);
}

export async function listDirectors(ctx: AuthContext, engagementId: string, opts: { includePast?: boolean; onDate?: string } = {}): Promise<DirectorDto[]> {
  const engagement = await scopedEngagement(ctx, engagementId, true);
  await systemSeedDirectors(engagement);
  const rows = await db.select().from(companyDirectors).where(eq(companyDirectors.engagementId, engagement.id)).orderBy(asc(companyDirectors.createdAt), asc(companyDirectors.name));
  const all = rows.map((r) => toDirectorDto(r, opts.onDate));
  const visible = ctx.role === 'client' || !opts.includePast ? all.filter((d) => d.current) : all;
  // Clients see names and DINs only, never contact details.
  return ctx.role === 'client' ? visible.map((d) => ({ ...d, email: null, phone: null })) : visible;
}

export interface DirectorInput {
  name: string;
  din?: string | null;
  email?: string | null;
  phone?: string | null;
  designation?: string | null;
  appointedOn?: string | null;
}

function clean(v: string | null | undefined, max = 200): string | null {
  const t = (v ?? '').trim();
  return t ? t.slice(0, max) : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DIN = /^\d{8}$/;

function checkInput(input: DirectorInput): void {
  if (!clean(input.name)) throw invalid('name_required');
  const email = clean(input.email);
  if (email && !EMAIL.test(email)) throw invalid('bad_email');
  const din = clean(input.din);
  if (din && !DIN.test(din)) throw invalid('bad_din');
  if (input.appointedOn && !isIsoDate(input.appointedOn)) throw invalid('bad_date');
}

/** DIR-12 within 30 days of an appointment or a cessation (event-based ROC filing). */
async function recordDir12(engagementId: string, eventDate: string, particular: string): Promise<void> {
  try {
    await db.insert(complianceEvents).values({
      engagementId,
      eventType: 'director_appointment',
      eventDate,
      dueDate: addDaysIso(eventDate, 30),
      particular: particular.slice(0, 300),
    });
  } catch (err) {
    console.error('[board-meetings] could not record the DIR-12 event', err);
  }
}

export async function addDirector(ctx: AuthContext, engagementId: string, input: DirectorInput): Promise<DirectorDto> {
  if (ctx.role === 'client') throw notFound();
  const engagement = await scopedEngagement(ctx, engagementId);
  checkInput(input);
  await systemSeedDirectors(engagement);
  const appointedOn = input.appointedOn || todayIst();
  const [row] = await db
    .insert(companyDirectors)
    .values({
      engagementId: engagement.id,
      name: clean(input.name)!,
      din: clean(input.din),
      email: clean(input.email),
      phone: clean(input.phone, 40),
      designation: clean(input.designation, 80) ?? 'Director',
      appointedOn,
      source: 'manual',
      createdBy: ctx.userId,
    })
    .returning();
  await recordDir12(engagement.id, appointedOn, `DIR-12 · appointment of ${row!.name}`);
  await recordAuditEvent(ctx, { engagementId: engagement.id, action: 'director.added', summary: `Added director ${row!.name}`, metadata: { din: row!.din } });
  return toDirectorDto(row!);
}

async function scopedDirector(ctx: AuthContext, directorId: string): Promise<DirectorRow> {
  if (ctx.role === 'client' || !UUID.test(directorId)) throw notFound();
  const [row] = await db.select().from(companyDirectors).where(eq(companyDirectors.id, directorId)).limit(1);
  if (!row) throw notFound();
  await scopedEngagement(ctx, row.engagementId);
  return row;
}

export async function updateDirector(ctx: AuthContext, directorId: string, input: Partial<DirectorInput>): Promise<DirectorDto> {
  const row = await scopedDirector(ctx, directorId);
  checkInput({ name: input.name ?? row.name, din: input.din ?? row.din, email: input.email ?? row.email, appointedOn: input.appointedOn ?? null });
  const [next] = await db
    .update(companyDirectors)
    .set({
      name: input.name !== undefined ? clean(input.name)! : row.name,
      din: input.din !== undefined ? clean(input.din) : row.din,
      email: input.email !== undefined ? clean(input.email) : row.email,
      phone: input.phone !== undefined ? clean(input.phone, 40) : row.phone,
      designation: input.designation !== undefined ? clean(input.designation, 80) ?? 'Director' : row.designation,
      appointedOn: input.appointedOn !== undefined ? input.appointedOn || null : row.appointedOn,
      updatedAt: new Date(),
    })
    .where(eq(companyDirectors.id, row.id))
    .returning();
  return toDirectorDto(next!);
}

/** Mark a director as left: leaves every notice dated after `ceasedOn`; history is kept. */
export async function ceaseDirector(ctx: AuthContext, directorId: string, input: { ceasedOn: string; reason: string }): Promise<DirectorDto> {
  const row = await scopedDirector(ctx, directorId);
  if (!isIsoDate(input.ceasedOn)) throw invalid('bad_date');
  const reason = ['resigned', 'removed', 'disqualified', 'other'].includes(input.reason) ? input.reason : 'other';
  const [next] = await db
    .update(companyDirectors)
    .set({ ceasedOn: input.ceasedOn, ceaseReason: reason, updatedAt: new Date() })
    .where(and(eq(companyDirectors.id, row.id), eq(companyDirectors.engagementId, row.engagementId)))
    .returning();
  await recordDir12(row.engagementId, input.ceasedOn, `DIR-12 · cessation of ${row.name} (${reason})`);
  await recordAuditEvent(ctx, { engagementId: row.engagementId, action: 'director.ceased', summary: `Marked director ${row.name} as left (${reason})`, metadata: { reason, ceasedOn: input.ceasedOn } });
  return toDirectorDto(next!);
}

/** Rows by id for a meeting (any engagement already checked by the caller). */
export async function directorsOfEngagement(engagementDbId: string): Promise<DirectorRow[]> {
  return db.select().from(companyDirectors).where(eq(companyDirectors.engagementId, engagementDbId)).orderBy(asc(companyDirectors.createdAt));
}
