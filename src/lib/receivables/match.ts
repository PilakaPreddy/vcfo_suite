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
 *
 * A foreign credit (currency USD with its foreign amount) is first matched on the foreign amount
 * against open invoices raised in the same currency: equal to the cent is a sure match, and up
 * to the bank-charge tolerance short (the larger of USD 50 and 2%) asks to confirm. The INR rules
 * above still run after that, so a foreign credit can also match on the rupees credited.
 */

export type CreditInput = {
  payer: string;
  inrAmount: number;
  /** The credit's currency; blank or INR means a rupee credit. */
  currency?: string | null;
  /** The foreign amount, for a foreign credit. */
  fcAmount?: number | null;
};
export type MatchResult = {
  status: 'auto' | 'to_confirm' | 'unmatched';
  invoiceIds: string[];
  /** A short plain reason, shown under the suggestion. */
  note: string;
};

type Inv = Pick<SheetInvoice, 'id' | 'clientName' | 'amountInr' | 'dueDate' | 'status'> & {
  /** The invoice currency; missing means INR. */
  currency?: string | null;
  /** The invoiced foreign amount, for a foreign invoice. */
  fcAmount?: number | null;
};

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

/** Foreign credits: up to this many units short counts as bank charges. */
export const FC_CHARGE_MAX = 50;
/** Foreign credits: or up to this share of the invoice, whichever is larger. */
export const FC_CHARGE_SHARE = 0.02;
const FC_EXACT = 0.01;

function upper(c: string | null | undefined): string {
  return (c ?? '').trim().toUpperCase() || 'INR';
}

/** How a foreign amount received fits a foreign amount invoiced. Overpayments are not charges. */
export function fcAmountFit(received: number, due: number): 'exact' | 'charges' | null {
  if (!(received > 0) || !(due > 0)) return null;
  if (within(received, due, FC_EXACT)) return 'exact';
  const tol = Math.max(FC_CHARGE_MAX, due * FC_CHARGE_SHARE);
  if (received < due && due - received <= tol) return 'charges';
  return null;
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const fc = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** The foreign-amount match within one client's open invoices, or null to fall through to the INR rules. */
function matchForeign(credit: CreditInput, mine: Inv[], client: string): MatchResult | null {
  const cur = upper(credit.currency);
  const amount = Number(credit.fcAmount);
  const same = mine.filter((i) => upper(i.currency) === cur && Number(i.fcAmount) > 0);
  if (!same.length) return null;
  const exact = same.filter((i) => fcAmountFit(amount, Number(i.fcAmount)) === 'exact');
  if (exact.length === 1) return { status: 'auto', invoiceIds: [exact[0].id], note: `Payer and ${cur} amount match.` };
  if (exact.length > 1) return { status: 'to_confirm', invoiceIds: [exact[0].id], note: `Several invoices of this client are for ${cur} ${fc.format(amount)}; the oldest is suggested.` };
  const all = same.reduce((a, i) => a + Number(i.fcAmount), 0);
  if (same.length > 1 && fcAmountFit(amount, all) === 'exact') return { status: 'auto', invoiceIds: same.map((i) => i.id), note: `Pays all ${same.length} open ${cur} invoices of ${client}.` };
  for (const i of same) {
    if (fcAmountFit(amount, Number(i.fcAmount)) === 'charges') {
      return { status: 'to_confirm', invoiceIds: [i.id], note: `Payer matches; ${cur} ${fc.format(Number(i.fcAmount) - amount)} short, likely bank charges.` };
    }
  }
  if (same.length > 1 && fcAmountFit(amount, all) === 'charges') return { status: 'to_confirm', invoiceIds: same.map((i) => i.id), note: `Close to all ${same.length} open ${cur} invoices of ${client} together, less bank charges.` };
  return null;
}

export function matchCredit(credit: CreditInput, invoices: Inv[], aliases: Record<string, string[]> = {}): MatchResult {
  const open = invoices.filter((i) => i.status === 'open');
  const scored = open.map((i) => ({ i, s: payerScore(credit.payer, i.clientName, aliases[i.clientName] ?? []) }));
  const top = Math.max(0, ...scored.map((x) => x.s));
  const byPayer = top ? scored.filter((x) => x.s === top).map((x) => x.i) : [];
  const clients = [...new Set(byPayer.map((i) => i.clientName))];

  const foreign = upper(credit.currency) !== 'INR' && Number(credit.fcAmount) > 0;

  if (clients.length === 1) {
    const mine = byPayer.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (foreign) {
      const hit = matchForeign(credit, mine, clients[0]);
      if (hit) return hit;
    }
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
  if (foreign) {
    const cur = upper(credit.currency);
    const fcExact = pool.filter((i) => upper(i.currency) === cur && fcAmountFit(Number(credit.fcAmount), Number(i.fcAmount)) === 'exact');
    if (fcExact.length === 1) return { status: 'to_confirm', invoiceIds: [fcExact[0].id], note: `Only the ${cur} amount matches; the payer name is different.` };
  }
  const exactAny = pool.filter((i) => amountFit(credit.inrAmount, i.amountInr) === 'exact');
  if (exactAny.length === 1) return { status: 'to_confirm', invoiceIds: [exactAny[0].id], note: 'Only the amount matches; the payer name is different.' };
  return { status: 'unmatched', invoiceIds: [], note: 'No open invoice fits this payer and amount.' };
}
