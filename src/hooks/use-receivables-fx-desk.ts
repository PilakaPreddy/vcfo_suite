'use client';

/**
 * Receivables forex desk data (Phase 10, docs/specs/receivables/PLAN.md): TanStack Query over the
 * FX tab routes, the forward contracts and the rate alerts. Shapes are in
 * src/lib/receivables/fx-desk-wire.ts. Every write refetches the desk; a manual rate also
 * refetches the Reports tab and the sheet, whose figures use the same rates.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FxAlertDto, FxAlertInput, FxAlertPatch, FxDeskDto, FxForwardDto, FxForwardInput, FxForwardPatch } from '@/lib/receivables/fx-desk-wire';
import type { FxRateDto } from '@/lib/receivables/reports-wire';
import { reportsKey } from './use-receivables-reports';
import { sheetKey } from './use-receivables';

const ERROR_TEXT: Record<string, string> = {
  currency: 'Pick a supported foreign currency.',
  bank: 'Enter the bank, in up to 80 characters.',
  contract_no: 'The contract number is too long.',
  amount_fc: 'Enter the contract amount above zero.',
  forward_rate: 'Enter the forward rate above zero.',
  booked_on: 'Enter the booking date.',
  maturity_on: 'The maturity date must be on or after the booking date.',
  amount_below_utilised: 'The amount cannot be less than what is already delivered against it.',
  forward_cancelled: 'This contract is cancelled.',
  forward: 'Pick an open forward contract of this currency.',
  status: 'Pick open or closed.',
  direction: 'Pick above or below.',
  threshold: 'Enter the rate level above zero.',
  rate_date: 'Pick a day up to today.',
  rate: 'Enter a rate above zero.',
  note: 'The note is too long.',
  not_found: 'This sheet is not assigned to you.',
  Forbidden: 'Your role cannot open receivables.',
};

export class FxDeskApiError extends Error {
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
  if (!res.ok) throw new FxDeskApiError((body.error && ERROR_TEXT[body.error]) || body.error || 'Something went wrong. Try again.', res.status, body.error);
  return body;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const fxDeskKey = (sheetId: string) => ['receivables', 'fx-desk', sheetId] as const;
const forwardsKey = (sheetId: string) => ['receivables', 'fx-forwards', sheetId] as const;

export function useFxDesk(sheetId: string) {
  return useQuery({ queryKey: fxDeskKey(sheetId), queryFn: () => call<FxDeskDto>(`/api/receivables/sheets/${sheetId}/fx-desk`) });
}

/** The sheet's forward contracts, for the Mark received picker; fetched only when enabled. */
export function useFxForwards(sheetId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: forwardsKey(sheetId ?? ''),
    queryFn: async () => (await call<{ forwards: FxForwardDto[] }>(`/api/receivables/sheets/${sheetId}/fx-forwards`)).forwards,
    enabled: enabled && Boolean(sheetId),
  });
}

export function useFxDeskActions(sheetId: string) {
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: fxDeskKey(sheetId) }), qc.invalidateQueries({ queryKey: forwardsKey(sheetId) })]);
  return {
    setRate: useMutation({
      mutationFn: (input: { currency: string; rateDate: string; rate: number; note?: string | null }) => call<{ rate: FxRateDto }>(`/api/receivables/sheets/${sheetId}/fx-rates`, json('POST', input)),
      onSettled: () =>
        Promise.all([
          refresh(),
          qc.invalidateQueries({ queryKey: reportsKey(sheetId) }),
          qc.invalidateQueries({ queryKey: sheetKey(sheetId) }),
          qc.invalidateQueries({ queryKey: ['receivables', 'fx-rates', sheetId] }),
        ]),
    }),
    createForward: useMutation({
      mutationFn: (input: FxForwardInput) => call<{ forward: FxForwardDto }>(`/api/receivables/sheets/${sheetId}/fx-forwards`, json('POST', input)),
      onSettled: refresh,
    }),
    updateForward: useMutation({
      mutationFn: ({ id, ...patch }: { id: string } & FxForwardPatch) => call<{ forward: FxForwardDto }>(`/api/receivables/fx-forwards/${id}`, json('PATCH', patch)),
      onSettled: refresh,
    }),
    cancelForward: useMutation({
      mutationFn: (id: string) => call<{ forward: FxForwardDto }>(`/api/receivables/fx-forwards/${id}`, json('DELETE')),
      onSettled: refresh,
    }),
    createAlert: useMutation({
      mutationFn: (input: FxAlertInput) => call<{ alert: FxAlertDto }>(`/api/receivables/sheets/${sheetId}/fx-alerts`, json('POST', input)),
      onSettled: refresh,
    }),
    updateAlert: useMutation({
      mutationFn: ({ id, ...patch }: { id: string } & FxAlertPatch) => call<{ alert: FxAlertDto }>(`/api/receivables/fx-alerts/${id}`, json('PATCH', patch)),
      onSettled: refresh,
    }),
    deleteAlert: useMutation({
      mutationFn: (id: string) => call<{ ok: true }>(`/api/receivables/fx-alerts/${id}`, json('DELETE')),
      onSettled: refresh,
    }),
  };
}
