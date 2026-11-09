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
  /** What the editor starts on when it is not the shown value, for example a labour sheet's state code. */
  editValue?: string;
  /** The editor's label when the row edits something other than its value, for example "State for pay.xlsx". */
  editLabel?: string;
  inputType: 'text' | 'date' | 'choice';
  /** The section this row sits in on a big card; see `view-groups.ts`. */
  groupKey: string;
  groupTitle: string;
  groupKind: ChangesetGroupKind;
  /** The file the row came from, so a section can gather rows by file. */
  sourceFile: string | null;
}

/** The destinations a card is split into. */
export type ChangesetGroupKind = 'values' | 'uploads' | 'labour' | 'compliance' | 'vault';

/** One section of the card: a destination, its rows in display order, and how many are ready, held or saved. */
export interface ChangesetGroupView {
  key: string;
  title: string;
  kind: ChangesetGroupKind;
  rowIds: string[];
  counts: { ready: number; held: number; applied: number };
}

export interface ChangesetView {
  id: string;
  title: string;
  /** T3 cards go outside the firm; the card names exactly who will see the result. */
  tier: 'T2' | 'T3';
  recipients: Array<{ name: string; email?: string }>;
  companyName: string;
  engagementId: string | null;
  status: ChangesetStatus;
  contentHash: string;
  expiresAt: string;
  canUndo: boolean;
  rows: ChangesetRowView[];
  /** The rows by destination, then by source file. Every row is in exactly one group. */
  groups: ChangesetGroupView[];
}
