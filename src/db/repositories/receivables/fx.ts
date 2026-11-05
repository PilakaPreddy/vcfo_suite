import 'server-only';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/db/client';
import { fxRates } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { addDaysIso, todayIst } from '@/lib/receivables/dates';
import type { FetchedRate } from '@/lib/receivables/fx-rate-source';
import type { FxRateDto, FxSource, RateInForceDto } from '@/lib/receivables/reports-wire';
import { ISO_DATE, invalid, logChange, num, scopedSheet } from './shared';

/**
 * RECEIVABLES FX RATES (Phase 9) — the daily reference rates, INR per one unit of a currency.
 *
 * Rates are firm-wide reference data, not part of any one sheet: the 14:30 IST job stores the
 * fetched rate (`fbil`, or `ecb` from the Frankfurter fallback) and a manager may store a
 * `manual` override for a day, which wins over the fetched rows of that day. Reading the rates
 * needs no tenant scope, so the reads used by jobs are system functions; listing and overriding
 * from the Reports tab go through the caller's own sheet (its manager or a firm-wide admin), and
 * the override is logged on that sheet's change trail.
 */

export type FxRateRow = typeof fxRates.$inferSelect;

const PRECEDENCE: Record<string, number> = { manual: 0, fbil: 1, ecb: 2 };
const CURRENCY = /^[A-Z]{3}$/;
/** How far back a rate may sit before it no longer counts for a day (a long weekend plus holidays). */
const LOOKBACK_DAYS = 10;

/** Of the rows for the latest day among `rows`, the one in force: manual, then FBIL, then ECB. */
export function pickRateInForce(rows: Array<Pick<FxRateRow, 'currency' | 'rateDate' | 'rate' | 'source'>>): RateInForceDto | null {
  let best: (typeof rows)[number] | null = null;
  for (const r of rows) {
    if (num(r.rate) === null) continue;
    if (!best) {
      best = r;
      continue;
    }
    const day = String(r.rateDate).localeCompare(String(best.rateDate));
    if (day > 0 || (day === 0 && (PRECEDENCE[r.source] ?? 9) < (PRECEDENCE[best.source] ?? 9))) best = r;
  }
  if (!best) return null;
  return { currency: best.currency, rateDate: String(best.rateDate), rate: num(best.rate)!, source: best.source as FxSource };
}

function cleanCurrency(v: unknown): string {
  const c = typeof v === 'string' ? v.trim().toUpperCase() : '';
  if (!CURRENCY.test(c) || c === 'INR') throw invalid('currency');
  return c;
}

/**
 * SYSTEM (no AuthContext): the rate in force on `date` (default today, IST), falling back to
 * the latest earlier day within the lookback window. Null when nothing has been stored.
 */
export async function systemRateFor(currency: string, date: string = todayIst()): Promise<RateInForceDto | null> {
  const c = (currency ?? '').trim().toUpperCase();
  if (!CURRENCY.test(c) || !ISO_DATE.test(date)) return null;
  const rows = await db
    .select({ currency: fxRates.currency, rateDate: fxRates.rateDate, rate: fxRates.rate, source: fxRates.source })
    .from(fxRates)
    .where(and(eq(fxRates.currency, c), lte(fxRates.rateDate, date), gte(fxRates.rateDate, addDaysIso(date, -LOOKBACK_DAYS))))
    .orderBy(desc(fxRates.rateDate))
    .limit(9);
  return pickRateInForce(rows);
}

/** SYSTEM (no AuthContext): the latest rate in force for `currency`, however old. */
export async function systemLatestRate(currency: string): Promise<RateInForceDto | null> {
  const c = (currency ?? '').trim().toUpperCase();
  if (!CURRENCY.test(c)) return null;
  const rows = await db
    .select({ currency: fxRates.currency, rateDate: fxRates.rateDate, rate: fxRates.rate, source: fxRates.source })
    .from(fxRates)
    .where(eq(fxRates.currency, c))
    .orderBy(desc(fxRates.rateDate))
    .limit(3);
  return pickRateInForce(rows);
}

/** SYSTEM (no AuthContext): the job stores a fetched rate, replacing the same source's row for that day. */
export async function systemUpsertFetchedRate(rate: FetchedRate): Promise<void> {
  const currency = cleanCurrency(rate.currency);
  if (!ISO_DATE.test(rate.rateDate) || !(rate.rate > 0) || (rate.source !== 'fbil' && rate.source !== 'ecb')) throw invalid('rate');
  const value = rate.rate.toFixed(6);
  await db
    .insert(fxRates)
    .values({ currency, rateDate: rate.rateDate, rate: value, source: rate.source })
    .onConflictDoUpdate({ target: [fxRates.currency, fxRates.rateDate, fxRates.source], set: { rate: value, updatedAt: new Date() } });
}

function toDto(r: FxRateRow): FxRateDto {
  return {
    currency: r.currency,
    rateDate: String(r.rateDate),
    rate: num(r.rate) ?? 0,
    source: r.source as FxSource,
    note: r.note,
    updatedAt: (r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt)).toISOString(),
  };
}

/** The stored rates of the last `days` days, newest first, every source shown. */
export async function listRates(ctx: AuthContext, sheetId: string, days = 30): Promise<FxRateDto[]> {
  await scopedSheet(ctx, sheetId);
  const span = Math.max(1, Math.min(366, Math.floor(Number(days)) || 30));
  const rows = await db
    .select()
    .from(fxRates)
    .where(gte(fxRates.rateDate, addDaysIso(todayIst(), -span)))
    .orderBy(desc(fxRates.rateDate), fxRates.currency, fxRates.source)
    .limit(span * 6);
  return rows.map(toDto);
}

/**
 * The manager's override for one day. It wins over the fetched rate of that day everywhere,
 * so it is allowed only up to today and is logged on the manager's sheet.
 */
export async function setManualRate(
  ctx: AuthContext,
  sheetId: string,
  input: { currency: string; rateDate: string; rate: number; note?: string | null },
): Promise<FxRateDto> {
  const sheet = await scopedSheet(ctx, sheetId);
  const currency = cleanCurrency(input.currency);
  const rateDate = typeof input.rateDate === 'string' && ISO_DATE.test(input.rateDate) && !Number.isNaN(Date.parse(`${input.rateDate}T00:00:00Z`)) ? input.rateDate : null;
  if (!rateDate || rateDate > todayIst()) throw invalid('rate_date');
  const rate = Number(input.rate);
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 100_000) throw invalid('rate');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > 200) throw invalid('note');
  const value = rate.toFixed(6);
  const [row] = await db
    .insert(fxRates)
    .values({ currency, rateDate, rate: value, source: 'manual', note, setBy: ctx.userId })
    .onConflictDoUpdate({ target: [fxRates.currency, fxRates.rateDate, fxRates.source], set: { rate: value, note, setBy: ctx.userId, updatedAt: new Date() } })
    .returning();
  await logChange({ sheetId: sheet.id, invoiceId: null, actorId: ctx.userId, summary: `${currency} rate for ${rateDate} set to ₹${value}`, field: 'fxRate', after: value, affectsPage: false });
  return toDto(row);
}
