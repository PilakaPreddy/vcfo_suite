import type { ActionTier } from '@/lib/actions/types';

/**
 * A changeset is the proposal behind a review card: one row per value, nothing saved until a
 * person approves. The approval is tied to `content_hash`, and code checks every row again at the
 * click. A sensitive value is shown only through `displayOld` and `displayNew`, which are masked.
 */
export const CHANGESET_STATUSES = [
  'proposed',
  'approved',
  'applied',
  'partly_applied',
  'rejected',
  'expired',
  'undone',
] as const;
export type ChangesetStatus = (typeof CHANGESET_STATUSES)[number];

export const CHANGESET_ROW_STATUSES = [
  'proposed',
  'accepted',
  'edited',
  'skipped',
  'held',
  'applied',
  'failed',
  'undone',
] as const;
export type ChangesetRowStatus = (typeof CHANGESET_ROW_STATUSES)[number];

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** One rule run against a row: format, step gate, ownership, conflict or validator. */
export interface RowCheck {
  rule: string;
  ok: boolean;
  message?: string;
}

/** Where a proposed value came from, so the reviewer can check it. */
export interface RowSource {
  kind: 'attachment' | 'paste' | 'message' | 'record';
  attachmentId?: string;
  page?: number;
  quote?: string;
}

export interface ChangesetRowDraft {
  /** The registered action that applies this row, for example `checklist.setResponse`. */
  action: string;
  /** That action's input, without the new value. */
  target: { [key: string]: JsonValue };
  label: string;
  oldValue: JsonValue;
  newValue: JsonValue;
  displayOld: string;
  displayNew: string;
  sensitive: boolean;
  source: RowSource | null;
  checks: RowCheck[];
  /** Set when the row cannot apply yet: a locked step, or a field another role must fill. */
  heldReason?: string;
}

export interface ChangesetRecipient {
  name: string;
  email?: string;
  role?: string;
}

export interface ChangesetDraft {
  title: string;
  tier: Extract<ActionTier, 'T2' | 'T3'>;
  /** A run is locked to one client, so one changeset never spans two engagements. */
  engagementId: string | null;
  rows: ChangesetRowDraft[];
  /** T3 only: the exact people who will see the result. */
  recipients?: ChangesetRecipient[];
}
