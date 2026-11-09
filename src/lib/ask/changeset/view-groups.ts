import { getItem } from '@/data/checklist';
import { stateByCode } from '@/data/labour-registers/states';
import type { JsonValue, RowSource } from './types';
import type { ChangesetGroupKind, ChangesetGroupView, ChangesetRowView } from './view-types';

/**
 * Where each card row lands, and the sections a big card is split into. A drop can put fifty files
 * and a hundred values on one card, so the card groups its rows by destination (checklist values,
 * checklist uploads, one labour register per state and month, compliance evidence, the vault) and,
 * inside each destination, by the file the row came from. This file is pure so it can be tested
 * without the database; `loadChangesetView` feeds it the stored rows.
 */

/** The destinations in the order the card shows them. */
const KIND_ORDER: ChangesetGroupKind[] = ['values', 'uploads', 'labour', 'compliance', 'vault'];

const KIND_TITLE: Record<Exclude<ChangesetGroupKind, 'labour'>, string> = {
  values: 'Checklist values',
  uploads: 'Checklist uploads',
  compliance: 'Compliance evidence',
  vault: 'Vault',
};

/** The section a row belongs to, read from the action that applies it. Unknown actions count as values. */
export function groupKindOf(action: string): ChangesetGroupKind {
  switch (action) {
    case 'checklist.attachFile':
      return 'uploads';
    case 'labour.uploadSheet':
      return 'labour';
    case 'compliance.attachEvidence':
      return 'compliance';
    case 'documents.fileToVault':
      return 'vault';
    default:
      return 'values';
  }
}

const text = (value: JsonValue | undefined): string => (typeof value === 'string' ? value : '');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortMonth(day: string): string | null {
  const date = new Date(`${day}T00:00:00Z`);
  if (!day || Number.isNaN(date.getTime())) return null;
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "Aug 2026" for one month, "Apr 2026 to Jun 2026" for a longer period, or the raw days. */
export function shortPeriod(from: string, to: string): string {
  const a = shortMonth(from);
  const b = shortMonth(to);
  if (!a) return [from, to].filter(Boolean).join(' to ');
  return !b || a === b ? a : `${a} to ${b}`;
}

export function stateName(code: string): string {
  return code ? (stateByCode(code.toUpperCase())?.name ?? code.toUpperCase()) : 'State not set';
}

/**
 * Why a labour row's state needs a look: it was assumed from the registered office, or the names
 * gave a state the client has not filed in before. Shared with `labour.uploadSheet`'s card text.
 */
export function labourStateNote(target: { stateAssumed?: unknown; stateNew?: unknown }): string {
  if (target.stateAssumed === true) return ' (assumed from the registered office)';
  if (target.stateNew === true) return ' (new for this client: please check)';
  return '';
}

export interface RowPlaceInput {
  action: string;
  target: { [key: string]: JsonValue };
  label: string;
  source: RowSource | null;
}

export interface RowPlace {
  kind: ChangesetGroupKind;
  /** Stable within a card: the kind, plus the state and period for a labour register. */
  groupKey: string;
  groupTitle: string;
  label: string;
  stepTitle: string | null;
  /** The file the row came from, when it came from one. */
  sourceFile: string | null;
}

/**
 * Where one row goes. File rows name the file as their label and say where it goes underneath, so a
 * long list of files reads as a list of files. `slotLabel` turns a labour slot ("paysheet") into words.
 */
export function rowPlace(row: RowPlaceInput, slotLabel: (slot: string) => string = (slot) => slot): RowPlace {
  const kind = groupKindOf(row.action);
  const sourceFile = row.source?.kind === 'attachment' ? (row.source.fileName ?? null) : null;
  const stepId = text(row.target.stepId);
  const stepTitle = stepId ? (getItem(stepId)?.title ?? stepId) : null;
  const fileLabel = sourceFile ?? row.label;
  if (kind === 'labour') {
    const code = text(row.target.stateCode).toUpperCase();
    const period = shortPeriod(text(row.target.periodFrom), text(row.target.periodTo));
    const state = stateName(code);
    const note = labourStateNote(row.target);
    return {
      kind,
      groupKey: `labour:${code}:${text(row.target.periodFrom)}:${text(row.target.periodTo)}`,
      groupTitle: `Labour register · ${state} · ${period}`,
      label: fileLabel,
      stepTitle: `${slotLabel(text(row.target.slot))} · ${state}${note} · ${period}`,
      sourceFile,
    };
  }
  if (kind === 'compliance') return { kind, groupKey: kind, groupTitle: KIND_TITLE[kind], label: fileLabel, stepTitle: row.label || 'Task deliverable', sourceFile };
  if (kind === 'vault') {
    const category = text(row.target.category) || 'Other';
    return { kind, groupKey: kind, groupTitle: KIND_TITLE[kind], label: fileLabel, stepTitle: `Vault · ${category}`, sourceFile };
  }
  return { kind, groupKey: kind, groupTitle: KIND_TITLE[kind], label: row.label, stepTitle, sourceFile };
}

type GroupableRow = Pick<ChangesetRowView, 'id' | 'status' | 'heldReason' | 'canAccept' | 'groupKey' | 'groupTitle' | 'groupKind' | 'sourceFile'>;

// The same open statuses `loadChangesetView` uses for `canAccept`.
const OPEN: ReadonlySet<string> = new Set(['proposed', 'edited', 'held', 'failed']);

/** A row that is still open counts as held when it cannot be accepted as it stands. */
export function rowCount(row: Pick<ChangesetRowView, 'status' | 'heldReason' | 'canAccept'>): 'ready' | 'held' | 'applied' | null {
  if (row.status === 'applied') return 'applied';
  if (!OPEN.has(row.status)) return null;
  return row.heldReason || row.status === 'held' || !row.canAccept ? 'held' : 'ready';
}

/**
 * The sections, in destination order. Labour registers sort by title (state, then period). Inside a
 * section the rows keep the card's order but are gathered by source file, rows without a file first.
 */
export function groupChangesetRows(rows: GroupableRow[]): ChangesetGroupView[] {
  const groups = new Map<string, ChangesetGroupView & { files: Map<string, string[]> }>();
  for (const row of rows) {
    let group = groups.get(row.groupKey);
    if (!group) {
      group = { key: row.groupKey, title: row.groupTitle, kind: row.groupKind, rowIds: [], counts: { ready: 0, held: 0, applied: 0 }, files: new Map() };
      groups.set(row.groupKey, group);
    }
    const file = row.sourceFile ?? '';
    group.files.set(file, [...(group.files.get(file) ?? []), row.id]);
    const counted = rowCount(row);
    if (counted) group.counts[counted] += 1;
  }
  return [...groups.values()]
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.kind === 'labour' ? a.key.localeCompare(b.key) : 0))
    .map(({ files, ...group }) => {
      const ordered = [...files.entries()].sort(([a], [b]) => (a === b ? 0 : a === '' ? -1 : b === '' ? 1 : 0));
      return { ...group, rowIds: ordered.flatMap(([, ids]) => ids) };
    });
}
