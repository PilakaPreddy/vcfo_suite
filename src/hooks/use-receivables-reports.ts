'use client';

/**
 * Receivables reports data (Phase 9, docs/specs/receivables/PLAN.md): TanStack Query over the
 * Reports tab routes, the daily FX rates, credit notes, disputes, TDS and FIRAs. Shapes are in
 * src/lib/receivables/reports-wire.ts. A write that changes an invoice refetches both the
 * reports and the sheet, so the Sheet tab totals stay right.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SheetInvoice } from '@/lib/receivables/model';
import type { CreditNoteDto, FiraDto, FxRateDto, FxRatesDto, ReportsDto } from '@/lib/receivables/reports-wire';
import { sheetKey } from './use-receivables';

const ERROR_TEXT: Record<string, string> = {
  currency: 'Pick a foreign currency.',
  rate_date: 'Pick a day up to today.',
  rate: 'Enter a rate above zero.',
  note: 'The note is too long.',
  issued_on: 'Enter a valid date.',
  amount: 'Enter an amount above zero.',
  credit_note_too_large: 'A credit note must be less than the open balance. To cancel the whole invoice, remove it from the sheet.',
  not_open: 'This invoice is already received.',
  reason: 'Write the reason in up to 300 characters.',
  already_disputed: 'This invoice is already disputed.',
  not_disputed: 'This invoice is not disputed.',
  tds: 'Enter the TDS amount in rupees.',
  certificate_on: 'Enter a valid certificate date.',
  fira_no: 'Enter the FIRA number from the bank.',
  not_found: 'This sheet is not assigned to you.',
  Forbidden: 'Your role cannot open receivables.',
};

class ReportsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ReportsApiError((body.error && ERROR_TEXT[body.error]) || body.error || 'Something went wrong. Try again.', res.status, body.error);
  return body;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const reportsKey = (sheetId: string) => ['receivables', 'reports', sheetId] as const;
const ratesKey = (sheetId: string) => ['receivables', 'fx-rates', sheetId] as const;
const creditNotesKey = (invoiceId: string | null) => ['receivables', 'credit-notes', invoiceId] as const;

export function useReports(sheetId: string) {
  return useQuery({ queryKey: reportsKey(sheetId), queryFn: () => call<ReportsDto>(`/api/receivables/sheets/${sheetId}/reports`) });
}

function useFxRates(sheetId: string, days = 30) {
  return useQuery({ queryKey: [...ratesKey(sheetId), days], queryFn: () => call<FxRatesDto>(`/api/receivables/sheets/${sheetId}/fx-rates?days=${days}`) });
}

/** The rate of `currency` in force on `date` (the booked-rate default of a foreign invoice); fetched only when enabled. */
export function useFxRateOn(sheetId: string, date: string, enabled = true, currency = 'USD') {
  return useQuery({
    queryKey: [...ratesKey(sheetId), 'on', currency, date],
    queryFn: async () =>
      (await call<FxRatesDto>(`/api/receivables/sheets/${sheetId}/fx-rates?days=1&date=${encodeURIComponent(date)}&currency=${encodeURIComponent(currency)}`)).onDate ?? null,
    enabled: enabled && /^\d{4}-\d{2}-\d{2}$/.test(date),
    staleTime: 5 * 60_000,
  });
}

function useCreditNotes(invoiceId: string | null) {
  return useQuery({
    queryKey: creditNotesKey(invoiceId),
    queryFn: async () => (await call<{ creditNotes: CreditNoteDto[] }>(`/api/receivables/invoices/${invoiceId}/credit-notes`)).creditNotes,
    enabled: Boolean(invoiceId),
  });
}

/** Every Phase 9 write, each refetching what it changes. */
export function useReportsActions(sheetId: string) {
  const qc = useQueryClient();
  const refreshReports = () => qc.invalidateQueries({ queryKey: reportsKey(sheetId) });
  const refreshAll = () => Promise.all([refreshReports(), qc.invalidateQueries({ queryKey: sheetKey(sheetId) })]);
  return {
    setRate: useMutation({
      mutationFn: (input: { currency: string; rateDate: string; rate: number; note?: string | null }) => call<{ rate: FxRateDto }>(`/api/receivables/sheets/${sheetId}/fx-rates`, json('POST', input)),
      onSettled: () => Promise.all([refreshReports(), qc.invalidateQueries({ queryKey: ratesKey(sheetId) })]),
    }),
    addCreditNote: useMutation({
      mutationFn: ({ invoiceId, ...input }: { invoiceId: string; number?: string | null; issuedOn: string; amountInr: number; reason?: string | null }) =>
        call<{ creditNote: CreditNoteDto; invoice: SheetInvoice }>(`/api/receivables/invoices/${invoiceId}/credit-notes`, json('POST', input)),
      onSettled: (_d, _e, v) => Promise.all([refreshAll(), qc.invalidateQueries({ queryKey: creditNotesKey(v.invoiceId) })]),
    }),
    raiseDispute: useMutation({
      mutationFn: ({ invoiceId, reason }: { invoiceId: string; reason: string }) => call<{ invoice: SheetInvoice }>(`/api/receivables/invoices/${invoiceId}/dispute`, json('POST', { reason })),
      onSettled: refreshAll,
    }),
    resolveDispute: useMutation({
      mutationFn: (invoiceId: string) => call<{ invoice: SheetInvoice }>(`/api/receivables/invoices/${invoiceId}/dispute`, json('DELETE')),
      onSettled: refreshAll,
    }),
    setTds: useMutation({
      mutationFn: ({ invoiceId, ...input }: { invoiceId: string; tdsInr?: number; certificateOn?: string | null }) => call<{ invoice: SheetInvoice }>(`/api/receivables/invoices/${invoiceId}/tds`, json('PATCH', input)),
      onSettled: refreshAll,
    }),
    updateFira: useMutation({
      mutationFn: ({ id, ...input }: { id: string } & ({ status: 'received'; firaNo: string; issuedOn: string; note?: string | null } | { status: 'awaited'; note?: string | null })) =>
        call<{ fira: FiraDto }>(`/api/receivables/firas/${id}`, json('PATCH', input)),
      onSettled: refreshReports,
    }),
  };
}
