'use client';

import { round2 } from '@/lib/receivables/fx';
import type { InvoicePatch, SheetInvoice } from '@/lib/receivables/model';
import type { RateInForceDto } from '@/lib/receivables/reports-wire';
import { useFxRateOn } from '@/hooks/use-receivables-reports';

/**
 * The foreign-currency draft of the Add invoice and Edit FX dialogs (Phase 9): the typed values,
 * the stored rate for the invoice date, the figures they add up to and the fields the invoice
 * routes take. The fields themselves are in FxFields.tsx.
 */

export type FxDraft = { currency: 'INR' | 'USD'; fcAmount: string; invoiceDate: string; fxRate: string };

function parseNum(s: string): number {
  return Number(s.replace(/[$,\s]/g, ''));
}

export function fxDraftOf(inv: Pick<SheetInvoice, 'currency' | 'fcAmount' | 'fxRate' | 'invoiceDate'> | null, today: string): FxDraft {
  const usd = (inv?.currency ?? 'INR').toUpperCase() === 'USD';
  return {
    currency: usd ? 'USD' : 'INR',
    fcAmount: usd && inv?.fcAmount ? String(inv.fcAmount) : '',
    invoiceDate: inv?.invoiceDate ?? today,
    fxRate: usd && inv?.fxRate ? String(inv.fxRate) : '',
  };
}

/** The stored rate for the draft's invoice date, looked up only for a USD draft. */
export function useDraftRate(sheetId: string, draft: FxDraft) {
  return useFxRateOn(sheetId, draft.invoiceDate, draft.currency === 'USD').data ?? null;
}

/** The figures the draft adds up to; `ok` is false while a USD draft lacks an amount, date or rate. */
export function fxFigures(draft: FxDraft, stored: RateInForceDto | null) {
  const fcAmount = parseNum(draft.fcAmount);
  const typed = draft.fxRate.trim() ? parseNum(draft.fxRate) : NaN;
  const fxRate = Number.isFinite(typed) ? typed : (stored?.rate ?? NaN);
  const ok = draft.currency === 'INR' || (fcAmount > 0 && fxRate > 0 && /^\d{4}-\d{2}-\d{2}$/.test(draft.invoiceDate));
  return { fcAmount, fxRate, bookedInr: ok && draft.currency === 'USD' ? round2(fcAmount * fxRate) : null, ok };
}

/** The draft as the fields the invoice routes take. */
export function fxPayload(draft: FxDraft, stored: RateInForceDto | null): Pick<InvoicePatch, 'currency' | 'fcAmount' | 'fxRate' | 'invoiceDate'> {
  if (draft.currency === 'INR') return { currency: 'INR' };
  const f = fxFigures(draft, stored);
  return { currency: 'USD', fcAmount: f.fcAmount, fxRate: f.fxRate, invoiceDate: draft.invoiceDate };
}

