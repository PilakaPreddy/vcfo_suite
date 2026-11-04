import type { Engagement } from '@/data/engagements';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { isIncorporated } from '@/lib/compliance/incorporation-state';
import { filingStatus, type FilingRow, type FilingStatus } from '@/lib/compliance/filings';

/**
 * COMPLIANCE SCOPE for the shared compliance module.
 *
 * The Calendar / Filings views are built once and rendered identically in
 * every shell — same statutory grid, full-screen mode, register calendar,
 * cadence and status filters. The only inputs that differ are the data scope
 * (the engagement roster the caller's `AuthContext` already filtered: a
 * client's own company, a lead's assignments, the firm) and the audience
 * wording of the pre-incorporation notice.
 *
 * Everything here is derived from lists already in hand — the roster from
 * `useApp()` and the register rows from `/api/filings` — so no new query and
 * no second access rule. `isIncorporated` stays the only source of the
 * pre-COI flag. The company picker appears whenever there is more than one
 * company to pick; a single-company scope is simply that company.
 */

type ComplianceAudience = 'client' | 'staff';

export const ALL_COMPANIES = 'all';

export interface ComplianceScope {
  /** Wording of the pre-COI notice; nothing else keys off this. */
  audience: ComplianceAudience;
  engagements: Engagement[];
  /** Ids of the engagements that fail `isIncorporated` — derived once by the caller. */
  preIncorporationIds: ReadonlySet<string>;
}

/** One company in scope means no picker and no "All companies" state. */
export function soleCompany(engagements: readonly Engagement[]): Engagement | null {
  return engagements.length === 1 ? engagements[0]! : null;
}

export type FilingStatusFilter = 'all' | FilingStatus;

const FILING_STATUS_FILTERS: readonly FilingStatusFilter[] = [
  'all',
  'due-soon',
  'upcoming',
  'overdue',
  'filed',
];

export function isFilingStatusFilter(value: string | null | undefined): value is FilingStatusFilter {
  return FILING_STATUS_FILTERS.includes(value as FilingStatusFilter);
}

/** Pre-COI ids off the roster in hand — the one place the staff wrapper asks. */
export function preIncorporationIdsOf(
  engagements: readonly Engagement[],
  stateFor: (engagement: Engagement) => Record<string, ChecklistItemStateSlice> | undefined,
): ReadonlySet<string> {
  return new Set(
    engagements.filter((e) => !isIncorporated(e, stateFor(e) ?? null)).map((e) => e.id),
  );
}

/** Narrow the scoped register to one company; `'all'` leaves it whole. */
export function rowsForCompany(rows: FilingRow[], companyId: string): FilingRow[] {
  if (companyId === ALL_COMPANIES) return rows;
  return rows.filter((row) => row.engagementId === companyId);
}

/** Keep only rows whose derived status matches; `'all'` leaves them whole. */
export function rowsForStatus(
  rows: FilingRow[],
  status: FilingStatusFilter,
  now: Date,
): FilingRow[] {
  if (status === 'all') return rows;
  return rows.filter((row) => filingStatus(row, now) === status);
}

/** The engagement the picker is narrowed to, or null on "All companies". */
export function pickedCompany(
  engagements: readonly Engagement[],
  companyId: string,
): Engagement | null {
  if (companyId === ALL_COMPANIES) return null;
  return engagements.find((e) => e.id === companyId) ?? null;
}

/** A company id that is not in the roster falls back to the whole portfolio. */
export function normaliseCompanyParam(
  value: string | null | undefined,
  engagements: readonly Engagement[],
): string {
  if (!value || value === ALL_COMPANIES) return ALL_COMPANIES;
  return engagements.some((e) => e.id === value) ? value : ALL_COMPANIES;
}
