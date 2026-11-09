import { describe, expect, it } from 'vitest';
import type { PortalIncorporationModel, PortalPhase, PortalStep } from '@/lib/client-portal/step-model';
import type { HomeFiling } from '@/lib/client/client-home';
import type { RegCat, RegRow } from '../derive';
import { buildJourney, stepStatus } from './journey-model';

const TODAY = '2026-11-09';

type Kind = PortalStep['kind'];
type Spec = [id: string, kind: Kind, late?: boolean];

let counter = 0;
function step(phaseNo: number, [id, kind, late = false]: Spec): PortalStep {
  counter += 1;
  return {
    n: counter,
    id,
    title: `Step ${id}`,
    phaseNo,
    owner: 'sbc',
    kind,
    late,
    lateDays: late ? 3 : 0,
    due: '2026-11-18',
    doneOn: kind === 'done' ? '2026-10-02' : undefined,
  } as unknown as PortalStep;
}

/** Builds a minimal model from four phases of [id, kind, late?] specs. */
function model(specs: Spec[][], current?: string): PortalIncorporationModel {
  counter = 0;
  const phases: PortalPhase[] = specs.map((list, i) => {
    const steps = list.map((s) => step(i + 1, s));
    return { no: i + 1, id: `p${i + 1}`, name: `Phase ${i + 1}`, title: '', section: '', steps, done: 0, total: steps.length, state: 'up' } as PortalPhase;
  });
  const steps = phases.flatMap((p) => p.steps);
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  return { phases, steps, byId, current: current ? byId[current] : undefined } as unknown as PortalIncorporationModel;
}

const REG_CAT: Record<string, RegCat> = { 'reg-4': 'Tax', 'reg-1': 'Labour', 'reg-3': 'Labour', 'reg-15': 'Business' };
function regsOf(m: PortalIncorporationModel): RegRow[] {
  return m.phases[3]!.steps.map((s) => ({ step: s, name: `Reg ${s.id}`, cat: REG_CAT[s.id] ?? 'Business' }) as unknown as RegRow);
}

function filing(id: string, authority: string, dueDate: string, filedOn?: string): HomeFiling {
  return { id, title: `F ${id}`, authority, dueDate, filedOn, status: filedOn ? 'filed' : 'upcoming', owner: 'firm', hasProof: false };
}

const allDone = (ids: string[]): Spec[] => ids.map((id) => [id, 'done']);

const MID_POST = model(
  [
    allDone(['pre-1', 'pre-2']),
    allDone(['pre-11', 'pre-12']),
    [['post-1', 'done'], ['post-2', 'done'], ['post-3', 'you'], ['post-4', 'up']],
    [['reg-4', 'up'], ['reg-1', 'up'], ['reg-3', 'up'], ['reg-15', 'up']],
  ],
  'post-3',
);

describe('stepStatus', () => {
  it('maps kinds and the late overlay', () => {
    const s = (kind: Kind, late = false) => step(1, ['x', kind, late]);
    expect(stepStatus(s('done', true))).toBe('done');
    expect(stepStatus(s('with', true))).toBe('late');
    expect(stepStatus(s('you'))).toBe('waiting');
    expect(stepStatus(s('prog'))).toBe('active');
    expect(stepStatus(s('with'))).toBe('active');
    expect(stepStatus(s('next'))).toBe('up');
    expect(stepStatus(s('up'))).toBe('up');
  });
});

describe('buildJourney', () => {
  const filings = [
    filing('f-gst', 'GST', '2026-11-20'),
    filing('f-mca', 'MCA', '2026-10-30', '2026-10-02'),
    filing('f-it', 'Income tax', '2026-12-31'),
  ];
  const j = buildJourney({ model: MID_POST, regs: regsOf(MID_POST), filings, today: TODAY });

  it('builds the hierarchy with stable ids and labels', () => {
    expect(j.roots.map((r) => r.id)).toEqual(['inc', 'reg', 'comp']);
    expect(j.roots.map((r) => r.label)).toEqual(['Incorporation', 'Registration', 'Compliance']);
    const inc = j.byId.inc!;
    expect(inc.children.map((c) => c.id)).toEqual(['pre', 'post']);
    expect(j.byId.pre!.label).toBe('Pre-incorporation');
    expect(j.byId.pre!.children.map((c) => [c.id, c.label, c.phaseNo])).toEqual([
      ['spice-a', 'SPICe+ Part A · Name', 1],
      ['spice-b', 'SPICe+ Part B · Company', 2],
    ]);
    expect(j.byId.post!.label).toBe('Post-incorporation');
    expect(j.byId.post!.phaseNo).toBe(3);
    expect(j.byId.post!.children.map((c) => c.id)).toEqual(['post-1', 'post-2', 'post-3', 'post-4']);
    expect(j.byId.reg!.children.map((c) => c.id)).toEqual(['reg-cat-Tax', 'reg-cat-Labour', 'reg-cat-Business']);
    expect(j.byId['reg-cat-Labour']!.children.map((c) => [c.id, c.label, c.kind, c.stepId])).toEqual([
      ['reg-1', 'Reg reg-1', 'step', 'reg-1'],
      ['reg-3', 'Reg reg-3', 'step', 'reg-3'],
    ]);
    expect(j.byId.comp!.children.map((c) => [c.id, c.label])).toEqual([
      ['comp-area-MCA', 'MCA / ROC'],
      ['comp-area-GST', 'GST'],
      ['comp-area-Income tax', 'Income tax / TDS'],
    ]);
    const filed = j.byId['f-mca']!;
    expect([filed.kind, filed.status, filed.note]).toEqual(['filing', 'done', 'Filed 2 Oct']);
    expect(j.byId['f-gst']!.status).toBe('waiting');
    expect(j.byId['f-gst']!.note).toBe('Due 20 Nov');
    expect(j.byId['f-it']!.status).toBe('up');
    expect(j.byId['post-3']!.note).toBe('Waiting on you');
    expect(j.stops.map((s) => [s.id, s.label, s.rootId])).toEqual([
      ['pre', 'Incorporation', 'inc'],
      ['post', 'Post-incorporation', 'inc'],
      ['reg', 'Registration', 'reg'],
      ['comp', 'Compliance', 'comp'],
    ]);
  });

  it('indexes every node', () => {
    const count = (n: { children: unknown[] }): number => 1 + (n.children as (typeof n)[]).reduce((a, c) => a + count(c), 0);
    expect(Object.keys(j.byId)).toHaveLength(j.roots.reduce((a, r) => a + count(r), 0));
  });

  it('rolls counts up from the leaves', () => {
    expect([j.byId['spice-a']!.done, j.byId['spice-a']!.total]).toEqual([2, 2]);
    expect([j.byId.pre!.done, j.byId.pre!.total]).toEqual([4, 4]);
    expect([j.byId.post!.done, j.byId.post!.total]).toEqual([2, 4]);
    expect([j.byId.inc!.done, j.byId.inc!.total]).toEqual([6, 8]);
    expect([j.byId.reg!.done, j.byId.reg!.total]).toEqual([0, 4]);
    expect([j.byId.comp!.done, j.byId.comp!.total]).toEqual([1, 3]);
    expect(j.stops.map((s) => [s.done, s.total])).toEqual([[4, 4], [2, 4], [0, 4], [1, 3]]);
  });

  it('puts a mid-post-incorporation client on the post stop', () => {
    expect(j.currentStopId).toBe('post');
    expect(j.currentPath).toEqual(['inc', 'post', 'post-3']);
    expect(j.byId.pre!.status).toBe('done');
    expect(j.byId.post!.status).toBe('waiting');
    expect(j.byId.inc!.status).toBe('waiting');
    expect(j.byId.reg!.status).toBe('up');
  });

  it('falls back to the first open step when the model has no current step', () => {
    const m = model([[['pre-1', 'done'], ['pre-2', 'up']], [], [], []]);
    const out = buildJourney({ model: m, regs: [], filings: [], today: TODAY });
    expect(out.currentPath).toEqual(['inc', 'pre', 'spice-a', 'pre-2']);
    expect(out.currentStopId).toBe('pre');
  });
});

describe('group status precedence', () => {
  const statusOf = (kinds: Spec[]) => {
    const m = model([kinds, [], [], []]);
    return buildJourney({ model: m, regs: [], filings: [], today: TODAY }).byId['spice-a']!.status;
  };
  it('applies done, late, waiting, active, up in order', () => {
    expect(statusOf([['a', 'done'], ['b', 'done']])).toBe('done');
    expect(statusOf([['a', 'you'], ['b', 'with', true], ['c', 'prog']])).toBe('late');
    expect(statusOf([['a', 'prog'], ['b', 'you']])).toBe('waiting');
    expect(statusOf([['a', 'with'], ['b', 'up']])).toBe('active');
    expect(statusOf([['a', 'done'], ['b', 'up']])).toBe('active');
    expect(statusOf([['a', 'up'], ['b', 'next']])).toBe('up');
    expect(statusOf([])).toBe('up');
  });
});

describe('edge cases', () => {
  const DONE = model([allDone(['pre-1']), allDone(['pre-11']), allDone(['post-1']), allDone(['reg-4', 'reg-1'])]);

  it('moves to Compliance once every step is done', () => {
    const filings = [filing('f-1', 'MCA', '2026-10-01', '2026-09-30'), filing('f-2', 'GST', '2026-11-11')];
    const j = buildJourney({ model: DONE, regs: regsOf(DONE), filings, today: TODAY });
    expect(j.currentStopId).toBe('comp');
    expect(j.currentPath).toEqual(['comp', 'comp-area-GST', 'f-2']);
    expect(j.stops.slice(0, 3).every((s) => s.status === 'done')).toBe(true);
    expect(j.byId.comp!.status).toBe('waiting');
  });

  it('handles no filings at all', () => {
    const j = buildJourney({ model: DONE, regs: regsOf(DONE), filings: [], today: TODAY });
    const comp = j.byId.comp!;
    expect(comp.children).toEqual([]);
    expect(j.stops[3]).toMatchObject({ id: 'comp', total: 0, done: 0, status: 'up' });
    expect(j.currentStopId).toBe('comp');
    expect(j.currentPath).toEqual(['comp']);
  });

  it('marks every ancestor of a late step as late', () => {
    const m = model(
      [allDone(['pre-1']), allDone(['pre-11']), [['post-1', 'done'], ['post-2', 'you']], [['reg-4', 'done'], ['reg-1', 'with', true], ['reg-3', 'you']]],
      'post-2',
    );
    const j = buildJourney({ model: m, regs: regsOf(m), filings: [], today: TODAY });
    expect(j.byId['reg-1']!.status).toBe('late');
    expect(j.byId['reg-cat-Labour']!.status).toBe('late');
    expect(j.byId.reg!.status).toBe('late');
    expect(j.stops[2]!.status).toBe('late');
    expect(j.byId['reg-cat-Tax']!.status).toBe('done');
    expect(j.byId.post!.status).toBe('waiting');
  });

  it('marks an overdue filing and its area late', () => {
    const j = buildJourney({ model: DONE, regs: regsOf(DONE), filings: [filing('f-old', 'GST', '2026-11-01')], today: TODAY });
    expect(j.byId['f-old']!.status).toBe('late');
    expect(j.byId['comp-area-GST']!.status).toBe('late');
    expect(j.byId.comp!.status).toBe('late');
  });
});
