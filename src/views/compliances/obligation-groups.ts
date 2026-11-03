import { filingStatus, sortByDueDate, type FilingRow, type FilingStatus } from '@/lib/compliance/filings';
import type { PortalFiling } from '@/lib/client-portal/compliances';
import { daysUntil, filingWord, type SixWord } from '@/views/compliances/spectrum-status';

/**
 * OBLIGATIONS, GROUPED BY FILING (prototype C-0108) — pure logic.
 *
 * Input is the register already in hand: the scoped `compliance_instances`
 * rows from `/api/filings` and, by instance id, the side-table facts from
 * `/api/client/compliances` (data received, ARN, owner). Both are scoped by
 * the caller's `AuthContext` in their repositories; nothing here widens or
 * invents a row.
 *
 * One group per obligation (`compliance_obligations.id`). Its band is the
 * filing period that needs attention: the earliest due date that is not yet
 * filed for any client, or, when every period is filed, the latest one. The
 * client rows under the band are the instances due on that date, so "n of m
 * filed" counts the clients of that one period.
 */

/** "Due in the next 15 days" (owner decision for the Obligations rail). */
const SOON_DAYS = 15;

export interface ObligationClientRow {
  /** The instance id. */
  key: string;
  row: FilingRow;
  detail?: PortalFiling;
  status: FilingStatus;
  word: SixWord;
  /** Latest filed date of this obligation for this client, any period. */
  lastFiled: string | null;
  /** Earliest unfiled due date of this obligation for this client. */
  nextDue: string | null;
}

export interface ObligationGroup {
  obligationId: string;
  name: string;
  area: string;
  authority: string;
  frequency: string;
  /** The band's due date (ISO). */
  dueDate: string;
  /** Worst status of the band's client rows. */
  status: FilingStatus;
  filed: number;
  total: number;
  rows: ObligationClientRow[];
  /** Every instance of the obligation in view, for the detail page. */
  instances: FilingRow[];
}

const RANK: Record<FilingStatus, number> = { overdue: 3, 'due-soon': 2, upcoming: 1, filed: 0 };

function iso(value: string): string {
  return value.slice(0, 10);
}

export function groupObligations(
  rows: FilingRow[],
  details: ReadonlyMap<string, PortalFiling>,
  now: Date,
): ObligationGroup[] {
  const byObligation = new Map<string, FilingRow[]>();
  for (const row of rows) {
    const list = byObligation.get(row.obligationId) ?? [];
    list.push(row);
    byObligation.set(row.obligationId, list);
  }

  const groups: ObligationGroup[] = [];
  for (const [obligationId, list] of byObligation) {
    const sorted = sortByDueDate(list);
    const unfiled = sorted.filter((r) => !r.filedOn);
    const bandDate = iso(unfiled[0]?.dueDate ?? sorted[sorted.length - 1]!.dueDate);

    const lastFiled = new Map<string, string>();
    const nextDue = new Map<string, string>();
    for (const r of sorted) {
      if (r.filedOn) {
        const prev = lastFiled.get(r.engagementId);
        if (!prev || r.filedOn > prev) lastFiled.set(r.engagementId, r.filedOn);
      } else if (!nextDue.has(r.engagementId)) {
        nextDue.set(r.engagementId, iso(r.dueDate));
      }
    }

    const bandRows: ObligationClientRow[] = sorted
      .filter((r) => iso(r.dueDate) === bandDate)
      .sort((a, b) => a.companyName.localeCompare(b.companyName))
      .map((r) => ({
        key: r.id,
        row: r,
        detail: details.get(r.id),
        status: filingStatus(r, now),
        word: filingWord(r, now),
        lastFiled: lastFiled.get(r.engagementId) ?? null,
        nextDue: nextDue.get(r.engagementId) ?? null,
      }));

    const first = sorted[0]!;
    let worst: FilingStatus = 'filed';
    for (const r of bandRows) if (RANK[r.status] > RANK[worst]) worst = r.status;
    groups.push({
      obligationId,
      name: first.particular,
      area: first.compliance,
      authority: first.authority,
      frequency: first.frequency,
      dueDate: bandDate,
      status: worst,
      filed: bandRows.filter((r) => r.status === 'filed').length,
      total: bandRows.length,
      rows: bandRows,
      instances: sorted,
    });
  }

  return groups.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));
}

/** Unfiled and due today or within the next 15 days. */
export function dueWithinSoon(row: Pick<FilingRow, 'filedOn' | 'dueDate'>, now: Date): boolean {
  if (row.filedOn) return false;
  const days = daysUntil(row.dueDate, now);
  return days !== null && days >= 0 && days <= SOON_DAYS;
}

/**
 * Waiting on the client: not filed, no "data received" date recorded, and the
 * filing is late or due within 15 days, so the work cannot move without the
 * client's data. A row without the side-table facts is not counted.
 */
export function waitingOnClient(row: Pick<FilingRow, 'filedOn' | 'dueDate'>, detail: PortalFiling | undefined, now: Date): boolean {
  if (row.filedOn || !detail || detail.dataReceivedOn) return false;
  const days = daysUntil(row.dueDate, now);
  return days !== null && days <= SOON_DAYS;
}

export type ObligationFilter = '' | 'overdue' | 'soon' | 'waiting' | 'done' | 'none';

export function matchesFilter(r: ObligationClientRow, filter: ObligationFilter, now: Date): boolean {
  switch (filter) {
    case '':
      return true;
    case 'overdue':
      return r.status === 'overdue';
    case 'soon':
      return dueWithinSoon(r.row, now);
    case 'waiting':
      return waitingOnClient(r.row, r.detail, now);
    case 'done':
      return r.status === 'filed';
    case 'none':
      return r.word === 'Not started';
  }
}

export interface FlowCounts {
  data: number;
  prepared: number;
  filed: number;
  acknowledged: number;
}

/**
 * The progress flow of a set of instances: data from client (nothing
 * received yet), prepared (data in, not filed), filed (no acknowledgement
 * recorded) and acknowledged (an ARN recorded). Rows without the side-table
 * facts count only once filed.
 */
export function flowCounts(rows: FilingRow[], details: ReadonlyMap<string, PortalFiling>): FlowCounts {
  const out: FlowCounts = { data: 0, prepared: 0, filed: 0, acknowledged: 0 };
  for (const row of rows) {
    const d = details.get(row.id);
    if (row.filedOn) {
      if (d?.acknowledgementNo?.trim()) out.acknowledged += 1;
      else out.filed += 1;
    } else if (d) {
      if (d.dataReceivedOn) out.prepared += 1;
      else out.data += 1;
    }
  }
  return out;
}
