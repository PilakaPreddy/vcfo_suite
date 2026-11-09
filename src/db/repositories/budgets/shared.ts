import 'server-only';

import { asc, eq } from 'drizzle-orm';
import type { AuthContext } from '@/auth/guards';
import { db } from '@/db/client';
import { budgetRows, budgetSectionOwners, budgets } from '@/db/schema';
import { assertEngagementAccess } from '@/db/repositories/engagements';
import { computeBudget } from '@/lib/budget/engine';
import { BUDGET_SECTIONS, ROW_SECTION, type BudgetRow, type BudgetSection, type BudgetSettings, type BudgetState, type BudgetStatus, type MaskedPayroll, type RoleData, type RowKind } from '@/lib/budget/model';
import type { BudgetAccess } from '@/lib/budget/wire';
import { isAdminOrManager, isFirmWideAdmin } from '@/lib/auth';
import { isUuid } from '@/lib/slug';

/**
 * Who may do what on a budget. Everything goes through `loadBudget`, which reuses the engagement
 * scope, so a budget of another client reads as not found.
 *
 * Staff with access to the client can edit every tab, and each edit is logged. A client user can
 * edit only the tabs they own, sees the Master Budget only once it is published, and sees CTC only
 * when they own the CTC & hiring tab. Developers and partners have no access at all.
 */

export class BudgetError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public detail?: unknown,
  ) {
    super(code);
  }
}

export type BudgetRowRecord = typeof budgets.$inferSelect;

export interface LoadedBudget {
  row: BudgetRowRecord;
  companyName: string;
  access: BudgetAccess;
  owned: BudgetSection[];
}

export function isStaffRole(role: string): boolean {
  return isAdminOrManager(role) || role === 'intern';
}

export function computeAccess(ctx: AuthContext, status: BudgetStatus, owned: BudgetSection[]): BudgetAccess {
  const isStaff = isStaffRole(ctx.role);
  const open = status === 'draft';
  const allSections = [...BUDGET_SECTIONS];
  return {
    isStaff,
    canManage: isStaff,
    canPublish: isAdminOrManager(ctx.role),
    canApprove: status === 'published' && (ctx.role === 'client' || isFirmWideAdmin(ctx.role)),
    editableSections: !open ? [] : isStaff ? allSections : owned,
    visibleSections: isStaff || !open ? allSections : owned,
    canSeeCtc: isStaff || owned.includes('hiring'),
    canSeeMaster: isStaff || !open,
    canEnterActuals: isStaff,
    canSeeActuals: isStaff || !open,
  };
}

export async function loadBudget(ctx: AuthContext, budgetId: string): Promise<LoadedBudget> {
  if (!isStaffRole(ctx.role) && ctx.role !== 'client') throw new BudgetError('forbidden', 403);
  if (!isUuid(budgetId)) throw new BudgetError('not_found', 404);
  const [row] = await db.select().from(budgets).where(eq(budgets.id, budgetId)).limit(1);
  if (!row || row.deletedAt) throw new BudgetError('not_found', 404);
  const scope = await assertEngagementAccess(ctx, row.engagementId);
  if (!scope.ok) throw new BudgetError('not_found', 404);
  const owners = await db.select({ section: budgetSectionOwners.section, userId: budgetSectionOwners.userId }).from(budgetSectionOwners).where(eq(budgetSectionOwners.budgetId, budgetId));
  const owned = owners.filter((o) => o.userId === ctx.userId).map((o) => o.section as BudgetSection);
  return { row, companyName: scope.row.companyName ?? '', access: computeAccess(ctx, row.status as BudgetStatus, owned), owned };
}

export function assertEditable(loaded: LoadedBudget, section: BudgetSection): void {
  if (loaded.row.status !== 'draft') throw new BudgetError('budget_locked', 409);
  if (!loaded.access.editableSections.includes(section)) throw new BudgetError('forbidden', 403);
}

export async function loadRows(budgetId: string): Promise<BudgetRow[]> {
  const rows = await db.select().from(budgetRows).where(eq(budgetRows.budgetId, budgetId)).orderBy(asc(budgetRows.position), asc(budgetRows.createdAt));
  return rows.map((r) => ({ id: r.id, kind: r.kind as RowKind, position: r.position, version: r.version, data: r.data as BudgetRow['data'] }));
}

export function stateOf(row: BudgetRowRecord, rows: BudgetRow[]): BudgetState {
  return { settings: row.settings as BudgetSettings, rows };
}

/**
 * Cut a budget down to what this person may see. Roles always stay, because benefits run on
 * headcount, but a viewer without HR access receives them with no CTC and the payroll as monthly
 * totals, so every total still agrees with the budget.
 */
export function maskForViewer(state: BudgetState, access: Pick<BudgetAccess, 'canSeeCtc' | 'visibleSections'>): { state: BudgetState; maskedPayroll: MaskedPayroll | null } {
  const visible = (row: BudgetRow) => row.kind === 'role' || access.visibleSections.includes(ROW_SECTION[row.kind]);
  if (access.canSeeCtc) return { state: { ...state, rows: state.rows.filter(visible) }, maskedPayroll: null };
  const full = computeBudget(state);
  const statutory = Array(12).fill(0) as number[];
  const gratuity = Array(12).fill(0) as number[];
  for (const r of Object.values(full.roles)) {
    r.statutory.forEach((x, i) => (statutory[i] += x));
    r.gratuity.forEach((x, i) => (gratuity[i] += x));
  }
  const maskedPayroll: MaskedPayroll = { salary: full.salary, statutory, gratuity };
  const rows = state.rows.filter(visible).map((row): BudgetRow => {
    if (row.kind !== 'role') return row;
    return { ...row, data: { ...(row.data as RoleData), ctc: 0, incrementPct: null, incrementMonth: null, notes: '' } };
  });
  return { state: { settings: { ...state.settings, currentMonthlyPayroll: 0, payrollSource: 'roles' }, rows, maskedPayroll }, maskedPayroll };
}
