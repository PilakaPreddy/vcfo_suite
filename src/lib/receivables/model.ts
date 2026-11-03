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
  /*
   * Phase 9, all optional: snapshots published before Phase 9 do not carry them and read as an
   * INR invoice with no TDS and no dispute.
   */
  /** `INR` or a foreign currency (today only `USD`). Missing reads as INR. */
  currency?: string;
  /** The invoiced amount in the foreign currency; null for INR. */
  fcAmount?: number | null;
  /** The booked rate (INR per unit) on the invoice date; null for INR. */
  fxRate?: number | null;
  /** The invoice date, the FX booking date of a foreign invoice. */
  invoiceDate?: string | null;
  /** The foreign amount that actually arrived; `paidAmount` holds the INR credited. */
  receivedFc?: number | null;
  /** TDS the client deducted, in INR. */
  tdsInr?: number;
  /** True while a dispute is open. Never shown to the client partner. */
  disputed?: boolean;
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
  /** Phase 9: `INR` (the default) or `USD`. A USD invoice also needs `fcAmount` and `fxRate`. */
  currency?: string;
  fcAmount?: number | null;
  fxRate?: number | null;
  invoiceDate?: string | null;
};

export type InvoicePatch = Partial<
  Pick<InvoiceInput, 'clientName' | 'invoiceNo' | 'partnerId' | 'dueDate' | 'amountInr' | 'invoiceMonth' | 'currency' | 'fcAmount' | 'fxRate' | 'invoiceDate'>
>;

/** Mark received (Phase 9): `amount` is the INR credited; `receivedFc` the foreign amount that arrived. */
export type ReceiptInput = {
  paidOn: string;
  amount: number;
  part?: boolean;
  receivedFc?: number | null;
  /** TDS the client deducted from an INR invoice; it settles the balance along with `amount`. */
  tdsInr?: number | null;
};
