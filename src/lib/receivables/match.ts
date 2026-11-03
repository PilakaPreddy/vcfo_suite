import type { SheetInvoice } from './model';

/**
 * RECEIVABLES CREDIT MATCHER — suggests which open invoices a bank credit pays.
 *
 * A credit is matched on two things: the payer name (the bank narration rarely carries an invoice
 * number) and the amount. Amounts rarely agree to the rupee: a USD receipt converts at the day's
 * rate, banks take charges, and Indian payers deduct TDS (10% under s.194J, 2% under s.194C).
 *
 *   auto        payer matches exactly one client and the amount equals one of its open invoices
 *               (or all of them together) within ₹1. Marked received without asking.
 *   to_confirm  payer matches and the amount is within the bank-charge or TDS tolerance, or the
 *               amount alone points at a single invoice. The manager confirms.
 *   unmatched   nothing credible. The manager picks an invoice or marks it "not a receipt".
 */

export type CreditInput = { payer: string; inrAmount: number };
export type MatchResult = {
  status: 'auto' | 'to_confirm' | 'unmatched';
  invoiceIds: string[];
  /** A short plain reason, shown under the suggestion. */
  note: string;
};

type Inv = Pick<SheetInvoice, 'id' | 'clientName' | 'amountInr' | 'dueDate' | 'status'>;

const LEGAL = new Set(['INC', 'LLC', 'LTD', 'LIMITED', 'PVT', 'PRIVATE', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'GMBH', 'PLC', 'LLP', 'THE', 'AND', 'OF', 'INDIA', 'SERVICES', 'SOLUTIONS', 'TECHNOLOGIES', 'TECHNOLOGY', 'SOFTWARE', 'GROUP', 'HOLDINGS']);

export function nameTokens(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !LEGAL.has(t));
}

/**
 * 2 when every distinctive word of the client name (or an alias) is in the payer, 1 when they only
 * share a 4+ letter word, 0 otherwise. A partial match counts only when no client matches fully,
 * so "ANSR COMPLY" picks ANSR Comply and not KH ANSR.
 */
export function payerScore(payer: string, clientName: string, aliases: string[] = []): 0 | 1 | 2 {
  const p = new Set(nameTokens(payer));
  const joined = nameTokens(payer).join('');
  let best: 0 | 1 | 2 = 0;
  for (const name of [clientName, ...aliases]) {
    const c = nameTokens(name);
    if (!c.length) continue;
    // "NETDOCUMENTS" in the narration against "Net Documents" in the sheet.
    if (c.every((t) => p.has(t)) || (c.join('').length >= 6 && joined.includes(c.join('')))) return 2;
    if (c.some((t) => t.length >= 4 && p.has(t))) best = 1;
  }
  return best;
}

const EXACT = 1;
const CHARGE_SHARE = 0.005;
const CHARGE_MIN = 5_000;
const TDS_RATES = [0.1, 0.02];

function within(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

function amountFit(received: number, due: number): 'exact' | 'charges' | 'tds' | null {
  if (within(received, due, EXACT)) return 'exact';
  const chargeTol = Math.max(CHARGE_MIN, due * CHARGE_SHARE);
  if (received < due && within(received, due, chargeTol)) return 'charges';
  if (TDS_RATES.some((r) => within(received, due * (1 - r), Math.max(EXACT, due * CHARGE_SHARE)))) return 'tds';
  return null;
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export function matchCredit(credit: CreditInput, invoices: Inv[], aliases: Record<string, string[]> = {}): MatchResult {
  const open = invoices.filter((i) => i.status === 'open');
  const scored = open.map((i) => ({ i, s: payerScore(credit.payer, i.clientName, aliases[i.clientName] ?? []) }));
  const top = Math.max(0, ...scored.map((x) => x.s));
  const byPayer = top ? scored.filter((x) => x.s === top).map((x) => x.i) : [];
  const clients = [...new Set(byPayer.map((i) => i.clientName))];

  if (clients.length === 1) {
    const mine = byPayer.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const exact = mine.filter((i) => amountFit(credit.inrAmount, i.amountInr) === 'exact');
    if (exact.length === 1) return { status: 'auto', invoiceIds: [exact[0].id], note: 'Payer and amount match.' };
    if (exact.length > 1) return { status: 'to_confirm', invoiceIds: [exact[0].id], note: 'Several invoices of this client have this amount; the oldest is suggested.' };
    const all = mine.reduce((a, i) => a + i.amountInr, 0);
    if (mine.length > 1 && amountFit(credit.inrAmount, all) === 'exact') return { status: 'auto', invoiceIds: mine.map((i) => i.id), note: `Pays all ${mine.length} open invoices of ${clients[0]}.` };
    for (const i of mine) {
      const fit = amountFit(credit.inrAmount, i.amountInr);
      if (fit) {
        const diff = i.amountInr - credit.inrAmount;
        const why = fit === 'tds' ? `₹${inr.format(diff)} short, which looks like TDS` : `₹${inr.format(Math.abs(diff))} ${diff > 0 ? 'short' : 'extra'}, likely bank charges or FX`;
        return { status: 'to_confirm', invoiceIds: [i.id], note: `Payer matches; ${why}.` };
      }
    }
    if (mine.length > 1 && amountFit(credit.inrAmount, all)) return { status: 'to_confirm', invoiceIds: mine.map((i) => i.id), note: `Close to all ${mine.length} open invoices of ${clients[0]} together.` };
    return { status: 'to_confirm', invoiceIds: [mine[0].id], note: 'Payer matches but the amount does not; check for a part payment.' };
  }

  const pool = clients.length > 1 ? byPayer : open;
  const exactAny = pool.filter((i) => amountFit(credit.inrAmount, i.amountInr) === 'exact');
  if (exactAny.length === 1) return { status: 'to_confirm', invoiceIds: [exactAny[0].id], note: 'Only the amount matches; the payer name is different.' };
  return { status: 'unmatched', invoiceIds: [], note: 'No open invoice fits this payer and amount.' };
}
