/**
 * RECEIVABLES PARTNER WIRE (Phase 8, docs/specs/receivables/PLAN.md): the JSON the signed-in
 * client partner's routes send. A partner only ever gets their own invoices of the latest
 * published version, plus live per-invoice details (reminders, pause, promise, notes).
 *
 * Routes (all need a signed-in partner; anything else gets 401 or 403):
 *   GET   /api/receivables/partner/me                      → PartnerHomeDto
 *   PATCH /api/receivables/partner/me                      { notifyOnPublish: boolean } → { ok: true }
 *   GET   /api/receivables/partner/invoices/:id            → PartnerInvoiceDetailDto
 *   POST  /api/receivables/partner/invoices/:id/promise    { promisedOn: 'YYYY-MM-DD', note?: string } → { ok: true }
 *   POST  /api/receivables/partner/invoices/:id/notes      { text: string } → { ok: true }
 *   GET   /api/receivables/partner/export                  → the partner's own invoices as .xlsx
 *   POST  /api/account/password                            { currentPassword, newPassword } → { ok: true }
 */
import type { SnapshotRow } from './model';

export type PartnerRowDto = SnapshotRow & {
  /** Live, not from the snapshot: the date the partner said the client promised to pay. */
  promisedOn: string | null;
  /** Live: how many notes the invoice has. */
  noteCount: number;
};

export type PartnerHomeDto = {
  partner: { name: string; email: string; notifyOnPublish: boolean };
  clientOrgName: string;
  /** Null before the manager's first Update; the page then says nothing is published yet. */
  publishedAt: string | null;
  today: string;
  rows: PartnerRowDto[];
};

export type PartnerNoteDto = { id: string; text: string; authorName: string; fromSbc: boolean; createdAt: string };

export type PartnerReminderDto = { forDate: string; label: string; status: 'queued' | 'skipped' | 'sent' | 'failed'; sentAt: string | null };

export type PartnerInvoiceDetailDto = {
  row: PartnerRowDto;
  reminders: PartnerReminderDto[];
  /** The current reminder pause, if any (set by the manager or by the partner's promise). */
  pause: { until: string; reason: string | null } | null;
  notes: PartnerNoteDto[];
};
