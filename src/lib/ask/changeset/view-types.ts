import type { ChangesetRowStatus, ChangesetStatus, RowCheck } from './types';

/** What the card shows. It never holds a raw value: only the masked `displayOld` and `displayNew`. */
export interface ChangesetRowView {
  id: string;
  stepId: string | null;
  stepTitle: string | null;
  label: string;
  displayOld: string;
  displayNew: string;
  sensitive: boolean;
  source: string | null;
  checks: RowCheck[];
  status: ChangesetRowStatus;
  heldReason: string | null;
  error: string | null;
  canDecide: boolean;
  /** Clear to accept, as far as the last check went. */
  canAccept: boolean;
  /** A saved value differs, so "Accept all" leaves this row for its own click. */
  needsLook: boolean;
  editable: boolean;
  options?: Array<{ value: string; label: string }>;
  inputType: 'text' | 'date' | 'choice';
}

export interface ChangesetView {
  id: string;
  title: string;
  companyName: string;
  engagementId: string | null;
  status: ChangesetStatus;
  contentHash: string;
  expiresAt: string;
  canUndo: boolean;
  rows: ChangesetRowView[];
}
