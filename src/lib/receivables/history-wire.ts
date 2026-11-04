/**
 * RECEIVABLES HISTORY WIRE (Phase 10): the JSON of the manager sheet's "What changes" list and
 * the invoice history drawer. Timestamps arrive as ISO strings.
 */

/** One row of `receivable_changes` as the manager sees it. */
export type ChangeDto = {
  id: string;
  invoiceId: string | null;
  summary: string;
  field: string | null;
  before: string | null;
  after: string | null;
  actorName: string | null;
  createdAt: string;
  /** False for a change the client page never shows (a reminder pause). */
  affectsPage: boolean;
};

/** The changes an Update would publish: every page-affecting change since the last Update. */
export type PendingChangesDto = { since: string | null; changes: ChangeDto[] };

/** One event on an invoice's history, newest first in the list. */
export type InvoiceHistoryItem =
  | { kind: 'change'; id: string; at: string; title: string; before: string | null; after: string | null; field: string | null; actorName: string | null; affectsPage: boolean; published: boolean }
  | {
      kind: 'reminder';
      id: string;
      at: string;
      forDate: string;
      reminderKind: 'before' | 'due' | 'overdue';
      status: 'queued' | 'skipped' | 'sent' | 'failed';
      channel: 'outlook' | 'email' | null;
      toEmail: string | null;
      error: string | null;
    }
  | { kind: 'note'; id: string; at: string; text: string; authorName: string; fromSbc: boolean };

export type InvoiceHistoryDto = { items: InvoiceHistoryItem[] };
