/**
 * Documents page view-model: the prototype's flat node list
 * (`[id, parent, label, type, status, …]`, docs_a_refined.dc.html:260-287)
 * built from the real `DocNode`s and the shared step model.
 */
import type { CSSProperties } from 'react';
import type { PortalIncorporationModel } from '@/lib/client-portal/step-model';
import { DOC_CATEGORIES, OTHER_PHASE_ID, OTHER_PHASE_TITLE, type DocNode, type DocStatus } from '@/lib/client-portal/documents';
import { fileTag, longDate, dayMonth, TAG_STYLE, TAG_TIP, type FileTag } from './file-types';

export type View = 0 | 1; // 0 = By step, 1 = By category

export interface TFolder {
  kind: 'folder';
  id: string;
  parent: string | null;
  label: string;
  level: 'phase' | 'step' | 'cat';
  stepId?: string;
  phaseId?: string;
  /** Zip folder key for the API. */
  zipKey: string;
}

interface TFile {
  kind: 'file';
  id: string;
  parent: string;
  node: DocNode;
}

export type TEntry = TFolder | TFile;

const OTHER_STEP_ID = 'other-files';

export function buildEntries(nodes: DocNode[], model: PortalIncorporationModel, view: View): TEntry[] {
  const out: TEntry[] = [];
  const order = (list: DocNode[]) => [...list.filter((n) => n.status !== 'Missing'), ...list.filter((n) => n.status === 'Missing')];
  if (view === 1) {
    for (const c of DOC_CATEGORIES) {
      const files = order(nodes.filter((n) => n.categoryId === c.id));
      if (!files.length) continue;
      out.push({ kind: 'folder', id: `c:${c.id}`, parent: null, label: c.name, level: 'cat', zipKey: `cat:${c.id}` });
      for (const f of files) out.push({ kind: 'file', id: f.id, parent: `c:${c.id}`, node: f });
    }
    return out;
  }
  const byStep = new Map<string, DocNode[]>();
  const other: DocNode[] = [];
  for (const n of nodes) {
    if (n.stepId && model.byId[n.stepId]) {
      const list = byStep.get(n.stepId) ?? [];
      list.push(n);
      byStep.set(n.stepId, list);
    } else other.push(n);
  }
  for (const phase of model.phases) {
    const steps = phase.steps.filter((s) => byStep.has(s.id));
    if (!steps.length) continue;
    const pid = `p:${phase.id}`;
    out.push({ kind: 'folder', id: pid, parent: null, label: phase.title, level: 'phase', phaseId: phase.id, zipKey: `phase:${phase.id}` });
    for (const s of steps) {
      const sid = `s:${s.id}`;
      out.push({ kind: 'folder', id: sid, parent: pid, label: `${s.n} · ${s.title}`, level: 'step', stepId: s.id, phaseId: phase.id, zipKey: `step:${s.id}` });
      for (const f of order(byStep.get(s.id)!)) out.push({ kind: 'file', id: f.id, parent: sid, node: f });
    }
  }
  if (other.length) {
    const pid = `p:${OTHER_PHASE_ID}`;
    out.push({ kind: 'folder', id: pid, parent: null, label: OTHER_PHASE_TITLE, level: 'phase', phaseId: OTHER_PHASE_ID, zipKey: `phase:${OTHER_PHASE_ID}` });
    const sid = `s:${OTHER_STEP_ID}`;
    out.push({ kind: 'folder', id: sid, parent: pid, label: 'Requested and shared files', level: 'step', phaseId: OTHER_PHASE_ID, zipKey: `phase:${OTHER_PHASE_ID}` });
    for (const f of order(other)) out.push({ kind: 'file', id: f.id, parent: sid, node: f });
  }
  return out;
}

export type StatusClass = 'ok' | 'rv' | 'ms' | 'x';
export function statusClass(st: DocStatus): StatusClass {
  return st === 'Approved' || st === 'Final' ? 'ok' : st === 'In review' ? 'rv' : st === 'Missing' ? 'ms' : 'x';
}

/* Status tones (R-13): done green, in review blurple, replaced grey, missing amber. Soft fills
   with coloured text; no white text on a solid colour. */
const OK_TONE: CSSProperties = { background: 'oklch(var(--positive-soft))', color: 'oklch(var(--positive))' };
const STATUS_STYLE: Record<DocStatus, CSSProperties> = {
  Approved: OK_TONE,
  Final: OK_TONE,
  'In review': { background: 'oklch(var(--brand-soft))', color: 'oklch(var(--brand-text))' },
  Replaced: { background: 'oklch(var(--upcoming-soft))', color: 'oklch(var(--upcoming))' },
  Missing: { background: 'oklch(var(--warning-soft))', color: 'oklch(var(--warning))' },
};

/** Tone of the shared status chip for a document status. */
export const STATUS_TONE: Record<DocStatus, 'ok' | 'prog' | 'idle' | 'warn'> = {
  Approved: 'ok',
  Final: 'ok',
  'In review': 'prog',
  Replaced: 'idle',
  Missing: 'warn',
};

/** Status glyphs (rule 18) on a soft square: [tone, fill path, stroke path]. The icon draws in currentColor. */
const GLYPH: Record<'done' | 'sbc' | 'you' | 'late' | 'now', [CSSProperties, string, string]> = {
  done: [OK_TONE, '', 'M6.5 12.5l3.8 3.8 7.2-8'],
  sbc: [{ background: 'oklch(var(--brand-soft))', color: 'oklch(var(--brand-text))' }, '', 'M5.5 16l4.5-4.5 3 3 5.5-6 M14.5 8.5h4v4'],
  you: [{ background: 'oklch(var(--warning-soft))', color: 'oklch(var(--warning))' }, '', 'M12 4.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7Z M5 20a7 7 0 0 1 14 0'],
  late: [{ background: 'oklch(var(--danger-soft))', color: 'oklch(var(--danger))' }, '', 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17Z M12 8v4.5 M12 16h.01'],
  now: [{ background: 'oklch(var(--info-soft))', color: 'oklch(var(--info))' }, '', 'M12 6.5v6l3.5 2'],
};

function glyphKey(n: DocNode): keyof typeof GLYPH {
  if (n.status === 'In review') return 'sbc';
  if (n.status === 'Missing') return n.overdue ? 'late' : 'you';
  return 'done';
}

function statusTip(n: DocNode, company: string): string {
  const d = longDate(n.date);
  switch (n.status) {
    case 'Approved':
      return `Done · approved ${d}`;
    case 'Final':
      return n.fromSbc ? `Done · from SBC ${d}` : `Done · from ${company} ${d}`;
    case 'In review':
      return `With SBC · in review since ${d}`;
    case 'Missing':
      if (n.overdue) return `Late · was due ${d}`;
      return n.due ? `Waiting on ${company} · due ${d}` : `Waiting on ${company}`;
    default:
      return n.status;
  }
}

export function missingLabel(n: Pick<DocNode, 'overdue' | 'due'>): string {
  if (n.overdue) return 'Overdue';
  return n.due ? `Due ${dayMonth(n.due)}` : 'Requested';
}

function missingStyle(n: Pick<DocNode, 'overdue'>): CSSProperties {
  return n.overdue ? { background: 'oklch(var(--danger-soft))', color: 'oklch(var(--danger))' } : { background: 'oklch(var(--warning-soft))', color: 'oklch(var(--warning))' };
}

function tagOf(n: DocNode): FileTag {
  return fileTag(n.fileName, n.contentType);
}

export function tagStyle(n: DocNode): CSSProperties {
  return TAG_STYLE[tagOf(n)];
}

/** The drill-down's file marks. VCFO Spectrum draws every file mark as the soft R-26 badge. */
export function solidTagStyle(n: DocNode): CSSProperties {
  return tagStyle(n);
}

export function tagTip(n: DocNode): string {
  return TAG_TIP[tagOf(n)];
}

export function tagText(n: DocNode): string {
  const t = tagOf(n);
  return t === 'FILE' ? 'FILE' : t;
}

/**
 * The engagement a staff member is viewing in the shared Documents explorer; null for a client,
 * whose own engagement the server always uses.
 * shortcut: one explorer is on screen at a time, so this is module state; use a React context if
 * two explorers ever render side by side.
 */
let viewingEngagement: string | null = null;
export function setViewingEngagement(id: string | null) {
  viewingEngagement = id;
}
/** `&engagement=<id>` for staff, empty for a client. */
export function engagementParam(): string {
  return viewingEngagement ? `&engagement=${encodeURIComponent(viewingEngagement)}` : '';
}

export function fileUrl(ref: string, download = false): string {
  return `/api/client/documents/file?ref=${encodeURIComponent(ref)}${download ? '&dl=1' : ''}${engagementParam()}`;
}

/** Counts for a folder's progress bar (non-replaced files under it). */
export function folderCounts(files: DocNode[]): { ok: number; rv: number; ms: number; tot: number } {
  const kids = files.filter((f) => !f.replaced);
  const ok = kids.filter((f) => statusClass(f.status) === 'ok').length;
  const rv = kids.filter((f) => statusClass(f.status) === 'rv').length;
  const ms = kids.filter((f) => statusClass(f.status) === 'ms').length;
  return { ok, rv, ms, tot: ok + rv + ms };
}

/** "6 · Director KYC" → "Director KYC". */
export function stripNo(label: string): string {
  return label.replace(/^\d+ · /, '');
}

/* ---- "All documents" table filters (owner item E1) ---- */
export type DocFilter = 'all' | 'you' | 'sbc' | 'signed';

export const DOC_FILTERS: Array<{ id: DocFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'you', label: 'Waiting on you' },
  { id: 'sbc', label: 'From SBC' },
  { id: 'signed', label: 'Signed' },
];

/** Waiting on you: an open request (a missing file). From SBC: a file SBC sent. Signed: a signed copy. */
export function matchesFilter(n: Pick<DocNode, 'status' | 'fromSbc' | 'signed'>, f: DocFilter): boolean {
  switch (f) {
    case 'you':
      return n.status === 'Missing';
    case 'sbc':
      return n.fromSbc && n.status !== 'Missing';
    case 'signed':
      return Boolean(n.signed) && n.status !== 'Missing';
    default:
      return true;
  }
}

export interface TreeRow {
  e: TEntry;
  depth: number;
  open: boolean;
}

/**
 * The rows the left folder tree shows, in tree order. A file shows when `shown` passes it. A folder
 * shows when one file under it shows. A closed folder hides everything under it, except while the
 * person searches (then every folder is open).
 */
export function treeRows(entries: TEntry[], shown: (n: DocNode) => boolean, isOpen: (id: string) => boolean, searching = false): TreeRow[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const ancestors = (e: TEntry): string[] => {
    const out: string[] = [];
    let p = e.parent;
    while (p) {
      out.push(p);
      p = byId.get(p)?.parent ?? null;
    }
    return out;
  };
  const live = new Set<string>();
  for (const e of entries) if (e.kind === 'file' && shown(e.node)) for (const a of ancestors(e)) live.add(a);
  const rows: TreeRow[] = [];
  for (const e of entries) {
    const anc = ancestors(e);
    if (!searching && anc.some((a) => !isOpen(a))) continue;
    if (e.kind === 'file' ? !shown(e.node) : !live.has(e.id)) continue;
    rows.push({ e, depth: anc.length, open: searching || isOpen(e.id) });
  }
  return rows;
}
