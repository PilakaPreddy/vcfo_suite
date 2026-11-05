import { filingStatus, type FilingRow, type FilingStatus } from '@/lib/compliance/filings';
import { regOf, type Regulator } from '@/lib/ui/regulator';

/**
 * STAFF SEARCH (Ctrl K, prototype Palette Q3) — pure logic shared by the palette and
 * `GET /api/search`.
 *
 * A hit carries what the palette row shows (title, grey sub text, mono code at the right, a
 * status square) and what the filter chips narrow by (regulator, status, client). The rows a hit
 * is built from are already scoped by the caller's `AuthContext` in their repositories; nothing
 * here widens a scope or invents a row.
 */

/** Result groups, in the prototype's order. */
export const SEARCH_GROUPS = [
  'Clients',
  'Steps',
  'Filings',
  'Obligations',
  'Registrations',
  'Documents',
  'Knowledge bank',
  'Pages',
] as const;

export type SearchGroup = (typeof SEARCH_GROUPS)[number];

export interface SearchHit {
  id: string;
  group: SearchGroup;
  title: string;
  /** Grey text after the title. */
  sub?: string;
  /** Mono code at the right (a form, a period, a step number). */
  mono?: string;
  href: string;
  /** One of the six status words, for the status square and the Status chip. */
  status?: string;
  /** Regulator label (MCA, GST, Income tax, Payroll, FEMA, Labour), for the Regulator chip. */
  reg?: string;
  /** Company name, for the Client chip. */
  client?: string;
}

export const REG_LABEL: Record<Regulator, string> = {
  mca: 'MCA',
  gst: 'GST',
  it: 'Income tax',
  payroll: 'Payroll',
  fema: 'FEMA',
  labour: 'Labour',
};

/** The six status words in the prototype's chip order. */
export const STATUS_ORDER = ['Not started', 'In progress', 'Waiting', 'Due soon', 'Overdue', 'Done'] as const;

/** The regulator label of a compliance area or step section, or undefined when none is clear. */
export function regLabelOf(...texts: Array<string | null | undefined>): string | undefined {
  for (const t of texts) {
    if (!t) continue;
    const r = regOf(t);
    if (r) return REG_LABEL[r];
  }
  return undefined;
}

/** Case-free match of every word of the query against the haystack. */
export function matchesQuery(haystack: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const h = haystack.toLowerCase();
  return words.every((w) => h.includes(w));
}

const FILING_WORD: Record<FilingStatus, string> = {
  filed: 'Done',
  overdue: 'Overdue',
  'due-soon': 'Due soon',
  upcoming: 'Not started',
};

/** The six-word reading of one register row (same rule as the Filings view). */
function filingSixWord(row: Pick<FilingRow, 'filedOn' | 'dueDate' | 'rawStatus'>, now: Date): string {
  const status = filingStatus(row, now);
  if ((status === 'upcoming' || status === 'due-soon') && row.rawStatus === 'in-progress') return 'In progress';
  return FILING_WORD[status];
}

const RANK: Record<string, number> = { Overdue: 5, 'Due soon': 4, Waiting: 3, 'In progress': 2, 'Not started': 1, Done: 0 };

/** Indian financial year start of an ISO date (April to March). */
function fyStart(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return m >= 4 ? y : y - 1;
}

function plainDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * Filing hits: one per register row whose form, area, period or company matches. Rows that
 * still need attention come first (the nearest due date), then filed rows.
 * `complianceBase` is the shell's root (`/app/intern`, `/app/manager`, `/app/admin`).
 */
export function filingHits(rows: readonly FilingRow[], query: string, complianceBase: string, now: Date, limit = 6): SearchHit[] {
  const hits = rows
    .filter((r) => matchesQuery(`${r.particular} ${r.compliance} ${r.periodLabel ?? ''} ${r.companyName}`, query))
    .map((r) => ({ r, word: filingSixWord(r, now) }))
    .sort((a, b) => Number(a.word === 'Done') - Number(b.word === 'Done') || a.r.dueDate.localeCompare(b.r.dueDate));
  return hits.slice(0, limit).map(({ r, word }) => ({
    id: `filing:${r.id}`,
    group: 'Filings',
    title: r.particular,
    sub: `${r.companyName} · due ${plainDate(r.dueDate)}`,
    mono: r.periodLabel ?? undefined,
    href: `${complianceBase}/compliances/filings?company=${encodeURIComponent(r.engagementId)}&fy=${fyStart(r.dueDate)}`,
    status: word,
    reg: regLabelOf(r.compliance, r.authority),
    client: r.companyName,
  }));
}

/**
 * Obligation hits: one per obligation (`compliance_obligations.id`) whose name or area matches,
 * with the worst status across the rows in scope and the number of clients it covers.
 */
export function obligationHits(rows: readonly FilingRow[], query: string, complianceBase: string, now: Date, limit = 4): SearchHit[] {
  const byId = new Map<string, FilingRow[]>();
  for (const r of rows) {
    if (!matchesQuery(`${r.particular} ${r.compliance} ${r.authority}`, query)) continue;
    const list = byId.get(r.obligationId) ?? [];
    list.push(r);
    byId.set(r.obligationId, list);
  }
  const out: SearchHit[] = [];
  for (const [obligationId, list] of byId) {
    const first = list[0]!;
    const words = list.filter((r) => !r.filedOn).map((r) => filingSixWord(r, now));
    const worst = words.sort((a, b) => (RANK[b] ?? 0) - (RANK[a] ?? 0))[0] ?? 'Done';
    const companies = new Set(list.map((r) => r.engagementId));
    const sole = companies.size === 1 ? first : null;
    out.push({
      id: `obligation:${obligationId}`,
      group: 'Obligations',
      title: first.particular,
      sub: `${first.compliance} · ${first.frequency} · ${companies.size} ${companies.size === 1 ? 'client' : 'clients'}`,
      mono: first.authority || undefined,
      href: `${complianceBase}/compliances/obligations/${encodeURIComponent(obligationId)}${sole ? `?company=${encodeURIComponent(sole.engagementId)}` : ''}`,
      status: worst,
      reg: regLabelOf(first.compliance, first.authority),
      client: sole?.companyName,
    });
  }
  return out.sort((a, b) => (RANK[b.status ?? ''] ?? 0) - (RANK[a.status ?? ''] ?? 0)).slice(0, limit);
}

/** The shell root whose Compliances pages a role opens (super admin uses the firm scope). */
export function complianceBaseForRole(role: string): string {
  if (role === 'intern') return '/app/intern';
  if (role === 'manager') return '/app/manager';
  return '/app/admin';
}
