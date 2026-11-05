/**
 * BOARD MEETINGS — the shared model: kinds, types, statuses, agenda items and the fixed and
 * suggested agenda items per meeting type. Pure data and small helpers; no React and no db.
 *
 * Workflow (owner decisions of 2 Nov 2026, docs/specs/board-meetings/PLAN.md):
 *   lead drafts the notice → manager approves (and may edit) → VCFO emails the notice →
 *   directors reply → meeting held → lead uploads the MoM → directors sign → locked →
 *   resolutions added after the meeting (directors sign, no manager step) → carried to the
 *   next notice. A meeting is never closed by hand; it locks when the next notice is sent.
 */

const MEETING_KINDS = ['board', 'agm', 'egm'] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];

export const MEETING_TYPES = ['first', 'quarterly', 'annual', 'special'] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const MEETING_MODES = ['vc', 'in_person', 'hybrid'] as const;
export type MeetingMode = (typeof MEETING_MODES)[number];

/**
 * draft → pending_approval → approved (scheduled to send) → sent → held.
 * `cancelled` ends a meeting; `held` follows automatically once the meeting date passes.
 */
export type MeetingStatus = 'draft' | 'pending_approval' | 'approved' | 'sent' | 'held' | 'cancelled';

export const KIND_LABEL: Record<MeetingKind, string> = {
  board: 'Board meeting',
  agm: 'Annual general meeting',
  egm: 'Extraordinary general meeting',
};

export const TYPE_LABEL: Record<MeetingType, string> = {
  first: 'First board meeting',
  quarterly: 'Quarterly board meeting',
  annual: 'Annual accounts board meeting',
  special: 'Special board meeting',
};

export const MODE_LABEL: Record<MeetingMode, string> = {
  vc: 'Video conference (VC / OAVM)',
  in_person: 'In person',
  hybrid: 'In person and video conference',
};

export const STATUS_LABEL: Record<MeetingStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Waiting for approval',
  approved: 'Approved',
  sent: 'Notice sent',
  held: 'Held',
  cancelled: 'Cancelled',
};

/** One agenda point. `libraryId` is the SBC library id (BM-001) or null for the lead's own item. */
export interface AgendaItem {
  key: string;
  libraryId: string | null;
  text: string;
  /** One level of sub-points only (decision D1). */
  subs: string[];
  /** Fixed items stay at the top or the end and cannot be removed. */
  fixed?: 'top' | 'end';
}

export interface MeetingRecipient {
  kind: 'to' | 'cc';
  /** Set for a director from the company's director list. */
  directorId: string | null;
  name: string;
  email: string | null;
  /** Free label such as "Company secretary" or "Admin". */
  role: string | null;
}

/** Fixed agenda items per meeting type, as library ids (Firm settings › Agenda library). */
export const FIXED_TOP: Record<MeetingType, string[]> = {
  first: ['BM-001', 'BM-003', 'BM-002'],
  quarterly: ['BM-001', 'BM-003', 'BM-002', 'BM-005', 'BM-007'],
  annual: ['BM-001', 'BM-003', 'BM-002', 'BM-005', 'BM-007'],
  special: ['BM-001', 'BM-003', 'BM-002'],
};
export const FIXED_END: string[] = ['BM-011'];

/** Suggested items per meeting type, shown first in the agenda picker. */
export const SUGGESTED: Record<MeetingType, string[]> = {
  first: ['BM-012', 'BM-013', 'BM-014', 'BM-015', 'BM-016', 'BM-017', 'BM-019', 'BM-022', 'BM-023', 'BM-008', 'BM-009'],
  quarterly: ['BM-112', 'BM-115', 'BM-116', 'BM-117', 'BM-052', 'BM-139', 'BM-123', 'BM-124', 'BM-008', 'BM-009', 'BM-006'],
  annual: ['BM-054', 'BM-055', 'BM-056', 'BM-057', 'BM-008', 'BM-009', 'BM-112'],
  special: ['BM-025', 'BM-030', 'BM-079', 'BM-081', 'BM-083', 'BM-098'],
};

/** The agenda item that carries resolutions passed since the previous meeting (sub-points). */
export const CIRCULATION_ITEM = 'BM-007';

export function isMeetingKind(v: unknown): v is MeetingKind {
  return typeof v === 'string' && (MEETING_KINDS as readonly string[]).includes(v);
}
export function isMeetingType(v: unknown): v is MeetingType {
  return typeof v === 'string' && (MEETING_TYPES as readonly string[]).includes(v);
}
export function isMeetingMode(v: unknown): v is MeetingMode {
  return typeof v === 'string' && (MEETING_MODES as readonly string[]).includes(v);
}

/** Notice, approval and recipients may change only before the notice goes out. */
export function noticeEditable(status: MeetingStatus): boolean {
  return status === 'draft' || status === 'pending_approval';
}

