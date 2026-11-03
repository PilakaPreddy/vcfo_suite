'use client';

import { isSupportedForeign } from '@/lib/receivables/currencies';
import { round2 } from '@/lib/receivables/fx';
import type { InvoicePatch, SheetInvoice } from '@/lib/receivables/model';
import type { RateInForceDto } from '@/lib/receivables/reports-wire';
import { useFxRateOn } from '@/hooks/use-receivables-reports';

/**
 * The foreign-currency draft of the Add invoice and Edit FX dialogs (Phases 9 and 10): the typed
 * values, the stored rate for the invoice date, the figures they add up to and the fields the
 * invoice routes take. The currency is INR or any of src/lib/receivables/currencies.ts. The
 * fields themselves are in FxFields.tsx.
 */

export type FxDraft = { currency: string; fcAmount: string; invoiceDate: string; fxRate: string };

function parseNum(s: string): number {
  return Number(s.replace(/[$€£¥,\s]/g, ''));
}

/** True when the draft is in a foreign currency (anything other than INR). */
export function draftIsForeign(draft: Pick<FxDraft, 'currency'>): boolean {
  return draft.currency !== 'INR';
}

export function fxDraftOf(inv: Pick<SheetInvoice, 'currency' | 'fcAmount' | 'fxRate' | 'invoiceDate'> | null, today: string): FxDraft {
  const code = (inv?.currency ?? 'INR').toUpperCase();
  const foreign = isSupportedForeign(code);
  return {
    currency: foreign ? code : 'INR',
    fcAmount: foreign && inv?.fcAmount ? String(inv.fcAmount) : '',
    invoiceDate: inv?.invoiceDate ?? today,
    fxRate: foreign && inv?.fxRate ? String(inv.fxRate) : '',
  };
}

/** The stored rate of the draft's currency for its invoice date, looked up only for a foreign draft. */
export function useDraftRate(sheetId: string, draft: FxDraft) {
  return useFxRateOn(sheetId, draft.invoiceDate, draftIsForeign(draft), draft.currency).data ?? null;
}

/** The figures the draft adds up to; `ok` is false while a foreign draft lacks an amount, date or rate. */
export function fxFigures(draft: FxDraft, stored: RateInForceDto | null) {
  const fcAmount = parseNum(draft.fcAmount);
  const typed = draft.fxRate.trim() ? parseNum(draft.fxRate) : NaN;
  // A stored rate of another currency (a stale answer while the currency changes) is never used.
  const usable = stored && stored.currency === draft.currency ? stored.rate : NaN;
  const fxRate = Number.isFinite(typed) ? typed : usable;
  const foreign = draftIsForeign(draft);
  const ok = !foreign || (fcAmount > 0 && fxRate > 0 && /^\d{4}-\d{2}-\d{2}$/.test(draft.invoiceDate));
  return { fcAmount, fxRate, bookedInr: ok && foreign ? round2(fcAmount * fxRate) : null, ok };
}

/** The draft as the fields the invoice routes take. */
export function fxPayload(draft: FxDraft, stored: RateInForceDto | null): Pick<InvoicePatch, 'currency' | 'fcAmount' | 'fxRate' | 'invoiceDate'> {
  if (!draftIsForeign(draft)) return { currency: 'INR' };
  const f = fxFigures(draft, stored);
  return { currency: draft.currency, fcAmount: f.fcAmount, fxRate: f.fxRate, invoiceDate: draft.invoiceDate };
}
