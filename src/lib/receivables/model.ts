/**
 * RECEIVABLES — the shapes shared by the schema, the repositories and the views
 * (docs/specs/receivables/PLAN.md). Dates are ISO `YYYY-MM-DD` strings in India time and money
 * is a plain number of rupees; the repositories convert Postgres `numeric` strings at the seam.
 */

export type InvoiceStatus = 'open' | 'received';
export type PaidVia = 'manual' | 'bank';

/** before: a set number of days before due · due: the due date · overdue: every day after. */
export type ReminderKind = 'before' | 'due' | 'overdue';

export type ReminderRules = {
  /**
   * The sheet's on/off switch. Off on a new sheet, so nothing goes to client partners until the
   * manager has checked the partners and turned reminders on. Missing (older rows) reads as off.
   */
  enabled?: boolean;
  /** Days before the due date that get a reminder, e.g. [5, 3]. */
  daysBefore: number[];
  onDueDate: boolean;
  /** Every day after the due date until the invoice is received. */
  dailyAfterDue: boolean;
  skipWeekends: boolean;
  /** Hour of the IST day the queue sends (the queue itself is built an hour earlier). */
  sendHourIst: number;
};

export const DEFAULT_REMINDER_RULES: ReminderRules = {
  enabled: false,
  daysBefore: [5, 3],
  onDueDate: true,
  dailyAfterDue: true,
  skipWeekends: true,
  sendHourIst: 9,
};

/** One invoice as the domain code sees it. */
export type SheetInvoice = {
  id: string;
  /** First day of the invoice month, e.g. `2026-09-01`. */
  invoiceMonth: string;
  clientName: string;
  invoiceNo: string | null;
  partnerId: string | null;
  dueDate: string;
  /** The open balance in INR. */
  amountInr: number;
  status: InvoiceStatus;
  paidOn: string | null;
  paidAmount: number | null;
  paidVia: PaidVia | null;
  partPaid: number;
  remindersPausedUntil: string | null;
  pauseReason: string | null;
};

/** One row of a published version: the invoice plus its partner, frozen at publish time. */
export type SnapshotRow = SheetInvoice & {
  partnerSlug: string | null;
  partnerName: string | null;
};

export type Partner = {
  id: string;
  slug: string;
  name: string;
  email: string;
  active: boolean;
};

export type EmailRecipient = { name: string; email: string };

/** A new invoice, as the manager types it. */
export type InvoiceInput = {
  invoiceMonth: string;
  clientName: string;
  invoiceNo?: string | null;
  partnerId?: string | null;
  dueDate: string;
  amountInr: number;
};

export type InvoicePatch = Partial<Pick<InvoiceInput, 'clientName' | 'invoiceNo' | 'partnerId' | 'dueDate' | 'amountInr' | 'invoiceMonth'>>;
