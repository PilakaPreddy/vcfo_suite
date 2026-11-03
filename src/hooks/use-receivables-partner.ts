'use client';

/**
 * Receivables partner data (Phase 8, docs/specs/receivables/PLAN.md): TanStack Query over the
 * signed-in client partner's routes in src/lib/receivables/partner-wire.ts. A partner only ever
 * reads their own invoices of the latest published version, plus live per-invoice details.
 * Each write refetches the home sheet (promised date and note count live there) and the details.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PartnerHomeDto, PartnerInvoiceDetailDto } from '@/lib/receivables/partner-wire';

const ERROR_TEXT: Record<string, string> = {
  invalid_credentials: 'Your current password is not right.',
  password_too_short: 'Use at least 8 characters.',
  promised_on: 'Pick a date from today to a year ahead.',
  text: 'Write a note of up to 2000 characters.',
  forbidden: 'Your login is not linked to a receivables sheet. Ask SBC.',
  note: 'The note is too long.',
  not_open: 'This invoice is already received.',
  not_found: 'This invoice is not one of yours.',
  Unauthorized: 'Sign in again to continue.',
  Forbidden: 'Your login cannot open this page.',
};

export class PartnerApiError extends Error {
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
  if (!res.ok) throw new PartnerApiError((body.error && ERROR_TEXT[body.error]) || body.error || 'Something went wrong. Try again.', res.status, body.error);
  return body;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const PARTNER_EXPORT_HREF = '/api/receivables/partner/export';

export const partnerHomeKey = ['receivables', 'partner', 'me'] as const;
const invoiceKey = (id: string | null) => ['receivables', 'partner', 'invoice', id] as const;

/** The partner's own invoices of the latest published version, and their account. */
export function usePartnerHome() {
  return useQuery({ queryKey: partnerHomeKey, queryFn: () => call<PartnerHomeDto>('/api/receivables/partner/me') });
}

/** One invoice's live details: reminders sent, the current pause, notes. Off while `id` is null. */
export function usePartnerInvoice(id: string | null) {
  return useQuery({
    queryKey: invoiceKey(id),
    queryFn: () => call<PartnerInvoiceDetailDto>(`/api/receivables/partner/invoices/${id}`),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

/** Promise and Add note, each refetching the invoice and the home sheet. */
export function usePartnerInvoiceActions(id: string | null) {
  const qc = useQueryClient();
  const onSettled = () => Promise.all([qc.invalidateQueries({ queryKey: invoiceKey(id) }), qc.invalidateQueries({ queryKey: partnerHomeKey })]);
  return {
    promise: useMutation({
      mutationFn: (input: { promisedOn: string; note?: string }) => call<{ ok: true }>(`/api/receivables/partner/invoices/${id}/promise`, json('POST', input)),
      onSettled,
    }),
    addNote: useMutation({
      mutationFn: (text: string) => call<{ ok: true }>(`/api/receivables/partner/invoices/${id}/notes`, json('POST', { text })),
      onSettled,
    }),
  };
}

/** The "Email me when SBC publishes an update" switch. */
export function useSetNotifyOnPublish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notifyOnPublish: boolean) => call<{ ok: true }>('/api/receivables/partner/me', json('PATCH', { notifyOnPublish })),
    onMutate: async (notifyOnPublish) => {
      await qc.cancelQueries({ queryKey: partnerHomeKey });
      const before = qc.getQueryData<PartnerHomeDto>(partnerHomeKey);
      if (before) qc.setQueryData<PartnerHomeDto>(partnerHomeKey, { ...before, partner: { ...before.partner, notifyOnPublish } });
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(partnerHomeKey, ctx.before);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: partnerHomeKey }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) => call<{ ok: true }>('/api/account/password', json('POST', input)),
  });
}
