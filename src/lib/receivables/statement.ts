import { addDaysIso, monthStart } from './dates';
import type { SheetInvoice } from './model';

/**
 * RECEIVABLES STATEMENT OF ACCOUNT (Phase 10, docs/specs/receivables/PLAN.md): one client's
 * account for a period, built from invoice rows (the manager's live draft, or the partner's own
 * rows of the latest published version). Pure: the routes and pages load the rows.
 *
 *   Opening balance   the invoices dated before `from` that were still open on `from`
 *   + Invoiced        the invoices dated from `from` to `to`
 *   − Received        the invoices fully received from `from` to `to`
 *   = Closing balance the invoices dated up to `to` that were still open after `to`
 *
 * An invoice's date is its invoice date, or the first day of its invoice month when the row has
 * no invoice date. Each line carries the invoice's open balance (`amountInr`). A part payment
 * lowers that balance on the day it is recorded, and its date is not kept on the row, so a part
 * payment counts as received before the period; the line shows it as "part paid". A final
 * receipt settles the balance on its paid-on date; the INR actually credited (after TDS or
 * exchange differences) is shown beside it but the balance it clears is what the totals use, so
 * the four totals always reconcile.
 */

export type StatementSourceRow = Pick<
  SheetInvoice,
  'id' | 'clientName' | 'invoiceNo' | 'invoiceMonth' | 'dueDate' | 'amountInr' | 'status' | 'paidOn' | 'paidAmount' | 'partPaid'
> &
  Partial<Pick<SheetInvoice, 'currency' | 'fcAmount' | 'invoiceDate'>>;

export type StatementLine = {
  id: string;
  clientName: string;
  invoiceNo: string | null;
  invoiceDate: string;
  dueDate: string;
  /** opening: dated before the period and open on its first day; invoiced: dated in the period. */
  kind: 'opening' | 'invoiced';
  /** The open balance the line carries into the statement. */
  amountInr: number;
  /** Part payments recorded before the final receipt (already off `amountInr`). */
  partPaid: number;
  /** The paid-on date when the invoice was fully received in the period. */
  receivedOn: string | null;
  /** The balance that receipt cleared (equals `amountInr`), 0 when not received in the period. */
  receivedInr: number;
  /** The INR actually credited by that receipt, when known. */
  creditedInr: number | null;
  /** The balance still open after `to`. */
  closingInr: number;
  /** Days past due on `to` for a line still open then; null otherwise. */
  daysOverdue: number | null;
  currency: string;
  fcAmount: number | null;
};

export type StatementTotal = { count: number; inr: number };

export type Statement = {
  /** The client the statement is for; null means every client of the rows. */
  client: string | null;
  from: string;
  to: string;
  /** Every client name in the source rows, for the picker. */
  clients: string[];
  opening: StatementTotal;
  invoiced: StatementTotal;
  received: StatementTotal;
  closing: StatementTotal;
  /** Every line, by invoice date then due date. */
  lines: StatementLine[];
  /** The lines received in the period, by paid-on date. */
  receipts: StatementLine[];
};

export type StatementQuery = { client: string | null; from: string; to: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** The longest period a statement covers: a little over three years. */
export const STATEMENT_MAX_DAYS = 1100;

const round2 = (n: number) => Math.round(n * 100) / 100;

function validIso(s: unknown): s is string {
  return typeof s === 'string' && ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
}

/** The default period: from the first day of the month three months back, to today. */
export function defaultStatementPeriod(today: string): { from: string; to: string } {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 3);
  return { from: monthStart(d.toISOString().slice(0, 10)), to: today };
}

/**
 * Reads `client`, `from` and `to` from a query string. A missing date takes the default period;
 * a bad one, `from` after `to`, or a period longer than STATEMENT_MAX_DAYS is an error code.
 */
export function parseStatementQuery(
  q: { get(name: string): string | null },
  today: string,
): { ok: true; query: StatementQuery } | { ok: false; error: 'from' | 'to' | 'period' } {
  const def = defaultStatementPeriod(today);
  const rawFrom = q.get('from')?.trim() || def.from;
  const rawTo = q.get('to')?.trim() || def.to;
  if (!validIso(rawFrom)) return { ok: false, error: 'from' };
  if (!validIso(rawTo)) return { ok: false, error: 'to' };
  if (rawFrom > rawTo || addDaysIso(rawFrom, STATEMENT_MAX_DAYS) < rawTo) return { ok: false, error: 'period' };
  const client = q.get('client')?.trim().slice(0, 200) || null;
  return { ok: true, query: { client, from: rawFrom, to: rawTo } };
}

/** The date the statement files an invoice under. */
export function statementDate(r: Pick<StatementSourceRow, 'invoiceDate' | 'invoiceMonth'>): string {
  return (r.invoiceDate || r.invoiceMonth).slice(0, 10);
}

export function buildStatement(rows: readonly StatementSourceRow[], query: StatementQuery): Statement {
  const { from, to } = query;
  const clients = [...new Set(rows.map((r) => r.clientName))].sort((a, b) => a.localeCompare(b));
  // An unknown client name gives an empty statement, never everybody's.
  const client = query.client || null;
  const mine = client ? rows.filter((r) => r.clientName === client) : rows;

  const lines: StatementLine[] = [];
  for (const r of mine) {
    const date = statementDate(r);
    if (date > to) continue;
    const received = r.status === 'received';
    // A received row with no date counts as received long ago.
    const paidOn = received ? (r.paidOn ?? '0000-00-00') : null;
    const openOnFrom = !received || paidOn! >= from;
    const kind: StatementLine['kind'] | null = date < from ? (openOnFrom ? 'opening' : null) : 'invoiced';
    if (!kind) continue;
    const balance = round2(Number(r.amountInr) || 0);
    const receivedIn = received && paidOn! >= from && paidOn! <= to;
    const openAfter = !received || paidOn! > to;
    const overdue = openAfter ? Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${r.dueDate}T00:00:00Z`)) / 86_400_000) : null;
    lines.push({
      id: r.id,
      clientName: r.clientName,
      invoiceNo: r.invoiceNo,
      invoiceDate: date,
      dueDate: r.dueDate,
      kind,
      amountInr: balance,
      partPaid: round2(Number(r.partPaid) || 0),
      receivedOn: receivedIn ? r.paidOn : null,
      receivedInr: receivedIn ? balance : 0,
      creditedInr: receivedIn && r.paidAmount !== null && r.paidAmount !== undefined ? round2(r.paidAmount) : null,
      closingInr: openAfter ? balance : 0,
      daysOverdue: overdue !== null && overdue > 0 ? overdue : null,
      currency: (r.currency ?? 'INR').toUpperCase() || 'INR',
      fcAmount: r.fcAmount ?? null,
    });
  }
  lines.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.dueDate.localeCompare(b.dueDate) || a.clientName.localeCompare(b.clientName));

  const total = (list: StatementLine[], pick: (l: StatementLine) => number): StatementTotal => ({
    count: list.length,
    inr: round2(list.reduce((s, l) => s + pick(l), 0)),
  });
  const receipts = lines.filter((l) => l.receivedOn).sort((a, b) => (a.receivedOn ?? '').localeCompare(b.receivedOn ?? ''));
  return {
    client,
    from,
    to,
    clients,
    opening: total(
      lines.filter((l) => l.kind === 'opening'),
      (l) => l.amountInr,
    ),
    invoiced: total(
      lines.filter((l) => l.kind === 'invoiced'),
      (l) => l.amountInr,
    ),
    received: total(receipts, (l) => l.receivedInr),
    closing: total(
      lines.filter((l) => l.closingInr > 0),
      (l) => l.closingInr,
    ),
    lines,
    receipts,
  };
}

/** "Statement Duravant 01-Aug-26 to 03-Nov-26.xlsx" style file name, safe for a header. */
export function statementFileName(orgOrClient: string, from: string, to: string): string {
  return `Statement ${orgOrClient} ${from} to ${to}.xlsx`.replace(/[^\w .-]/g, '');
}
