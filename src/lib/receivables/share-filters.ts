/**
 * RECEIVABLES SHARE FILTERS (Phase 10, docs/specs/receivables/PLAN.md): the filters a saved,
 * shareable view applies to the latest published version. The manager's sheet filter bar
 * produces one of these, a share link stores it, and the shared page applies it with
 * `applyShareFilters`. Every field is optional; an empty object shows every row.
 */
import { daysLeft } from './dates';
import type { SnapshotRow } from './model';

export type ShareStatus = 'all' | 'open' | 'overdue' | 'due_soon' | 'received';

export const SHARE_STATUS_LABEL: Record<ShareStatus, string> = {
  all: 'All invoices',
  open: 'All open',
  overdue: 'Overdue',
  due_soon: 'Due in the next 7 days',
  received: 'Received',
};

export type ShareFilters = {
  /** Partner slugs (stable across versions, unlike ids in old snapshots). */
  partnerSlugs?: string[];
  /** Client names, matched without regard to case. */
  clients?: string[];
  status?: ShareStatus;
  /** Invoice months, `YYYY-MM-01`. */
  months?: string[];
  /** `INR` or a foreign currency code. */
  currency?: string | null;
  /** Case-insensitive text matched against client, invoice number and partner name. */
  search?: string;
};

const DUE_SOON_DAYS = 7;

function clean(list: string[] | undefined): string[] {
  return (list ?? []).map((s) => s.trim()).filter(Boolean);
}

/** Drops empty fields and unknown keys so a stored filter is small and comparable. */
export function normaliseShareFilters(input: unknown): ShareFilters {
  const f = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? clean(v.filter((x): x is string => typeof x === 'string')).slice(0, 100) : []);
  const out: ShareFilters = {};
  const partnerSlugs = arr(f.partnerSlugs);
  if (partnerSlugs.length) out.partnerSlugs = partnerSlugs;
  const clients = arr(f.clients);
  if (clients.length) out.clients = clients;
  const months = arr(f.months).filter((m) => /^\d{4}-\d{2}-01$/.test(m));
  if (months.length) out.months = months;
  if (typeof f.status === 'string' && f.status in SHARE_STATUS_LABEL && f.status !== 'all') out.status = f.status as ShareStatus;
  if (f.status === 'all') out.status = 'all';
  if (typeof f.currency === 'string' && /^[A-Za-z]{3}$/.test(f.currency.trim())) out.currency = f.currency.trim().toUpperCase();
  if (typeof f.search === 'string' && f.search.trim()) out.search = f.search.trim().slice(0, 100);
  return out;
}

function statusMatches(row: SnapshotRow, status: ShareStatus | undefined, today: string): boolean {
  const s = status ?? 'open';
  if (s === 'all') return true;
  if (s === 'received') return row.status === 'received';
  if (row.status !== 'open') return false;
  if (s === 'open') return true;
  const left = daysLeft(row.dueDate, today);
  if (s === 'overdue') return left < 0;
  return left >= 0 && left <= DUE_SOON_DAYS;
}

/** The rows a share link shows. Without a status the view shows open invoices, like the sheet. */
export function applyShareFilters(rows: SnapshotRow[], filters: ShareFilters, today: string): SnapshotRow[] {
  const slugs = new Set(clean(filters.partnerSlugs));
  const clients = new Set(clean(filters.clients).map((c) => c.toLowerCase()));
  const months = new Set(clean(filters.months));
  const currency = filters.currency?.toUpperCase() ?? null;
  const search = filters.search?.trim().toLowerCase() ?? '';
  return rows.filter((r) => {
    if (slugs.size && !(r.partnerSlug && slugs.has(r.partnerSlug))) return false;
    if (clients.size && !clients.has(r.clientName.toLowerCase())) return false;
    if (months.size && !months.has(r.invoiceMonth)) return false;
    if (currency && (r.currency ?? 'INR').toUpperCase() !== currency) return false;
    if (search) {
      const hay = `${r.clientName} ${r.invoiceNo ?? ''} ${r.partnerName ?? ''}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return statusMatches(r, filters.status, today);
  });
}

/** A short plain description of a filter, e.g. "Priya Raman · Overdue · USD". */
export function describeShareFilters(filters: ShareFilters, partnerNames: Record<string, string> = {}): string {
  const parts: string[] = [];
  if (filters.partnerSlugs?.length) parts.push(filters.partnerSlugs.map((s) => partnerNames[s] ?? s).join(', '));
  if (filters.clients?.length) parts.push(filters.clients.join(', '));
  parts.push(SHARE_STATUS_LABEL[filters.status ?? 'open']);
  if (filters.months?.length) parts.push(`${filters.months.length} month${filters.months.length > 1 ? 's' : ''}`);
  if (filters.currency) parts.push(filters.currency);
  if (filters.search) parts.push(`“${filters.search}”`);
  return parts.join(' · ');
}
