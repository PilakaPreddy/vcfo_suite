/**
 * CLIENT PORTAL · SEARCH HITS — pure shaping for GET /api/client/portal/search.
 *
 * No db and no React: the route reads the caller's own documents and filings through the
 * scoped repositories and hands the rows here. Each hit carries the regulator label and the
 * status word (R-13, six words) the search palette's Regulator and Status chips filter on.
 * Obligations are the filings grouped by name, with the same URL segment as the Obligations
 * page (`slugOf`), so a hit opens the record the page shows.
 */
import { filingStatus, type FilingRow, type FilingStatus } from '@/lib/compliance/filings';
import { regOf, type Regulator } from '@/lib/ui/regulator';
import { slugOf } from '@/lib/client-portal/compliances';

export type SearchGroup = 'Pages' | 'Steps' | 'Filings' | 'Obligations' | 'Registrations' | 'Documents';

export interface SearchHit {
  group: SearchGroup;
  title: string;
  meta?: string;
  href: string;
  /** Regulator label ("MCA", "GST", "Income tax"…), when the record has one. */
  reg?: string;
  /** One of the six status words, when the record has a status. */
  status?: string;
  /** A short code shown in mono at the right of the row (form or period). */
  code?: string;
}

export const REG_LABEL: Record<Regulator, string> = {
  mca: 'MCA',
  gst: 'GST',
  it: 'Income tax',
  payroll: 'Payroll',
  fema: 'FEMA',
  labour: 'Labour',
};

/** The six status words in the order the Status chip lists them. */
export const STATUS_WORDS = ['Not started', 'In progress', 'Waiting', 'Due soon', 'Overdue', 'Done'] as const;

const FILING_WORD: Record<FilingStatus, string> = {
  filed: 'Done',
  overdue: 'Overdue',
  'due-soon': 'Due soon',
  upcoming: 'Not started',
};

/** The regulator label of an area or authority word, or undefined when none is clear. */
export function regLabelOf(...words: Array<string | null | undefined>): string | undefined {
  for (const w of words) {
    const r = w ? regOf(w) : undefined;
    if (r) return REG_LABEL[r];
  }
  return undefined;
}

type FilingInput = Pick<
  FilingRow,
  'id' | 'engagementId' | 'particular' | 'compliance' | 'authority' | 'frequency' | 'periodLabel' | 'dueDate' | 'filedOn'
>;

const matches = (q: string, ...parts: Array<string | null | undefined>) =>
  !q || parts.filter(Boolean).join(' ').toLowerCase().includes(q);

/** Filing hits: one per period on the register. */
export function filingHits(rows: FilingInput[], q: string, now: Date, limit = 12): SearchHit[] {
  return rows
    .filter((f) => matches(q, f.particular, f.compliance, f.periodLabel))
    .slice(0, limit)
    .map((f) => ({
      group: 'Filings' as const,
      title: f.particular,
      meta: [f.periodLabel, f.dueDate].filter(Boolean).join(' · '),
      href: `/app/client/compliances/filings?filing=${encodeURIComponent(f.id)}`,
      reg: regLabelOf(f.compliance, f.authority),
      status: FILING_WORD[filingStatus(f, now)],
    }));
}

/**
 * Obligation hits: the filings grouped by engagement and name, as the Obligations page groups
 * them. The status is the worst open period (Overdue, then Due soon, then Not started), or Done
 * when every period is filed.
 */
export function obligationHits(rows: FilingInput[], q: string, now: Date, limit = 12): SearchHit[] {
  const many = new Set(rows.map((r) => r.engagementId)).size > 1;
  const groups = new Map<string, FilingInput[]>();
  for (const r of rows) {
    const k = `${r.engagementId}\u0000${r.particular}`;
    const list = groups.get(k);
    if (list) list.push(r);
    else groups.set(k, [r]);
  }
  const out: SearchHit[] = [];
  for (const list of groups.values()) {
    const head = list[0]!;
    if (!matches(q, head.particular, head.compliance, head.frequency)) continue;
    const open = list.filter((r) => !r.filedOn).map((r) => filingStatus(r, now));
    const status = open.includes('overdue') ? 'Overdue' : open.includes('due-soon') ? 'Due soon' : open.length ? 'Not started' : 'Done';
    const id = many ? `${slugOf(head.particular)}--${slugOf(head.engagementId)}` : slugOf(head.particular);
    out.push({
      group: 'Obligations',
      title: head.particular,
      meta: [head.compliance, head.frequency].filter(Boolean).join(' · '),
      href: `/app/client/compliances/obligations/${encodeURIComponent(id)}`,
      reg: regLabelOf(head.compliance, head.authority),
      status,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Document hits: the caller's own files by name. Documents carry no regulator or status. */
export function documentHits(docs: Array<{ id: string; fileName: string }>, q: string, limit = 12): SearchHit[] {
  return docs
    .filter((d) => matches(q, d.fileName))
    .slice(0, limit)
    .map((d) => ({ group: 'Documents' as const, title: d.fileName, href: `/app/client/documents?doc=d-${encodeURIComponent(d.id)}` }));
}

/** True when a hit passes the Regulator and Status chips. An empty chip passes everything. */
export function hitPasses(hit: Pick<SearchHit, 'reg' | 'status'>, reg: string, status: string): boolean {
  return (!reg || hit.reg === reg) && (!status || hit.status === status);
}
