import 'server-only';

import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';
import { db } from '@/db/client';
import { budgetChanges, budgetComments, budgetAttachments, budgetRows, budgetSectionOwners, budgetSections, budgets, budgetVersions, engagements, profiles } from '@/db/schema';
import { assertEngagementAccess, listEngagements, listScopedEngagementIds } from '@/db/repositories/engagements';
import { listEngagementClients } from '@/db/repositories/engagement-clients';
import { resolveEngagementRecipients } from '@/db/repositories/engagement-recipients';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { buildFromTemplate } from '@/data/budget-templates';
import { changedFields } from '@/lib/budget/diff';
import { computeBudget } from '@/lib/budget/engine';
import { BUDGET_SECTIONS, fyName, zero12, type BudgetRow, type BudgetSection, type BudgetSettings, type BudgetState, type BudgetStatus, type OnceData, type RoleData, type RowKind, type SectionStatus } from '@/lib/budget/model';
import { settingsSchema, type BudgetSummary, type BudgetView, type PersonOption, type SectionView } from '@/lib/budget/wire';
import { isFirmWideAdmin } from '@/lib/auth';
import { BudgetError, assertEditable, isStaffRole, loadBudget, loadRows, maskForViewer, stateOf } from './shared';

/** Budgets the caller can reach, newest year first. */
export async function listBudgets(ctx: AuthContext): Promise<BudgetSummary[]> {
  if (!isStaffRole(ctx.role) && ctx.role !== 'client') return [];
  let scope;
  if (isFirmWideAdmin(ctx.role)) scope = isNull(budgets.deletedAt);
  else {
    const ids = await listScopedEngagementIds(ctx);
    if (!ids.length) return [];
    scope = and(isNull(budgets.deletedAt), inArray(budgets.engagementId, ids));
  }
  const rows = await db
    .select({ row: budgets, companyName: engagements.companyName })
    .from(budgets)
    .innerJoin(engagements, and(eq(engagements.id, budgets.engagementId), isNull(engagements.deletedAt)))
    .where(scope)
    .orderBy(desc(budgets.fyStartYear), asc(engagements.companyName));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.row.id);
  const sections = await db.select({ budgetId: budgetSections.budgetId, status: budgetSections.status }).from(budgetSections).where(inArray(budgetSections.budgetId, ids));
  const versions = await db.select({ budgetId: budgetVersions.budgetId, version: budgetVersions.version, grandTotal: budgetVersions.grandTotal }).from(budgetVersions).where(inArray(budgetVersions.budgetId, ids));
  return rows.map(({ row, companyName }) => {
    const own = sections.filter((s) => s.budgetId === row.id);
    const latest = versions.find((v) => v.budgetId === row.id && v.version === row.currentVersion);
    const settings = row.settings as BudgetSettings;
    return {
      id: row.id,
      engagementId: row.engagementId,
      companyName: companyName ?? '',
      title: settings.title,
      fyName: fyName(settings),
      status: row.status as BudgetStatus,
      currentVersion: row.currentVersion,
      grandTotal: latest ? latest.grandTotal : null,
      sectionsDone: own.filter((s) => s.status === 'done').length,
      sectionsTotal: own.length,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

/** Clients a staff member can start a budget for. */
export async function listBudgetClients(ctx: AuthContext): Promise<{ id: string; name: string }[]> {
  if (!isStaffRole(ctx.role)) return [];
  const rows = await listEngagements(ctx);
  return rows.map((e) => ({ id: e.id, name: e.companyName }));
}

export interface CreateBudgetInput {
  engagementId: string;
  fyStartYear: number;
  fyStartMonth: number;
  templateKey: string;
  /** Start from this earlier budget instead of a template. */
  copyFromBudgetId?: string | null;
}

/** Carry a row into the next year: closing headcount becomes opening, and one-off amounts clear. */
function rollForward(row: BudgetRow, closing: number[] | undefined): { kind: RowKind; data: BudgetRow['data'] } {
  if (row.kind === 'role') {
    const d = row.data as RoleData;
    return { kind: row.kind, data: { ...d, opening: Math.round(closing?.[11] ?? d.opening), hires: zero12(), exits: zero12() } };
  }
  if (row.kind === 'admin_once' || row.kind === 'finance_once') return { kind: row.kind, data: { ...(row.data as OnceData), months: zero12() } };
  return { kind: row.kind, data: row.data };
}

export async function createBudget(ctx: AuthContext, input: CreateBudgetInput): Promise<{ id: string }> {
  if (!isStaffRole(ctx.role)) throw new BudgetError('forbidden', 403);
  const access = await assertEngagementAccess(ctx, input.engagementId);
  if (!access.ok) throw new BudgetError('not_found', 404);
  const [existing] = await db
    .select({ id: budgets.id })
    .from(budgets)
    .where(and(eq(budgets.engagementId, access.dbId), eq(budgets.fyStartYear, input.fyStartYear), isNull(budgets.deletedAt)))
    .limit(1);
  if (existing) throw new BudgetError('budget_exists', 409, { id: existing.id });

  let settings: BudgetSettings;
  let seed: { kind: RowKind; data: BudgetRow['data'] }[];
  if (input.copyFromBudgetId) {
    const source = await loadBudget(ctx, input.copyFromBudgetId);
    if (source.row.engagementId !== access.dbId) throw new BudgetError('not_found', 404);
    const rows = await loadRows(source.row.id);
    const result = computeBudget(stateOf(source.row, rows));
    settings = { ...(source.row.settings as BudgetSettings), fyStartYear: input.fyStartYear, fyStartMonth: input.fyStartMonth, asOf: '' };
    seed = rows.map((r) => rollForward(r, result.roles[r.id]?.closing));
  } else {
    const built = buildFromTemplate(input.templateKey, input.fyStartYear, input.fyStartMonth, access.row.companyName ?? '');
    settings = built.settings;
    seed = built.rows;
  }

  const id = await db.transaction(async (tx) => {
    const [budget] = await tx.insert(budgets).values({ engagementId: access.dbId, fyStartYear: input.fyStartYear, settings, createdBy: ctx.userId }).returning({ id: budgets.id });
    await tx.insert(budgetSections).values(BUDGET_SECTIONS.map((section) => ({ budgetId: budget.id, section })));
    if (seed.length) await tx.insert(budgetRows).values(seed.map((r, i) => ({ budgetId: budget.id, kind: r.kind, position: i, data: r.data, updatedBy: ctx.userId })));
    return budget.id;
  });
  await recordAuditEvent(ctx, { engagementId: access.dbId, action: 'budget.created', summary: `Created the ${fyName(settings)} budget`, metadata: { budgetId: id } });
  return { id };
}

async function listPeople(ctx: AuthContext, engagementId: string): Promise<PersonOption[]> {
  const out = new Map<string, PersonOption>();
  const recipients = await resolveEngagementRecipients(engagementId);
  for (const p of [...(recipients?.leads ?? []), ...(recipients?.managers ?? [])]) out.set(p.userId, { userId: p.userId, name: p.name, email: p.email, isClient: false });
  const clients = await listEngagementClients(ctx, engagementId).catch(() => []);
  for (const c of clients) out.set(c.userId, { userId: c.userId, name: c.name, email: c.email, isClient: true });
  return [...out.values()];
}

export async function getBudgetView(ctx: AuthContext, budgetId: string): Promise<BudgetView> {
  const loaded = await loadBudget(ctx, budgetId);
  const { row, access } = loaded;
  const rows = await loadRows(budgetId);
  const masked = maskForViewer(stateOf(row, rows), access);

  const sectionRows = await db.select().from(budgetSections).where(eq(budgetSections.budgetId, budgetId));
  const owners = await db
    .select({ section: budgetSectionOwners.section, userId: budgetSectionOwners.userId, name: profiles.name, email: profiles.email })
    .from(budgetSectionOwners)
    .innerJoin(profiles, eq(profiles.id, budgetSectionOwners.userId))
    .where(eq(budgetSectionOwners.budgetId, budgetId));
  const sections: SectionView[] = BUDGET_SECTIONS.map((section) => {
    const s = sectionRows.find((x) => x.section === section);
    return {
      section,
      status: (s?.status ?? 'not_started') as SectionStatus,
      dueDate: s?.dueDate ?? null,
      note: s?.note ?? null,
      owners: owners.filter((o) => o.section === section).map((o) => ({ userId: o.userId, name: o.name?.trim() || o.email })),
    };
  });

  const versionRows = await db.select().from(budgetVersions).where(eq(budgetVersions.budgetId, budgetId)).orderBy(desc(budgetVersions.version));
  const comments = await db.select({ section: budgetComments.section, rowId: budgetComments.rowId }).from(budgetComments).where(and(eq(budgetComments.budgetId, budgetId), isNull(budgetComments.resolvedAt)));
  const commentCounts: Record<string, number> = {};
  for (const c of comments) if (access.visibleSections.includes(c.section as BudgetSection)) commentCounts[c.rowId ?? c.section] = (commentCounts[c.rowId ?? c.section] ?? 0) + 1;
  const files = await db.select({ rowId: budgetAttachments.rowId }).from(budgetAttachments).where(and(eq(budgetAttachments.budgetId, budgetId), isNull(budgetAttachments.deletedAt)));
  const attachmentCounts: Record<string, number> = {};
  for (const f of files) attachmentCounts[f.rowId] = (attachmentCounts[f.rowId] ?? 0) + 1;

  return {
    id: row.id,
    engagementId: row.engagementId,
    companyName: loaded.companyName,
    status: row.status as BudgetStatus,
    currentVersion: row.currentVersion,
    settingsVersion: row.settingsVersion,
    approvedByName: row.approvedByName,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    state: masked.state,
    maskedPayroll: masked.maskedPayroll,
    sections,
    access,
    people: access.isStaff ? await listPeople(ctx, row.engagementId) : [],
    versions: versionRows.map((v) => ({
      id: v.id,
      version: v.version,
      grandTotal: v.grandTotal,
      note: v.note,
      publishedByName: v.publishedByName,
      publishedAt: v.publishedAt.toISOString(),
      approvedByName: v.approvedByName,
      approvedAt: v.approvedAt?.toISOString() ?? null,
    })),
    commentCounts,
    attachmentCounts,
  };
}

/** The other budgets of this client, for the copy action and year comparison. */
export async function listSiblingBudgets(ctx: AuthContext, engagementId: string): Promise<{ id: string; fyName: string }[]> {
  const access = await assertEngagementAccess(ctx, engagementId);
  if (!access.ok) return [];
  const rows = await db
    .select({ id: budgets.id, settings: budgets.settings })
    .from(budgets)
    .where(and(eq(budgets.engagementId, access.dbId), isNull(budgets.deletedAt)))
    .orderBy(desc(budgets.fyStartYear));
  return rows.map((r) => ({ id: r.id, fyName: fyName(r.settings as BudgetSettings) }));
}

/** A frozen version, cut down to what this person may see. */
export async function getVersionState(ctx: AuthContext, budgetId: string, versionId: string): Promise<{ state: BudgetState; version: number }> {
  const loaded = await loadBudget(ctx, budgetId);
  const [v] = await db.select().from(budgetVersions).where(and(eq(budgetVersions.id, versionId), eq(budgetVersions.budgetId, budgetId))).limit(1);
  if (!v) throw new BudgetError('not_found', 404);
  /* A published version is the whole budget for every viewer on this client, apart from CTC. */
  const access = { canSeeCtc: loaded.access.canSeeCtc, visibleSections: [...BUDGET_SECTIONS] as BudgetSection[] };
  return { state: maskForViewer(v.snapshot as BudgetState, access).state, version: v.version };
}

export async function updateSettings(ctx: AuthContext, budgetId: string, input: { version: number; settings: unknown }): Promise<{ settingsVersion: number; settings: BudgetSettings }> {
  const loaded = await loadBudget(ctx, budgetId);
  assertEditable(loaded, 'settings');
  const parsed = settingsSchema.safeParse(input.settings);
  if (!parsed.success) throw new BudgetError('invalid_settings', 400);
  const next = parsed.data as BudgetSettings;
  const before = loaded.row.settings as BudgetSettings;

  /* The system lines hold what the engine writes itself, so they stay. */
  for (const line of before.lines) if (line.system && !next.lines.some((l) => l.id === line.id)) throw new BudgetError('system_line', 409, { name: line.name });
  /* A removed department or line would silently drop cost, so it must first be free of rows. */
  const rows = await loadRows(budgetId);
  const used = new Set<string>();
  for (const row of rows) {
    const d = row.data as unknown as Record<string, string>;
    for (const key of ['departmentId', 'locationId', 'lineId', 'appliesTo', 'excludeDepartmentId']) if (d[key]) used.add(d[key]);
  }
  const removed = [...before.departments, ...before.locations, ...before.lines].filter((x) => used.has(x.id) && ![...next.departments, ...next.locations, ...next.lines].some((y) => y.id === x.id));
  if (removed.length) throw new BudgetError('in_use', 409, { names: removed.map((r) => r.name) });

  const [updated] = await db
    .update(budgets)
    .set({ settings: next, settingsVersion: input.version + 1, updatedAt: new Date() })
    .where(and(eq(budgets.id, budgetId), eq(budgets.settingsVersion, input.version)))
    .returning({ settingsVersion: budgets.settingsVersion });
  if (!updated) {
    const [current] = await db.select({ settings: budgets.settings, settingsVersion: budgets.settingsVersion }).from(budgets).where(eq(budgets.id, budgetId)).limit(1);
    throw new BudgetError('conflict', 409, current);
  }
  const changes = changedFields(before, next);
  if (changes.length) {
    await db.insert(budgetChanges).values(changes.map((c) => ({ budgetId, section: 'settings', field: c.field, oldValue: c.before, newValue: c.after, actorId: ctx.userId, actorName: ctx.name })));
    await db.update(budgetSections).set({ status: 'in_progress', updatedAt: new Date() }).where(and(eq(budgetSections.budgetId, budgetId), eq(budgetSections.section, 'settings'), eq(budgetSections.status, 'not_started')));
  }
  return { settingsVersion: updated.settingsVersion, settings: next };
}

export async function removeBudget(ctx: AuthContext, budgetId: string): Promise<void> {
  const loaded = await loadBudget(ctx, budgetId);
  if (!loaded.access.canPublish) throw new BudgetError('forbidden', 403);
  if (loaded.row.status === 'approved') throw new BudgetError('budget_locked', 409);
  await db.update(budgets).set({ deletedAt: new Date() }).where(eq(budgets.id, budgetId));
  await recordAuditEvent(ctx, { engagementId: loaded.row.engagementId, action: 'budget.removed', summary: `Removed the ${fyName(loaded.row.settings as BudgetSettings)} budget`, metadata: { budgetId } });
}
