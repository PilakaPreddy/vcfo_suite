/**
 * Home journey (client portal) — the pure tree behind the journey tracker.
 *
 * It folds the incorporation step model, the registration rows and the
 * compliance filings into three roots (Incorporation, Registration,
 * Compliance), four tracker stops, and the path to the client's current leaf.
 * No React and no fetch: every value comes from the inputs.
 */
import type { PortalIncorporationModel, PortalPhase, PortalStep } from '@/lib/client-portal/step-model';
import type { HomeFiling } from '@/lib/client/client-home';
import { AREA_NAME, AREA_ORDER, REG_CATS, bucketOf, dShort, filingName, groupOf, type RegRow } from '../derive';

export type JStatus = 'done' | 'active' | 'waiting' | 'late' | 'up';
export type JKind = 'stage' | 'group' | 'step' | 'filing';

export interface JNode {
  /** Stable: 'inc','pre','spice-a','spice-b','post','reg','reg-cat-Tax','comp','comp-area-GST', step ids, filing ids. */
  id: string;
  label: string;
  kind: JKind;
  status: JStatus;
  /** Finished leaves under this node (a leaf: 1 or 0). */
  done: number;
  /** Leaves under this node (a leaf: 1). */
  total: number;
  /** For step leaves (opens stepHref). */
  stepId?: string;
  /** For phase-backed groups. */
  phaseNo?: number;
  /** Step number. */
  n?: number;
  owner?: 'client' | 'sbc' | 'mca';
  due?: string;
  doneOn?: string;
  /** Short line, e.g. 'Waiting on you', 'Due 18 Nov', 'Filed 2 Oct'. */
  note?: string;
  /** The MCA service request number the firm recorded on the step (any response field ending in `Srn`). */
  srn?: string;
  children: JNode[];
}

/** The 4 tracker stops, in order: Incorporation (= node 'pre'), Post-incorporation ('post'), Registration ('reg'), Compliance ('comp'). */
export interface JStop {
  id: 'pre' | 'post' | 'reg' | 'comp';
  label: string;
  status: JStatus;
  done: number;
  total: number;
  rootId: 'inc' | 'reg' | 'comp';
}

export interface Journey {
  /** [inc, reg, comp]; inc.children = [pre, post]; pre.children = [spice-a, spice-b]. */
  roots: JNode[];
  stops: JStop[];
  currentStopId: JStop['id'];
  /** Node ids from the root to the current leaf, e.g. ['inc','post','post-3']. */
  currentPath: string[];
  byId: Record<string, JNode>;
}

/** done→done; late and not done→late; you→waiting; prog|with→active; else up. */
export function stepStatus(s: PortalStep): JStatus {
  if (s.kind === 'done') return 'done';
  if (s.late) return 'late';
  if (s.kind === 'you') return 'waiting';
  if (s.kind === 'prog' || s.kind === 'with') return 'active';
  return 'up';
}

function stepNote(s: PortalStep, status: JStatus): string | undefined {
  switch (status) {
    case 'done':
      return s.doneOn ? `Done ${dShort(s.doneOn)}` : 'Done';
    case 'late':
      return s.due ? `Overdue · due ${dShort(s.due)}` : 'Overdue';
    case 'waiting':
      return 'Waiting on you';
    case 'active':
      if (s.kind === 'prog') return 'In progress';
      return s.owner === 'mca' ? 'With MCA' : 'With SBC';
    default:
      return s.due ? `Due ${dShort(s.due)}` : undefined;
  }
}

/** The first non-empty response whose field id ends in `Srn` (`inc22Srn`, `mgt4Srn`, ...). */
export function srnOf(s: PortalStep): string | undefined {
  const r = s.slice?.responses;
  if (!r) return undefined;
  for (const [k, v] of Object.entries(r)) {
    if (/srn$/i.test(k) && typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function stepLeaf(s: PortalStep, label: string = s.title): JNode {
  const status = stepStatus(s);
  const srn = srnOf(s);
  return {
    id: s.id,
    label,
    kind: 'step',
    status,
    done: status === 'done' ? 1 : 0,
    total: 1,
    stepId: s.id,
    n: s.n,
    owner: s.owner,
    due: s.due,
    doneOn: s.doneOn,
    note: stepNote(s, status),
    ...(srn ? { srn } : {}),
    children: [],
  };
}

const FILING_STATUS = { filed: 'done', overdue: 'late', dueSoon: 'waiting', upcoming: 'up' } as const;

function filingLeaf(f: HomeFiling, today: string): JNode {
  const status: JStatus = FILING_STATUS[bucketOf(f, today)];
  const filed = status === 'done';
  return {
    id: f.id,
    label: filingName(f),
    kind: 'filing',
    status,
    done: filed ? 1 : 0,
    total: 1,
    owner: f.owner === 'client' ? 'client' : f.owner === 'firm' ? 'sbc' : undefined,
    due: f.dueDate,
    doneOn: f.filedOn,
    note: filed ? (f.filedOn ? `Filed ${dShort(f.filedOn)}` : 'Filed') : `Due ${dShort(f.dueDate)}`,
    children: [],
  };
}

function leafStatuses(node: JNode, out: JStatus[] = []): JStatus[] {
  if (!node.children.length) {
    if (node.kind === 'step' || node.kind === 'filing') out.push(node.status);
    return out;
  }
  for (const c of node.children) leafStatuses(c, out);
  return out;
}

/** All leaves done → done; any late → late; any waiting → waiting; any active or some done → active; else up. */
function rollUp(statuses: JStatus[]): JStatus {
  if (!statuses.length) return 'up';
  if (statuses.every((s) => s === 'done')) return 'done';
  if (statuses.includes('late')) return 'late';
  if (statuses.includes('waiting')) return 'waiting';
  if (statuses.includes('active') || statuses.includes('done')) return 'active';
  return 'up';
}

function group(id: string, label: string, kind: JKind, children: JNode[], phaseNo?: number): JNode {
  const node: JNode = {
    id,
    label,
    kind,
    status: 'up',
    done: children.reduce((a, c) => a + c.done, 0),
    total: children.reduce((a, c) => a + c.total, 0),
    children,
  };
  if (phaseNo != null) node.phaseNo = phaseNo;
  node.status = rollUp(leafStatuses(node));
  return node;
}

function phaseGroup(id: string, label: string, phase: PortalPhase | undefined, fallbackNo: number): JNode {
  return group(id, label, 'group', (phase?.steps ?? []).map((s) => stepLeaf(s)), phase?.no ?? fallbackNo);
}

export function buildJourney(input: { model: PortalIncorporationModel; regs: RegRow[]; filings: HomeFiling[]; today: string }): Journey {
  const { model, regs, filings, today } = input;
  const phases = model.phases;

  const spiceA = phaseGroup('spice-a', 'SPICe+ Part A · Name', phases[0], 1);
  const spiceB = phaseGroup('spice-b', 'SPICe+ Part B · Company', phases[1], 2);
  const pre = group('pre', 'Pre-incorporation', 'stage', [spiceA, spiceB]);
  const post = phaseGroup('post', 'Post-incorporation', phases[2], 3);
  post.kind = 'stage';
  const inc = group('inc', 'Incorporation', 'stage', [pre, post]);

  const regGroups = REG_CATS.map((cat) => {
    const rows = regs.filter((r) => r.cat === cat);
    return rows.length ? group(`reg-cat-${cat}`, cat, 'group', rows.map((r) => stepLeaf(r.step, r.name))) : null;
  }).filter((g): g is JNode => g != null);
  const reg = group('reg', 'Registration', 'stage', regGroups, phases[3]?.no ?? 4);

  const areaGroups = AREA_ORDER.map((area) => {
    const rows = filings.filter((f) => groupOf(f) === area);
    return rows.length ? group(`comp-area-${area}`, AREA_NAME[area], 'group', rows.map((f) => filingLeaf(f, today))) : null;
  }).filter((g): g is JNode => g != null);
  const comp = group('comp', 'Compliance', 'stage', areaGroups);

  const roots = [inc, reg, comp];

  const byId: Record<string, JNode> = {};
  const parent: Record<string, string | undefined> = {};
  const walk = (node: JNode, up?: string) => {
    byId[node.id] = node;
    parent[node.id] = up;
    for (const c of node.children) walk(c, node.id);
  };
  for (const r of roots) walk(r);

  // The current leaf: the model's current step, else the first open step, else the first open filing.
  let leafId: string | undefined;
  if (model.current && byId[model.current.id]) leafId = model.current.id;
  if (!leafId) leafId = model.steps.find((s) => s.kind !== 'done' && byId[s.id])?.id;
  if (!leafId) leafId = filings.find((f) => bucketOf(f, today) !== 'filed' && byId[f.id])?.id;

  const currentPath: string[] = [];
  for (let id = leafId; id; id = parent[id]) currentPath.unshift(id);

  const stopOf = (path: string[]): JStop['id'] => {
    if (path.includes('pre')) return 'pre';
    if (path.includes('post')) return 'post';
    if (path[0] === 'reg') return 'reg';
    return 'comp';
  };
  const currentStopId: JStop['id'] = leafId ? stopOf(currentPath) : 'comp';
  if (!leafId) currentPath.push('comp');

  const stop = (id: JStop['id'], label: string, node: JNode, rootId: JStop['rootId']): JStop => ({
    id,
    label,
    status: node.status,
    done: node.done,
    total: node.total,
    rootId,
  });
  const stops: JStop[] = [
    stop('pre', 'Incorporation', pre, 'inc'),
    stop('post', 'Post-incorporation', post, 'inc'),
    stop('reg', 'Registration', reg, 'reg'),
    stop('comp', 'Compliance', comp, 'comp'),
  ];

  return { roots, stops, currentStopId, currentPath, byId };
}
