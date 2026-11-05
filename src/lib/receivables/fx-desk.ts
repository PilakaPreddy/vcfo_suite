/**
 * RECEIVABLES FOREX DESK — the pure figures behind the FX tab (docs/specs/receivables/PLAN.md,
 * Phase 10): exposure by currency, hedge cover from forward contracts, a what-if on the rupee,
 * the bank's spread on each foreign receipt, and rate trend statistics.
 *
 * Rates are INR per one unit of the foreign currency. Money is rounded to 2 decimals, rates to 4
 * (6 where they are stored). Nothing here throws: missing or nonsensical inputs are skipped or
 * read as null, so one bad row never blanks the tab.
 */
import { round2 } from './fx';
import { addDaysIso } from './dates';
import { FOREIGN_CURRENCY_CODES, sortCurrencies } from './currencies';

export type DeskInvoice = {
  id: string;
  clientName: string;
  invoiceNo: string | null;
  currency: string;
  status: 'open' | 'received';
  /** The open foreign amount (for a received invoice, what was invoiced). */
  fcAmount: number | null;
  /** The booked rate. */
  fxRate: number | null;
  /** The open INR (for an open foreign invoice, the booked INR of the open amount). */
  amountInr: number;
  dueDate: string;
  paidOn: string | null;
  /** The foreign amount that arrived. */
  receivedFc: number | null;
  /** The INR the bank credited. */
  paidAmount: number | null;
  /** Who credited the money, when known (the bank feed or the forward's bank). */
  bank?: string | null;
};

export type DeskForward = {
  id: string;
  currency: string;
  bank: string;
  contractNo: string | null;
  amountFc: number;
  forwardRate: number;
  bookedOn: string;
  maturityOn: string;
  utilisedFc: number;
  status: 'open' | 'closed' | 'cancelled';
  note: string;
};

export type RatePoint = { date: string; rate: number };

export type ExposureRow = {
  currency: string;
  invoices: number;
  openFc: number;
  bookedInr: number;
  /** Today's rate in force; null before the first rate. */
  spotRate: number | null;
  inrToday: number | null;
  changeInr: number | null;
  changePct: number | null;
};

export type HedgeRow = {
  currency: string;
  exposureFc: number;
  /** The unutilised amount of the open forwards. */
  hedgedFc: number;
  unhedgedFc: number;
  /** Hedged as a share of the exposure, 1 decimal; may pass 100 when over-hedged. Null with no exposure. */
  coverPct: number | null;
  /** Average forward rate, weighted by unutilised amount; null with no open forward. */
  weightedForwardRate: number | null;
  spotRate: number | null;
  /** Unutilised amount times (forward rate minus spot): positive means the forwards beat spot. */
  forwardVsSpotInr: number | null;
  openForwards: number;
  /** Open forwards whose maturity date has passed. */
  maturedForwards: number;
};

export type WhatIfMove = { key: string; label: string; kind: 'rupee' | 'pct'; delta: number };

export type WhatIfCell = {
  key: string;
  /** The rate after the move; null when the move would take it to zero or below. */
  rate: number | null;
  /** All open exposure at the moved rate. */
  inr: number | null;
  /** Against today's INR value. */
  changeVsToday: number | null;
  /** Unhedged exposure at the moved rate plus the hedged part at the forward rate. */
  inrNetOfHedges: number | null;
};

export type WhatIfRow = { currency: string; openFc: number; spotRate: number | null; inrToday: number | null; cells: WhatIfCell[] };

export type SpreadRow = {
  id: string;
  clientName: string;
  invoiceNo: string | null;
  currency: string;
  paidOn: string;
  bank: string;
  receivedFc: number;
  receivedInr: number;
  /** INR credited per unit received. */
  effectiveRate: number;
  /** The reference rate in force on the paid date; null when none was stored. */
  referenceRate: number | null;
  /** Reference minus effective, per unit: what the bank kept. Positive is a cost. */
  spreadPerUnit: number | null;
  spreadPct: number | null;
  costInr: number | null;
};

export type SpreadSummaryRow = {
  bank: string;
  currency: string;
  receipts: number;
  receivedFc: number;
  /** Weighted by the foreign amount received. */
  avgSpreadPerUnit: number;
  avgSpreadPct: number;
  costInr: number;
};

export type TrendWindow = { days: number; points: number; first: number | null; min: number | null; max: number | null; avg: number | null; change: number | null; changePct: number | null };

export type RateTrend = { last: RatePoint | null; d30: TrendWindow; d90: TrendWindow };

/** The moves of the what-if table, in column order. */
export const WHAT_IF_MOVES: readonly WhatIfMove[] = [
  { key: 'r-3', label: '−₹3', kind: 'rupee', delta: -3 },
  { key: 'r-2', label: '−₹2', kind: 'rupee', delta: -2 },
  { key: 'r-1', label: '−₹1', kind: 'rupee', delta: -1 },
  { key: 'r+1', label: '+₹1', kind: 'rupee', delta: 1 },
  { key: 'r+2', label: '+₹2', kind: 'rupee', delta: 2 },
  { key: 'r+3', label: '+₹3', kind: 'rupee', delta: 3 },
  { key: 'p-2', label: '−2%', kind: 'pct', delta: -2 },
  { key: 'p-1', label: '−1%', kind: 'pct', delta: -1 },
  { key: 'p+1', label: '+1%', kind: 'pct', delta: 1 },
  { key: 'p+2', label: '+2%', kind: 'pct', delta: 2 },
];

function pos(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function upper(c: string | null | undefined): string {
  return (c ?? '').trim().toUpperCase() || 'INR';
}

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const pct = (part: number, whole: number) => (whole > 0 ? round2((part / whole) * 100) : null);

/** Open foreign invoices with a usable foreign amount, grouped by currency in list order. */
function openForeignByCurrency(invoices: DeskInvoice[]): Map<string, DeskInvoice[]> {
  const map = new Map<string, DeskInvoice[]>();
  for (const i of invoices) {
    const c = upper(i.currency);
    if (c === 'INR' || i.status !== 'open' || !pos(i.fcAmount)) continue;
    map.set(c, [...(map.get(c) ?? []), i]);
  }
  return new Map(sortCurrencies(map.keys()).map((c) => [c, map.get(c)!]));
}

/** What is still to come in each foreign currency, at the booked rate and at today's. */
export function exposureByCurrency(invoices: DeskInvoice[], spot: Record<string, number | null | undefined>): ExposureRow[] {
  const rows: ExposureRow[] = [];
  for (const [currency, list] of openForeignByCurrency(invoices)) {
    const openFc = round2(list.reduce((a, i) => a + (i.fcAmount ?? 0), 0));
    const bookedInr = round2(list.reduce((a, i) => a + (pos(i.fxRate) ? (i.fcAmount ?? 0) * i.fxRate : i.amountInr), 0));
    const rate = spot[currency];
    const inrToday = pos(rate) ? round2(openFc * rate) : null;
    const changeInr = inrToday === null ? null : round2(inrToday - bookedInr);
    rows.push({ currency, invoices: list.length, openFc, bookedInr, spotRate: pos(rate) ? rate : null, inrToday, changeInr, changePct: changeInr === null ? null : pct(changeInr, bookedInr) });
  }
  return rows;
}

/** The unutilised foreign amount of a forward, never negative. */
export function unutilised(f: Pick<DeskForward, 'amountFc' | 'utilisedFc'>): number {
  return round2(Math.max(0, (f.amountFc ?? 0) - (f.utilisedFc ?? 0)));
}

/**
 * Hedge cover per currency: every currency with exposure or an open forward. Only open forwards
 * count; closed and cancelled ones are history.
 */
export function hedgeCover(exposure: ExposureRow[], forwards: DeskForward[], spot: Record<string, number | null | undefined>, today: string): HedgeRow[] {
  const open = forwards.filter((f) => f.status === 'open' && unutilised(f) > 0 && pos(f.forwardRate));
  const currencies = sortCurrencies([...exposure.map((e) => e.currency), ...open.map((f) => upper(f.currency))]);
  return currencies.map((currency) => {
    const exposureFc = exposure.find((e) => e.currency === currency)?.openFc ?? 0;
    const mine = open.filter((f) => upper(f.currency) === currency);
    const hedgedFc = round2(mine.reduce((a, f) => a + unutilised(f), 0));
    const weighted = hedgedFc > 0 ? round6(mine.reduce((a, f) => a + unutilised(f) * f.forwardRate, 0) / hedgedFc) : null;
    const rate = spot[currency];
    return {
      currency,
      exposureFc,
      hedgedFc,
      unhedgedFc: round2(Math.max(0, exposureFc - hedgedFc)),
      coverPct: exposureFc > 0 ? Math.round((hedgedFc / exposureFc) * 1000) / 10 : null,
      weightedForwardRate: weighted,
      spotRate: pos(rate) ? rate : null,
      forwardVsSpotInr: weighted !== null && pos(rate) ? round2(hedgedFc * (weighted - rate)) : null,
      openForwards: mine.length,
      maturedForwards: mine.filter((f) => f.maturityOn < today).length,
    };
  });
}

/** The rate after a move; null when it would not stay above zero. */
export function movedRate(spot: number, move: Pick<WhatIfMove, 'kind' | 'delta'>): number | null {
  const r = move.kind === 'rupee' ? spot + move.delta : spot * (1 + move.delta / 100);
  return r > 0 ? round6(r) : null;
}

/** The INR value of the open exposure of each currency if the rupee moves by each of the moves. */
export function whatIf(exposure: ExposureRow[], hedges: HedgeRow[], moves: readonly WhatIfMove[] = WHAT_IF_MOVES): WhatIfRow[] {
  return exposure.map((e) => {
    const h = hedges.find((x) => x.currency === e.currency);
    const hedged = Math.min(h?.hedgedFc ?? 0, e.openFc);
    const fwd = h?.weightedForwardRate ?? null;
    const cells = moves.map((m): WhatIfCell => {
      const rate = e.spotRate === null ? null : movedRate(e.spotRate, m);
      if (rate === null) return { key: m.key, rate: null, inr: null, changeVsToday: null, inrNetOfHedges: null };
      const inr = round2(e.openFc * rate);
      const net = fwd !== null && hedged > 0 ? round2((e.openFc - hedged) * rate + hedged * fwd) : inr;
      return { key: m.key, rate: round4(rate), inr, changeVsToday: e.inrToday === null ? null : round2(inr - e.inrToday), inrNetOfHedges: net };
    });
    return { currency: e.currency, openFc: e.openFc, spotRate: e.spotRate, inrToday: e.inrToday, cells };
  });
}

/**
 * The rate in force on `date` from a series sorted or not: the latest point on or before it,
 * no more than `lookbackDays` earlier. Null when there is none.
 */
export function rateOn(points: RatePoint[], date: string, lookbackDays = 10): number | null {
  const floor = addDaysIso(date, -lookbackDays);
  let best: RatePoint | null = null;
  for (const p of points) {
    if (p.date > date || p.date < floor || !pos(p.rate)) continue;
    if (!best || p.date > best.date) best = p;
  }
  return best?.rate ?? null;
}

/**
 * The bank's spread on each received foreign invoice: the effective rate (INR credited over
 * foreign received) against the reference rate on the paid date. Invoices without the foreign
 * amount received, the INR credited or a paid date are skipped. Newest first.
 */
export function bankSpreads(invoices: DeskInvoice[], history: Record<string, RatePoint[]>): SpreadRow[] {
  const rows: SpreadRow[] = [];
  for (const i of invoices) {
    const currency = upper(i.currency);
    if (currency === 'INR' || i.status !== 'received' || !i.paidOn || !pos(i.receivedFc) || !pos(i.paidAmount)) continue;
    const effectiveRate = round6(i.paidAmount / i.receivedFc);
    const ref = rateOn(history[currency] ?? [], i.paidOn);
    const spread = ref === null ? null : round6(ref - effectiveRate);
    rows.push({
      id: i.id,
      clientName: i.clientName,
      invoiceNo: i.invoiceNo,
      currency,
      paidOn: i.paidOn,
      bank: (i.bank ?? '').trim() || 'Not recorded',
      receivedFc: i.receivedFc,
      receivedInr: i.paidAmount,
      effectiveRate,
      referenceRate: ref,
      spreadPerUnit: spread === null ? null : round4(spread),
      spreadPct: spread === null || ref === null ? null : round2((spread / ref) * 100),
      costInr: spread === null ? null : round2(spread * i.receivedFc),
    });
  }
  return rows.sort((a, b) => b.paidOn.localeCompare(a.paidOn));
}

/** The average spread per bank and currency, over the receipts that had a reference rate. */
export function spreadSummary(rows: SpreadRow[]): SpreadSummaryRow[] {
  const groups = new Map<string, SpreadRow[]>();
  for (const r of rows) {
    if (r.spreadPerUnit === null || r.referenceRate === null) continue;
    const key = `${r.bank}\u0000${r.currency}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: SpreadSummaryRow[] = [];
  for (const list of groups.values()) {
    const fc = list.reduce((a, r) => a + r.receivedFc, 0);
    const spread = list.reduce((a, r) => a + (r.spreadPerUnit ?? 0) * r.receivedFc, 0);
    const refWeighted = list.reduce((a, r) => a + (r.referenceRate ?? 0) * r.receivedFc, 0);
    out.push({
      bank: list[0].bank,
      currency: list[0].currency,
      receipts: list.length,
      receivedFc: round2(fc),
      avgSpreadPerUnit: fc > 0 ? round4(spread / fc) : 0,
      avgSpreadPct: refWeighted > 0 ? round2((spread / refWeighted) * 100) : 0,
      costInr: round2(list.reduce((a, r) => a + (r.costInr ?? 0), 0)),
    });
  }
  const order = (c: string) => (FOREIGN_CURRENCY_CODES.indexOf(c) + 1000) % 1000;
  return out.sort((a, b) => a.bank.localeCompare(b.bank) || order(a.currency) - order(b.currency));
}

function trendWindow(sorted: RatePoint[], today: string, days: number): TrendWindow {
  const from = addDaysIso(today, -days);
  const pts = sorted.filter((p) => p.date >= from && p.date <= today && pos(p.rate));
  if (!pts.length) return { days, points: 0, first: null, min: null, max: null, avg: null, change: null, changePct: null };
  const rates = pts.map((p) => p.rate);
  const first = rates[0];
  const last = rates[rates.length - 1];
  return {
    days,
    points: pts.length,
    first,
    min: Math.min(...rates),
    max: Math.max(...rates),
    avg: round4(rates.reduce((a, r) => a + r, 0) / rates.length),
    change: round4(last - first),
    changePct: round2(((last - first) / first) * 100),
  };
}

/** The latest rate and the 30 and 90 day minimum, maximum, average and change. */
export function rateTrend(points: RatePoint[], today: string): RateTrend {
  const sorted = points.filter((p) => pos(p.rate) && p.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  return { last: sorted.at(-1) ?? null, d30: trendWindow(sorted, today, 30), d90: trendWindow(sorted, today, 90) };
}

/** True when `rate` is at or beyond the alert's level in its direction. */
export function alertCrossed(alert: { direction: string; threshold: number }, rate: number | null | undefined): boolean {
  if (!pos(rate) || !pos(alert.threshold)) return false;
  return alert.direction === 'above' ? rate >= alert.threshold : alert.direction === 'below' ? rate <= alert.threshold : false;
}

/** An active alert fires once a day at most, on a day its level is crossed. */
export function shouldTrigger(alert: { active: boolean; direction: string; threshold: number; lastTriggeredOn: string | null }, rate: number | null | undefined, today: string): boolean {
  return alert.active && alert.lastTriggeredOn !== today && alertCrossed(alert, rate);
}
