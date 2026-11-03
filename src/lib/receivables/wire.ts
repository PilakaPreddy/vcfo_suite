/**
 * RECEIVABLES WIRE — the JSON the /api/receivables routes send to the manager area. Dates in
 * timestamps arrive as ISO strings.
 */
import type { EmailRecipient, Partner, ReminderRules, SheetInvoice, SnapshotRow } from './model';

export type SheetDto = {
  id: string;
  name: string;
  clientOrgName: string;
  requireKey: boolean;
  reminderRules: ReminderRules;
  publishedVersionId: string | null;
};

export type ManagerSheetDto = {
  sheet: SheetDto;
  partners: PartnerDto[];
  invoices: ManagerInvoiceDto[];
  unpublishedChanges: number;
  latestVersion: { id: string; seq: number; publishedAt: string; publishedByName: string } | null;
  /** The client page link, key included. */
  publicUrl: string;
};

/** Phase 8: a client partner's login, as the Partners tab shows it. */
export type PartnerLoginState = 'none' | 'invited' | 'active' | 'disabled';

/** A client partner with their login state (Phase 8). The base fields are the plain `Partner`. */
export type PartnerDto = Partner & {
  loginState: PartnerLoginState;
  invitedAt: string | null;
  acceptedAt: string | null;
  notifyOnPublish: boolean;
};

/** A draft invoice on the manager sheet, with the partner's promise date and the note count (Phase 8). */
export type ManagerInvoiceDto = SheetInvoice & {
  promisedOn: string | null;
  noteCount: number;
};

/** One note on an invoice. `fromSbc` marks a reply by SBC staff; otherwise the partner wrote it. */
export type InvoiceNoteDto = { id: string; invoiceId: string; authorName: string; fromSbc: boolean; text: string; createdAt: string };

export type VersionMetaDto = { id: string; seq: number; note: string; publishedAt: string; publishedByName: string };
export type VersionDto = VersionMetaDto & { snapshot: SnapshotRow[] };

export type SheetListItem = { id: string; name: string; clientOrgName: string };

export type RecipientListDto = { key: 'last' | 'partners' | 'overdue' | 'empty'; label: string; to: EmailRecipient[]; cc: EmailRecipient[]; bcc: EmailRecipient[] };

export type SummaryDto = {
  versionSeq: number;
  publishedAt: string;
  subject: string;
  html: string;
  lists: RecipientListDto[];
  contacts: EmailRecipient[];
  lastSentAt: string | null;
};

export type OutlookStatusDto = { configured: boolean; connected: boolean; msEmail?: string };

export type ReminderRowDto = {
  id: string;
  forDate: string;
  label: string;
  kind: 'before' | 'due' | 'overdue';
  status: 'queued' | 'skipped' | 'sent' | 'failed';
  channel: 'outlook' | 'email' | null;
  error: string | null;
  sentAt: string | null;
  clientName: string;
  invoiceNo: string | null;
  amountInr: number;
  dueDate: string;
  invoiceOpen: boolean;
  partnerName: string | null;
  partnerEmail: string | null;
  subject: string;
  body: string;
  edited: boolean;
};

export type ReminderDeskDto = { today: string; rules: ReminderRules; queue: ReminderRowDto[]; history: ReminderRowDto[] };

export type CreditDto = {
  id: string;
  source: 'hsbc_api' | 'alert_email' | 'manual';
  externalRef: string;
  valueDate: string;
  payer: string;
  currency: string;
  fcAmount: number | null;
  inrAmount: number;
  narration: string;
  status: 'auto' | 'to_confirm' | 'unmatched' | 'confirmed' | 'ignored';
  matchInvoiceIds: string[];
  matchNote: string;
  decidedAt: string | null;
};

export type CreditsDto = { feed: { live: boolean; missing: string[] }; credits: CreditDto[] };

export type ImportResultDto = { added: number; auto: number; duplicates: number; found: number; skipped: string[]; kind: string; account: string | null };
