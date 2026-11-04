import { applyShareFilters, normaliseShareFilters, type ShareFilters, type ShareStatus } from '@/lib/receivables/share-filters';
import type { Partner, SheetInvoice } from '@/lib/receivables/model';

/**
 * The manager sheet's filters (Phase 10) are a `ShareFilters`, so "Share this view" saves exactly
 * what the manager sees. They live in the page's query string so a view can be bookmarked:
 *
 *   q=northwind  partner=priya-raman  client=Duravant  status=overdue  month=2026-09-01  cur=USD
 *
 * Lists repeat the key (`client=A&client=B`). The default status, All open, is left out of the
 * URL. Keys the sheet does not own (`tab`, `sheet`) are kept as they are.
 */

const KEYS = { search: 'q', partners: 'partner', clients: 'client', status: 'status', months: 'month', currency: 'cur' } as const;
const OWN = new Set<string>(Object.values(KEYS));

export const STATUS_CHOICES: Array<{ value: ShareStatus; label: string }> = [
  { value: 'open', label: 'All open' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'due_soon', label: 'Due in 7 days' },
  { value: 'received', label: 'Received' },
  { value: 'all', label: 'All invoices' },
];

type Params = { get(key: string): string | null; getAll(key: string): string[] };

/** The filters in a query string; anything malformed is dropped. */
export function filtersFromParams(params: Params): ShareFilters {
  return normaliseShareFilters({
    search: params.get(KEYS.search) ?? undefined,
    partnerSlugs: params.getAll(KEYS.partners),
    clients: params.getAll(KEYS.clients),
    status: params.get(KEYS.status) ?? undefined,
    months: params.getAll(KEYS.months),
    currency: params.get(KEYS.currency) ?? undefined,
  });
}

/** The query string for `filters`, keeping every other key of `current`. */
export function paramsWithFilters(current: string, filters: ShareFilters): string {
  const q = new URLSearchParams(current);
  for (const k of OWN) q.delete(k);
  const f = normaliseShareFilters(filters);
  if (f.search) q.set(KEYS.search, f.search);
  for (const s of f.partnerSlugs ?? []) q.append(KEYS.partners, s);
  for (const c of f.clients ?? []) q.append(KEYS.clients, c);
  if (f.status && f.status !== 'open') q.set(KEYS.status, f.status);
  for (const m of f.months ?? []) q.append(KEYS.months, m);
  if (f.currency) q.set(KEYS.currency, f.currency);
  return q.toString();
}

/** True when any filter narrows the default view (all open invoices). */
export function isFiltered(f: ShareFilters): boolean {
  return Boolean(f.search || f.partnerSlugs?.length || f.clients?.length || f.months?.length || f.currency || (f.status && f.status !== 'open'));
}

/**
 * The draft invoices the filters keep, through the same `applyShareFilters` a share link uses,
 * so the sheet and a shared view of it can never disagree.
 */
export function filterInvoices<T extends SheetInvoice>(rows: T[], partners: Pick<Partner, 'id' | 'slug' | 'name'>[], filters: ShareFilters, today: string): T[] {
  const byId = new Map(partners.map((p) => [p.id, p]));
  const tagged = rows.map((r) => {
    const p = r.partnerId ? byId.get(r.partnerId) : undefined;
    return { ...r, partnerSlug: p?.slug ?? null, partnerName: p?.name ?? null };
  });
  const keep = new Set(applyShareFilters(tagged, filters, today).map((r) => r.id));
  return rows.filter((r) => keep.has(r.id));
}
