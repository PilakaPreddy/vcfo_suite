/**
 * RECEIVABLES FOREIGN EXCHANGE — the rupee figures for an invoice raised in a foreign currency
 * (docs/specs/receivables/PLAN.md, Phase 9).
 *
 * An invoice is in INR or in a foreign currency (today only USD). A foreign invoice carries its
 * foreign amount (`fcAmount`) and the rate on the invoice date (`invoiceRate`); `amountInr` is the
 * INR booked at that rate. Every INR figure here is rounded to 2 decimals, and every function
 * accepts missing or nonsensical inputs and falls back instead of throwing.
 */

export type FxInput = {
  currency: string;
  fcAmount: number | null;
  invoiceRate: number | null;
  /** The INR booked at the invoice-date rate. */
  amountInr: number;
};

export type FxChange = {
  /** The foreign amount at today's rate. */
  inrToday: number;
  /** INR today minus booked INR: positive is a gain, negative a loss. */
  changeInr: number;
  /** The change as a percentage of booked INR, 2 decimals. */
  changePct: number;
};

export type RealisedFxInput = {
  fcAmount: number | null;
  invoiceRate: number | null;
  /** The foreign amount that actually arrived. */
  receivedFc: number | null;
  /** The INR the bank credited for it. */
  receivedInr: number | null;
};

export type RealisedFx = {
  /** INR credited per unit of foreign currency received. */
  effectiveRate: number;
  /** The received foreign amount at the invoice-date rate. */
  bookedInrForReceived: number;
  /** INR credited minus booked INR for the amount received: positive is a gain. */
  realisedInr: number;
  /** Foreign amount invoiced but not received, never negative. */
  bankChargesFc: number;
  /** That shortfall at the effective rate. */
  bankChargesInr: number;
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function positive(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function num(n: number | null | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/** True for any currency other than INR. A blank currency reads as INR. */
export function isForeign(inv: Pick<FxInput, 'currency'>): boolean {
  const c = (inv.currency ?? '').trim().toUpperCase();
  return c !== '' && c !== 'INR';
}

/** The INR booked on the invoice: foreign amount times invoice rate when both are known, else `amountInr`. */
export function bookedInr(inv: FxInput): number {
  if (isForeign(inv) && positive(inv.fcAmount) && positive(inv.invoiceRate)) return round2(inv.fcAmount * inv.invoiceRate);
  return round2(num(inv.amountInr));
}

/** The invoice in INR at `rate`. An INR invoice, or a foreign one without a usable amount or rate, keeps its booked INR. */
export function inrAtRate(inv: FxInput, rate: number | null | undefined): number {
  if (isForeign(inv) && positive(inv.fcAmount) && positive(rate)) return round2(inv.fcAmount * rate);
  return bookedInr(inv);
}

/** The unrealised change on an open foreign invoice at today's rate; null for INR or when a rate or amount is missing. */
export function fxChange(inv: FxInput, todayRate: number | null | undefined): FxChange | null {
  if (!isForeign(inv) || !positive(inv.fcAmount) || !positive(todayRate)) return null;
  const booked = bookedInr(inv);
  const inrToday = round2(inv.fcAmount * todayRate);
  const changeInr = round2(inrToday - booked);
  const changePct = booked > 0 ? round2((changeInr / booked) * 100) : 0;
  return { inrToday, changeInr, changePct };
}

/**
 * The realised result on receipt. Null when nothing was received or the invoice rate is unknown,
 * since neither the effective rate nor the gain can be worked out then. A missing invoiced amount
 * means no bank charges can be shown, so they read as zero.
 */
export function realisedFx(input: RealisedFxInput): RealisedFx | null {
  const { fcAmount, invoiceRate, receivedFc, receivedInr } = input;
  if (!positive(receivedFc) || !positive(receivedInr) || !positive(invoiceRate)) return null;
  const effectiveRate = Math.round((receivedInr / receivedFc) * 1e6) / 1e6;
  const bookedInrForReceived = round2(receivedFc * invoiceRate);
  const realisedInr = round2(receivedInr - bookedInrForReceived);
  const bankChargesFc = positive(fcAmount) ? round2(Math.max(0, fcAmount - receivedFc)) : 0;
  const bankChargesInr = round2(bankChargesFc * effectiveRate);
  return { effectiveRate, bookedInrForReceived, realisedInr, bankChargesFc, bankChargesInr };
}
