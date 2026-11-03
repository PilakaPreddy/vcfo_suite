'use client';

/**
 * Receivables manager data (docs/specs/receivables/PLAN.md): TanStack Query over /api/receivables.
 * Every route scopes by the caller's AuthContext in its repository. Each write refetches the
 * sheet, so the unpublished count and totals stay right.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EmailRecipient, InvoiceInput, InvoicePatch, ReceiptInput, ReminderRules } from '@/lib/receivables/model';
import type { CreditsDto, ImportResultDto, InvoiceNoteDto, ManagerSheetDto, OutlookStatusDto, PartnerDto, ReminderDeskDto, SummaryDto, VersionDto, VersionMetaDto } from '@/lib/receivables/wire';

const ERROR_TEXT: Record<string, string> = {
  client: 'Enter the client name.',
  invoice_no: 'The invoice number is too long.',
  invoice_month: 'Pick the invoice month.',
  due_date: 'Enter a valid due date.',
  amount: 'Enter an amount above zero.',
  partner: 'Pick a client partner from the list.',
  paid_on: 'Enter the date the money arrived.',
  not_open: 'This invoice is already received.',
  not_received: 'This invoice is not marked received.',
  until: 'Enter a valid date.',
  name: 'Enter the name.',
  email: 'Enter a valid email address.',
  not_found: 'This sheet is not assigned to you.',
  not_published: 'Click Update once first; the email is built from the published version.',
  outlook_not_connected: 'Connect your Outlook first.',
  outlook_reconnect: 'Outlook needs to be connected again.',
  send_failed: 'Outlook did not send the email. Try again.',
  bad_email: 'One of the addresses is not a valid email.',
  to_required: 'Add at least one recipient in To.',
  subject_required: 'Write a subject.',
  already_sent: 'This reminder has already gone.',
  file_required: 'Choose a statement file.',
  too_large: 'The file is over 5 MB.',
  not_a_statement: 'This is not an ISO 20022 bank statement (camt.053 or camt.054 XML).',
  already_decided: 'This credit is already handled.',
  invoice: 'Pick an open invoice of this sheet.',
  send_hour: 'Pick a send hour between 6 and 20.',
  Forbidden: 'Your role cannot open receivables.',
  already_invited: 'This partner already has a login.',
  partner_inactive: 'Turn the partner on (Active) before inviting them.',
  email_in_use: 'This email belongs to a staff or client account. Use another email for the partner.',
  login_disabled: 'This login is disabled. Enable it first.',
  not_invited: 'Invite the partner first.',
  already_accepted: 'The partner has set a password already. Use Reset password.',
  not_accepted: 'The partner has not set a password yet. Use Resend invite.',
  not_disabled: 'This login is not disabled.',
  note: 'Write a note of up to 2000 characters.',
  currency: 'Pick INR or USD.',
  fc_amount: 'Enter the USD amount above zero.',
  fx_rate: 'Enter the booked rate (INR per USD) above zero.',
  invoice_date: 'Enter the invoice date of the USD invoice.',
  tds: 'Enter the TDS in rupees, zero or more.',
};

export class ReceivablesApiError extends Error {
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
  if (!res.ok) throw new ReceivablesApiError((body.error && ERROR_TEXT[body.error]) || body.error || 'Something went wrong. Try again.', res.status, body.error);
  return body;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const sheetKey = (sheetId: string) => ['receivables', 'sheet', sheetId] as const;
const versionsKey = (sheetId: string) => ['receivables', 'versions', sheetId] as const;

export function useManagerSheet(sheetId: string) {
  return useQuery({
    queryKey: sheetKey(sheetId),
    queryFn: () => call<ManagerSheetDto>(`/api/receivables/sheets/${sheetId}`),
  });
}

export function useVersions(sheetId: string, enabled = true) {
  return useQuery({
    queryKey: versionsKey(sheetId),
    queryFn: async () => (await call<{ versions: VersionMetaDto[] }>(`/api/receivables/sheets/${sheetId}/versions`)).versions,
    enabled,
  });
}

export function useVersion(versionId: string | null) {
  return useQuery({
    queryKey: ['receivables', 'version', versionId],
    queryFn: async () => (await call<{ version: VersionDto }>(`/api/receivables/versions/${versionId}`)).version,
    enabled: Boolean(versionId),
  });
}

/** The summary email, built from the published version. Fetched fresh each time the dialog opens. */
export function useSummary(sheetId: string, open: boolean) {
  return useQuery({
    queryKey: ['receivables', 'summary', sheetId],
    queryFn: () => call<SummaryDto>(`/api/receivables/sheets/${sheetId}/summary`),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

const remindersKey = (sheetId: string) => ['receivables', 'reminders', sheetId] as const;

/** The Reminders tab: today's queue and 14 days of history. */
export function useReminderDesk(sheetId: string) {
  return useQuery({ queryKey: remindersKey(sheetId), queryFn: () => call<ReminderDeskDto>(`/api/receivables/sheets/${sheetId}/reminders`) });
}

export function useReminderActions(sheetId: string) {
  const qc = useQueryClient();
  const onSettled = () => qc.invalidateQueries({ queryKey: remindersKey(sheetId) });
  return {
    update: useMutation({
      mutationFn: ({ id, ...patch }: { id: string; skipped?: boolean; subject?: string | null; body?: string | null }) => call(`/api/receivables/reminders/${id}`, json('PATCH', patch)),
      onSettled,
    }),
    sendNow: useMutation({
      mutationFn: () => call<{ sent: number; failed: number; viaOutlook: number; viaEmail: number }>(`/api/receivables/sheets/${sheetId}/reminders/send-now`, json('POST')),
      onSettled,
    }),
    saveRules: useMutation({
      mutationFn: (reminderRules: ReminderRules) => call(`/api/receivables/sheets/${sheetId}`, json('PATCH', { reminderRules })),
      onSettled: () => Promise.all([onSettled(), qc.invalidateQueries({ queryKey: sheetKey(sheetId) })]),
    }),
  };
}

const creditsKey = (sheetId: string) => ['receivables', 'credits', sheetId] as const;

/** The From bank tab: credits from the feed and imported statements. */
export function useCredits(sheetId: string) {
  return useQuery({ queryKey: creditsKey(sheetId), queryFn: () => call<CreditsDto>(`/api/receivables/sheets/${sheetId}/credits`) });
}

export function useCreditActions(sheetId: string) {
  const qc = useQueryClient();
  const onSettled = () => Promise.all([qc.invalidateQueries({ queryKey: creditsKey(sheetId) }), qc.invalidateQueries({ queryKey: sheetKey(sheetId) })]);
  return {
    importFile: useMutation({
      mutationFn: (file: File) => {
        const form = new FormData();
        form.set('file', file);
        return call<ImportResultDto>(`/api/receivables/sheets/${sheetId}/credits/import`, { method: 'POST', body: form });
      },
      onSettled,
    }),
    decide: useMutation({
      mutationFn: ({ id, ...body }: { id: string; action: 'confirm'; invoiceIds: string[] } | { id: string; action: 'ignore' }) => call(`/api/receivables/credits/${id}`, json('POST', body)),
      onSettled,
    }),
  };
}

/** The signed-in person's Outlook link (the same status the settings page shows). */
export function useOutlookStatus() {
  return useQuery({ queryKey: ['outlook', 'status'], queryFn: () => call<OutlookStatusDto>('/api/outlook') });
}

export type SummarySendInput = { to: EmailRecipient[]; cc: EmailRecipient[]; bcc: EmailRecipient[]; subject: string; html: string; attachExcel: boolean };

export function useSendSummary(sheetId: string) {
  return useMutation({
    mutationFn: (input: SummarySendInput) => call<{ from: string; to: number; cc: number; bcc: number }>(`/api/receivables/sheets/${sheetId}/send-summary`, json('POST', input)),
  });
}

/** All the writes of the manager area, each refetching the sheet (and versions after Update). */
export function useReceivablesActions(sheetId: string) {
  const qc = useQueryClient();
  const onSettled = () => qc.invalidateQueries({ queryKey: sheetKey(sheetId) });
  const sheetUrl = `/api/receivables/sheets/${sheetId}`;
  return {
    addInvoice: useMutation({ mutationFn: (input: InvoiceInput) => call(`${sheetUrl}/invoices`, json('POST', input)), onSettled }),
    updateInvoice: useMutation({ mutationFn: ({ id, patch }: { id: string; patch: InvoicePatch }) => call(`/api/receivables/invoices/${id}`, json('PATCH', patch)), onSettled }),
    deleteInvoice: useMutation({ mutationFn: (id: string) => call(`/api/receivables/invoices/${id}`, json('DELETE')), onSettled }),
    markReceived: useMutation({
      mutationFn: ({ id, ...body }: { id: string } & ReceiptInput) => call(`/api/receivables/invoices/${id}/received`, json('POST', body)),
      onSettled,
    }),
    reopen: useMutation({ mutationFn: (id: string) => call(`/api/receivables/invoices/${id}/received`, json('DELETE')), onSettled }),
    pause: useMutation({
      mutationFn: ({ id, ...body }: { id: string; until: string | null; reason?: string | null }) => call(`/api/receivables/invoices/${id}/pause`, json('PUT', body)),
      onSettled,
    }),
    publish: useMutation({
      mutationFn: (note?: string) => call<{ version: VersionMetaDto }>(`${sheetUrl}/publish`, json('POST', { note })),
      onSettled: () => Promise.all([onSettled(), qc.invalidateQueries({ queryKey: versionsKey(sheetId) })]),
    }),
    addPartner: useMutation({ mutationFn: (input: { name: string; email: string }) => call(`${sheetUrl}/partners`, json('POST', input)), onSettled }),
    updatePartner: useMutation({
      mutationFn: ({ id, ...patch }: { id: string; name?: string; email?: string; active?: boolean; notifyOnPublish?: boolean }) => call(`/api/receivables/partners/${id}`, json('PATCH', patch)),
      onSettled,
    }),
  };
}

export type PartnerLoginActionName = 'invite' | 'resend' | 'reset' | 'disable' | 'enable';

/** Phase 8: a URL-safe set-password token made in the browser (32 random bytes); the server keeps its hash. */
function makeSetPasswordToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Phase 8: invite, resend, reset password, disable or enable a client partner's login. */
export function usePartnerLogin(sheetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: PartnerLoginActionName }) =>
      call<{ partner: PartnerDto; emailed: boolean | null }>(
        `/api/receivables/partners/${id}/login`,
        json('POST', { action, ...(action === 'invite' || action === 'resend' || action === 'reset' ? { setPasswordToken: makeSetPasswordToken() } : {}) }),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: sheetKey(sheetId) }),
  });
}

const notesKey = (invoiceId: string) => ['receivables', 'notes', invoiceId] as const;

/** Phase 8: the notes on one invoice, fetched while the notes dialog is open. */
export function useInvoiceNotes(invoiceId: string | null) {
  return useQuery({
    queryKey: notesKey(invoiceId ?? ''),
    queryFn: async () => (await call<{ notes: InvoiceNoteDto[] }>(`/api/receivables/invoices/${invoiceId}/notes`)).notes,
    enabled: Boolean(invoiceId),
  });
}

/** Phase 8: an SBC reply on an invoice; refreshes the notes and the sheet's note count. */
export function useAddSbcNote(sheetId: string, invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => call<{ note: InvoiceNoteDto }>(`/api/receivables/invoices/${invoiceId}/notes`, json('POST', { text })),
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: notesKey(invoiceId) }), qc.invalidateQueries({ queryKey: sheetKey(sheetId) })]),
  });
}
