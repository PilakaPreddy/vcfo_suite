import { z } from 'zod';
import { BENEFIT_BASES, BUDGET_SECTIONS, DEFAULT_INSURANCE_LINES, FREQUENCIES, defaultAssetBlocks, type BudgetSection, type BudgetState, type BudgetStatus, type MaskedPayroll, type RowKind, type SectionStatus } from './model';

/**
 * BUDGET WIRE — what travels between the screens and the API: the zod schemas that clean every
 * row and settings write, and the shape of the budget view. Unknown keys are dropped, numbers are
 * bounded, and monthly arrays are always twelve long.
 */

const money = z.coerce.number().min(-1e13).max(1e13).catch(0);
const count = z.coerce.number().min(0).max(1e6).catch(0);
const pct = z.coerce.number().min(-1000).max(1000).catch(0);
const month = z.coerce.number().int().min(0).max(12).catch(0);
const label = z.string().max(300).catch('');
const notes = z.string().max(2000).catch('');
const months12 = z
  .array(z.coerce.number().min(-1e13).max(1e13).catch(0))
  .catch([])
  .transform((a) => Array.from({ length: 12 }, (_, i) => a[i] ?? 0));

const roleSchema = z.object({
  role: label,
  departmentId: label,
  locationId: label,
  ctc: money,
  opening: count,
  joinDay: z.coerce.number().int().min(1).max(30).catch(1),
  hires: months12,
  exits: months12,
  incrementPct: pct.nullable().catch(null),
  incrementMonth: month.nullable().catch(null),
  notes,
});

const benefitSchema = z.object({
  name: label,
  lineId: label,
  basis: z.enum(['', ...(Object.keys(BENEFIT_BASES) as [string, ...string[]])]).catch(''),
  rate: money,
  appliesTo: label.transform((v) => v || 'all'),
  excludeDepartmentId: label,
  eligiblePct: pct.nullable().catch(null),
  timing: label.transform((v) => v || 'monthly'),
  locationId: label,
  notes,
});

const costCommon = {
  name: label,
  lineId: label,
  currency: z.string().max(3).catch(''),
  gstPct: pct,
  gstRecoverable: z.boolean().catch(false),
  capital: z.boolean().catch(false),
  lifeYears: z.coerce.number().min(0).max(100).catch(3),
  payLagMonths: z.coerce.number().int().min(0).max(12).catch(0),
  departmentId: label,
  locationId: label,
  notes,
};

const recurringSchema = z.object({
  ...costCommon,
  amount: money,
  frequency: z.enum(['', ...(Object.keys(FREQUENCIES) as [string, ...string[]])]).catch(''),
  startMonth: month,
  endMonth: month,
  escalationPct: pct,
  escalationMonth: month,
});

const onceSchema = z.object({ ...costCommon, months: months12 });

export const ROW_SCHEMAS: Record<RowKind, z.ZodTypeAny> = {
  role: roleSchema,
  benefit: benefitSchema,
  admin_rec: recurringSchema,
  admin_once: onceSchema,
  finance_rec: recurringSchema,
  finance_once: onceSchema,
};

const namedRef = z.object({ id: z.string().max(60), name: z.string().max(200) });

export const settingsSchema = z.object({
  company: label,
  title: label,
  fyStartMonth: z.coerce.number().int().min(1).max(12),
  fyStartYear: z.coerce.number().int().min(2000).max(2100),
  asOf: z.string().max(40).catch(''),
  reportCurrency: z.string().max(3).catch(''),
  fx: z.array(z.object({ code: z.string().min(1).max(3), rate: money, monthly: months12 })).max(20).catch([]),
  departments: z.array(namedRef).max(200).catch([]),
  locations: z.array(namedRef).max(200).catch([]),
  lines: z
    .array(
      z.object({
        id: z.string().max(60),
        group: z.string().max(100),
        name: z.string().max(200),
        system: z.enum(['salaries', 'statutory', 'gratuity', 'depreciation']).optional(),
      }),
    )
    .min(1)
    .max(300),
  incrementPct: pct,
  incrementMonth: month,
  attritionPct: pct,
  currentMonthlyPayroll: money,
  payrollSource: z.enum(['roles', 'typed']).catch('roles'),
  statutory: z.object({
    enabled: z.boolean().catch(false),
    basicSharePct: pct,
    pfPct: pct,
    pfWageCap: money,
    esiPct: pct,
    esiWageLimit: money,
    gratuityPct: pct,
    leavePct: pct,
  }),
  tax: z.object({
    mode: z.enum(['none', 'cost_plus']).catch('none'),
    preset: z.string().max(40).catch(''),
    markupPct: pct,
    ratePct: pct,
    surchargePct: pct,
    surchargeBySlab: z.boolean().catch(false),
    cessPct: pct,
    insuranceGroupPerYear: money,
    insuranceWcPerYear: money,
    insuranceLineIds: z.array(z.string().max(60)).max(20).catch([...DEFAULT_INSURANCE_LINES]),
    assetBlocks: z
      .array(
        z.object({
          id: z.string().max(60),
          name: label,
          itRatePct: pct,
          lifeYears: z.coerce.number().min(0).max(100).catch(0),
          openingIt: money,
          openingCos: money,
          linkLineId: z.string().max(60).catch(''),
          additions: months12,
        }),
      )
      .max(30)
      .catch(defaultAssetBlocks()),
  }),
  openingCash: money,
  minimumCash: money,
  scenarios: z.object({
    high: z.object({ hiresPct: pct, costPct: pct }),
    low: z.object({ hiresPct: pct, costPct: pct }),
  }),
  overspendAlertPct: pct,
  ledgerMap: z.record(z.string(), z.string()).catch({}),
});

export const sectionParam = z.enum(BUDGET_SECTIONS);

export interface SectionView {
  section: BudgetSection;
  status: SectionStatus;
  dueDate: string | null;
  note: string | null;
  owners: { userId: string; name: string }[];
}

export interface BudgetAccess {
  /** SBC staff on this client. */
  isStaff: boolean;
  /** Staff: assign owners, send back, create and remove. */
  canManage: boolean;
  /** Manager or firm-wide admin. */
  canPublish: boolean;
  canApprove: boolean;
  editableSections: BudgetSection[];
  /** The sections whose rows this person receives. */
  visibleSections: BudgetSection[];
  canSeeCtc: boolean;
  /** The full Master Budget of the draft. A client sees it only once published. */
  canSeeMaster: boolean;
  canEnterActuals: boolean;
  canSeeActuals: boolean;
  /** The Variance tab: staff, once the budget was approved. */
  canSeeVariance: boolean;
  /** Enter and submit a month: the project lead, or a manager when the client has no lead. */
  canEnterVariance: boolean;
  /** Approve, send back or reopen a month: managers and firm admins. */
  canApproveVariance: boolean;
}

export interface BudgetSummary {
  id: string;
  engagementId: string;
  companyName: string;
  title: string;
  fyName: string;
  status: BudgetStatus;
  currentVersion: number;
  grandTotal: number | null;
  sectionsDone: number;
  sectionsTotal: number;
  updatedAt: string;
}

export interface PersonOption {
  userId: string;
  name: string;
  email: string;
  isClient: boolean;
}

export interface VersionSummary {
  id: string;
  version: number;
  grandTotal: number;
  note: string | null;
  publishedByName: string | null;
  publishedAt: string;
  approvedByName: string | null;
  approvedAt: string | null;
}

export interface BudgetView {
  id: string;
  engagementId: string;
  companyName: string;
  status: BudgetStatus;
  currentVersion: number;
  settingsVersion: number;
  approvedByName: string | null;
  approvedAt: string | null;
  state: BudgetState;
  maskedPayroll: MaskedPayroll | null;
  sections: SectionView[];
  access: BudgetAccess;
  people: PersonOption[];
  versions: VersionSummary[];
  commentCounts: Record<string, number>;
  attachmentCounts: Record<string, number>;
}

export interface ChangeEntry {
  id: string;
  section: string;
  rowId: string | null;
  rowLabel: string | null;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  actorName: string | null;
  createdAt: string;
}

export interface CommentEntry {
  id: string;
  section: string;
  rowId: string | null;
  body: string;
  authorName: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ActualRow {
  period: string;
  lineId: string;
  amount: number;
  reason: string | null;
  source: string;
}

export interface AttachmentEntry {
  id: string;
  rowId: string;
  fileName: string;
  size: number;
  createdAt: string;
}
