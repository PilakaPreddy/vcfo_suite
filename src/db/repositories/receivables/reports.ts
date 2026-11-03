import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { receivableInvoices } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { AGEING_BUCKETS, ageingSummary, daysToPayByClient } from '@/lib/receivables/ageing';
import { todayIst } from '@/lib/receivables/dates';
import { cashForecast } from '@/lib/receivables/forecast';
import { bookedInr, fxChange, isForeign, realisedFx, round2 } from '@/lib/receivables/fx';
import type { FxOpenRowDto, FxRealisedRowDto, RateInForceDto, ReportsDto, TdsRowDto } from '@/lib/receivables/reports-wire';
import { isDisputed, listFirasOfSheet } from './adjustments';
import { systemLatestRate, systemRateFor } from './fx';
import { num, scopedSheet, toInvoice, type InvoiceRow } from './shared';

/**
 * RECEIVABLES REPORTS (Phase 9) — everything the Reports tab shows, worked out from the live
 * invoices (the draft, not the published version): ageing, days to pay by client, the cash
 * forecast, FX gain or loss, TDS and FIRAs. Scoped like every other sheet read: the sheet's own
 * manager and the firm-wide admins only.
 */

async function rateToday(currency: string, today: string): Promise<RateInForceDto | null> {
  return (await systemRateFor(currency, today)) ?? (await systemLatestRate(currency));
}

export async function reportData(ctx: AuthContext, sheetId: string): Promise<ReportsDto> {
  const sheet = await scopedSheet(ctx, sheetId);
  const today = todayIst();
  const rows: InvoiceRow[] = await db
    .select()
    .from(receivableInvoices)
    .where(and(eq(receivableInvoices.sheetId, sheet.id), isNull(receivableInvoices.deletedAt)));

  const domain = rows.map((r) => ({ ...toInvoice(r), promisedOn: r.promisedOn ? String(r.promisedOn) : null, disputed: isDisputed(r) }));
  const ageing = ageingSummary(domain, today);

  // One rate per foreign currency on the sheet; USD is always looked up, for the rate card.
  const currencies = new Set(['USD']);
  for (const r of rows) if (isForeign({ currency: r.currency })) currencies.add(r.currency.trim().toUpperCase());
  const rates = new Map<string, RateInForceDto | null>();
  for (const c of currencies) rates.set(c, await rateToday(c, today));

  const open: FxOpenRowDto[] = [];
  const realised: FxRealisedRowDto[] = [];
  const tds: TdsRowDto[] = [];
  for (const r of rows) {
    const currency = (r.currency ?? 'INR').trim().toUpperCase() || 'INR';
    const fcAmount = num(r.fcAmount);
    const bookedRate = num(r.fxRate);
    const amountInr = num(r.amountInr) ?? 0;
    if (isForeign({ currency }) && r.status === 'open' && fcAmount !== null && fcAmount > 0) {
      const input = { currency, fcAmount, invoiceRate: bookedRate, amountInr };
      const change = fxChange(input, rates.get(currency)?.rate);
      open.push({
        id: r.id,
        clientName: r.clientName,
        invoiceNo: r.invoiceNo,
        dueDate: String(r.dueDate),
        currency,
        fcAmount,
        bookedRate,
        bookedInr: bookedInr(input),
        inrToday: change?.inrToday ?? null,
        changeInr: change?.changeInr ?? null,
        changePct: change?.changePct ?? null,
      });
    }
    if (isForeign({ currency }) && r.status === 'received') {
      const receivedFc = num(r.receivedFc);
      const receivedInr = num(r.paidAmount);
      const fx = realisedFx({ fcAmount, invoiceRate: bookedRate, receivedFc, receivedInr });
      realised.push({
        id: r.id,
        clientName: r.clientName,
        invoiceNo: r.invoiceNo,
        paidOn: r.paidOn ? String(r.paidOn) : null,
        currency,
        fcAmount,
        receivedFc,
        receivedInr,
        bookedRate,
        effectiveRate: fx?.effectiveRate ?? null,
        realisedInr: fx?.realisedInr ?? null,
        bankChargesFc: fx?.bankChargesFc ?? null,
        bankChargesInr: fx?.bankChargesInr ?? null,
      });
    }
    const tdsInr = num(r.tdsInr) ?? 0;
    if (r.status === 'received' && tdsInr > 0) {
      tds.push({
        id: r.id,
        clientName: r.clientName,
        invoiceNo: r.invoiceNo,
        paidOn: r.paidOn ? String(r.paidOn) : null,
        tdsInr,
        certificateOn: r.tdsCertificateOn ? String(r.tdsCertificateOn) : null,
        status: r.tdsCertificateOn ? 'received' : 'awaited',
      });
    }
  }
  open.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  realised.sort((a, b) => (b.paidOn ?? '').localeCompare(a.paidOn ?? ''));
  tds.sort((a, b) => (a.status === b.status ? (b.paidOn ?? '').localeCompare(a.paidOn ?? '') : a.status === 'awaited' ? -1 : 1));

  const firas = await listFirasOfSheet(sheet.id);
  const sum = <T>(list: T[], pick: (x: T) => number | null) => round2(list.reduce((a, x) => a + (pick(x) ?? 0), 0));

  return {
    today,
    ageing: { buckets: AGEING_BUCKETS.map(({ bucket, label }) => ({ bucket, label, ...ageing[bucket] })), total: ageing.total },
    daysToPay: daysToPayByClient(domain),
    forecast: cashForecast(domain, today),
    fx: {
      rate: rates.get('USD') ?? null,
      open,
      openTotals: {
        bookedInr: sum(open, (x) => x.bookedInr),
        inrToday: sum(open, (x) => x.inrToday ?? x.bookedInr),
        changeInr: sum(open, (x) => x.changeInr),
      },
      realised,
      realisedTotals: { realisedInr: sum(realised, (x) => x.realisedInr), bankChargesInr: sum(realised, (x) => x.bankChargesInr) },
    },
    tds: {
      rows: tds,
      totals: { tdsInr: sum(tds, (x) => x.tdsInr), awaitedInr: sum(tds.filter((x) => x.status === 'awaited'), (x) => x.tdsInr), awaitedCount: tds.filter((x) => x.status === 'awaited').length },
    },
    firas: { rows: firas, awaited: firas.filter((f) => f.status === 'awaited').length, received: firas.filter((f) => f.status === 'received').length },
    disputes: rows
      .filter((r) => r.status === 'open' && isDisputed(r))
      .map((r) => ({
        id: r.id,
        clientName: r.clientName,
        invoiceNo: r.invoiceNo,
        dueDate: String(r.dueDate),
        amountInr: num(r.amountInr) ?? 0,
        disputedAt: (r.disputedAt instanceof Date ? r.disputedAt : new Date(r.disputedAt!)).toISOString(),
        reason: r.disputeReason ?? '',
      })),
  };
}
