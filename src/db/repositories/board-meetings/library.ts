import 'server-only';
import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { agendaLibraryItems, agendaTemplates } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { AGENDA_LIBRARY_SEED, AGENDA_TOPICS } from '@/data/board-agenda-library';
import { isMeetingType, type AgendaItem, type MeetingType } from '@/lib/board-meetings/model';
import { UUID, canEditLibrary, forbidden, invalid, isStaff, notFound, scopedEngagement } from './shared';

/**
 * AGENDA LIBRARY — the SBC master list of agenda items (Firm settings › Agenda library) and
 * saved agenda templates. Every staff role reads the library; firm-wide admins edit items and
 * upload a new version. Templates: firm templates (engagement null) are read by all staff and
 * written by firm-wide admins; client templates by staff in scope. Clients: none.
 */

export type LibraryRow = typeof agendaLibraryItems.$inferSelect;

export interface LibraryItemDto {
  id: string;
  topic: string;
  scenario: string;
  wording: string;
  law: string;
  applicability: string;
  action: string;
  notes: string;
  active: boolean;
}

function toDto(r: LibraryRow): LibraryItemDto {
  return { id: r.id, topic: r.topic, scenario: r.scenario, wording: r.wording, law: r.law, applicability: r.applicability, action: r.action, notes: r.notes, active: r.active };
}

let seeded = false;

/** Seed the table from src/data the first time it is read (idempotent). */
async function systemEnsureLibrarySeeded(): Promise<void> {
  if (seeded) return;
  const [one] = await db.select({ id: agendaLibraryItems.id }).from(agendaLibraryItems).limit(1);
  if (!one) {
    await db
      .insert(agendaLibraryItems)
      .values(AGENDA_LIBRARY_SEED.map((i, n) => ({ ...i, sort: n + 1 })))
      .onConflictDoNothing();
  }
  seeded = true;
}

/** System read for the notice builder (no AuthContext; callers have checked the meeting). */
export async function systemLibraryMap(): Promise<Map<string, LibraryItemDto>> {
  await systemEnsureLibrarySeeded();
  const rows = await db.select().from(agendaLibraryItems).orderBy(asc(agendaLibraryItems.sort));
  return new Map(rows.map((r) => [r.id, toDto(r)]));
}

export async function listLibrary(ctx: AuthContext, opts: { includeInactive?: boolean } = {}): Promise<{ items: LibraryItemDto[]; topics: typeof AGENDA_TOPICS }> {
  if (!isStaff(ctx.role)) throw notFound();
  await systemEnsureLibrarySeeded();
  const rows = await db.select().from(agendaLibraryItems).orderBy(asc(agendaLibraryItems.sort));
  const items = rows.map(toDto).filter((i) => i.active || (opts.includeInactive && canEditLibrary(ctx.role)));
  return { items, topics: AGENDA_TOPICS };
}

export interface LibraryItemInput {
  topic?: string;
  scenario?: string;
  wording?: string;
  law?: string;
  applicability?: string;
  action?: string;
  notes?: string;
  active?: boolean;
}

export async function updateLibraryItem(ctx: AuthContext, id: string, input: LibraryItemInput): Promise<LibraryItemDto> {
  if (!canEditLibrary(ctx.role)) throw forbidden();
  await systemEnsureLibrarySeeded();
  const [row] = await db.select().from(agendaLibraryItems).where(eq(agendaLibraryItems.id, id)).limit(1);
  if (!row) throw notFound();
  const text = (v: string | undefined, prev: string, max = 2000) => (v === undefined ? prev : v.trim().slice(0, max));
  const next = {
    topic: text(input.topic, row.topic, 200),
    scenario: text(input.scenario, row.scenario, 300),
    wording: text(input.wording, row.wording),
    law: text(input.law, row.law, 300),
    applicability: text(input.applicability, row.applicability, 200),
    action: text(input.action, row.action, 200),
    notes: text(input.notes, row.notes),
    active: input.active ?? row.active,
  };
  if (!next.wording || !next.scenario || !next.topic) throw invalid('wording_required');
  const [saved] = await db.update(agendaLibraryItems).set({ ...next, updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(agendaLibraryItems.id, id)).returning();
  await recordAuditEvent(ctx, { action: 'agenda_library.updated', summary: `Edited agenda item ${id}`, metadata: { id } });
  return toDto(saved!);
}

/** Replace or add items from an uploaded sheet (same columns as the master). Missing ids stay. */
export async function importLibrary(ctx: AuthContext, items: Array<LibraryItemInput & { id: string }>): Promise<{ added: number; updated: number }> {
  if (!canEditLibrary(ctx.role)) throw forbidden();
  await systemEnsureLibrarySeeded();
  const existing = new Set((await db.select({ id: agendaLibraryItems.id }).from(agendaLibraryItems)).map((r) => r.id));
  let added = 0;
  let updated = 0;
  let sort = existing.size;
  for (const i of items) {
    const id = i.id.trim().toUpperCase();
    if (!/^[A-Z]{1,6}-\d{1,4}$/.test(id) || !i.wording?.trim() || !i.scenario?.trim() || !i.topic?.trim()) continue;
    const values = {
      topic: i.topic.trim(),
      scenario: i.scenario.trim(),
      wording: i.wording.trim(),
      law: i.law?.trim() ?? '',
      applicability: i.applicability?.trim() ?? '',
      action: i.action?.trim() ?? '',
      notes: i.notes?.trim() ?? '',
      active: true,
      updatedBy: ctx.userId,
      updatedAt: new Date(),
    };
    if (existing.has(id)) {
      await db.update(agendaLibraryItems).set(values).where(eq(agendaLibraryItems.id, id));
      updated += 1;
    } else {
      sort += 1;
      await db.insert(agendaLibraryItems).values({ id, ...values, sort });
      added += 1;
    }
  }
  await recordAuditEvent(ctx, { action: 'agenda_library.imported', summary: `Imported the agenda library (${added} added, ${updated} updated)`, metadata: { added, updated } });
  return { added, updated };
}

export interface TemplateDto {
  id: string;
  name: string;
  meetingType: MeetingType;
  scope: 'firm' | 'client';
  agenda: AgendaItem[];
  createdAt: string;
}

export async function listTemplates(ctx: AuthContext, engagementId?: string | null): Promise<TemplateDto[]> {
  if (!isStaff(ctx.role)) throw notFound();
  let engDbId: string | null = null;
  if (engagementId) engDbId = (await scopedEngagement(ctx, engagementId)).id;
  const where = engDbId ? or(isNull(agendaTemplates.engagementId), eq(agendaTemplates.engagementId, engDbId)) : isNull(agendaTemplates.engagementId);
  const rows = await db.select().from(agendaTemplates).where(where).orderBy(desc(agendaTemplates.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    meetingType: (isMeetingType(r.meetingType) ? r.meetingType : 'quarterly') as MeetingType,
    scope: r.engagementId ? 'client' : 'firm',
    agenda: r.agenda,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function saveTemplate(
  ctx: AuthContext,
  input: { name: string; meetingType: string; agenda: AgendaItem[]; engagementId?: string | null },
): Promise<TemplateDto> {
  if (!isStaff(ctx.role)) throw notFound();
  const name = input.name?.trim().slice(0, 120);
  if (!name) throw invalid('name_required');
  if (!isMeetingType(input.meetingType)) throw invalid('bad_type');
  let engDbId: string | null = null;
  if (input.engagementId) engDbId = (await scopedEngagement(ctx, input.engagementId)).id;
  else if (!canEditLibrary(ctx.role)) throw forbidden();
  const agenda = (input.agenda ?? []).slice(0, 60).map((a) => ({ key: a.key, libraryId: a.libraryId, text: a.text.slice(0, 2000), subs: (a.subs ?? []).slice(0, 20).map((s) => s.slice(0, 1000)) }));
  const [row] = await db.insert(agendaTemplates).values({ engagementId: engDbId, name, meetingType: input.meetingType, agenda, createdBy: ctx.userId }).returning();
  return { id: row!.id, name: row!.name, meetingType: input.meetingType, scope: engDbId ? 'client' : 'firm', agenda: row!.agenda, createdAt: row!.createdAt.toISOString() };
}

export async function deleteTemplate(ctx: AuthContext, id: string): Promise<void> {
  if (!isStaff(ctx.role) || !UUID.test(id)) throw notFound();
  const [row] = await db.select().from(agendaTemplates).where(eq(agendaTemplates.id, id)).limit(1);
  if (!row) throw notFound();
  if (row.engagementId) await scopedEngagement(ctx, row.engagementId);
  else if (!canEditLibrary(ctx.role)) throw forbidden();
  await db.delete(agendaTemplates).where(and(eq(agendaTemplates.id, id)));
}
