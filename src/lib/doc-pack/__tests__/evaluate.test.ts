import { describe, expect, it } from 'vitest';

import { attachedAtFromStoragePath, evaluateDocPack } from '@/lib/doc-pack/evaluate';
import { DRAFT_BR, FINALIZED_BR, director, fullState } from '@/lib/doc-pack/__tests__/fixtures';
import { repeatFieldId } from '@/lib/checklist/checklist-repeat';

const NR = director('e1', 'no', 'Alpha');
const RESIDENT = director('e2', 'yes', 'Beta');

describe('evaluateDocPack', () => {
  it('empty state: nothing ready, BR waiting on finalize, everything else waiting on directors', () => {
    const summary = evaluateDocPack({ state: {}, brRow: null });
    expect(summary.counts.ready).toBe(0);
    const br = summary.items.find((i) => i.docId === 'board-resolution');
    expect(br?.status).toBe('waiting-release');
    expect(br?.blockedBy?.gate).toBe('br-finalized');
    expect(br?.blockedBy?.stepId).toBe('pre-2');
    // No directors → no per-director items; company docs wait on acceptance.
    expect(summary.items.filter((i) => i.directorIndex !== undefined)).toHaveLength(0);
    for (const item of summary.items.filter((i) => i.docId !== 'board-resolution')) {
      expect(item.status).toBe('waiting-release');
      expect(item.blockedBy?.gate).toBe('directors-accepted');
      expect(item.blockedBy?.stepId).toBe('pre-15');
    }
  });

  it('BR draft vs finalized flips only the BR item', () => {
    const state = fullState([NR, RESIDENT]);
    const withDraft = evaluateDocPack({ state, brRow: DRAFT_BR });
    const withFinal = evaluateDocPack({ state, brRow: FINALIZED_BR });

    const brDraft = withDraft.items.find((i) => i.docId === 'board-resolution');
    const brFinal = withFinal.items.find((i) => i.docId === 'board-resolution');
    expect(brDraft?.status).toBe('waiting-release');
    expect(brFinal?.status).toBe('ready');
    expect(brFinal?.source).toBe('attached');
    expect(brFinal?.attachedAt).toBe(FINALIZED_BR.finalizedAt);

    const others = (s: typeof withDraft) =>
      s.items.filter((i) => i.docId !== 'board-resolution').map((i) => [i.key, i.status]);
    expect(others(withDraft)).toEqual(others(withFinal));
  });

  it('a full engagement is fully ready', () => {
    const summary = evaluateDocPack({ state: fullState([NR, RESIDENT]), brRow: FINALIZED_BR });
    const notReady = summary.items.filter((i) => i.status !== 'ready');
    expect(notReady.map((i) => [i.key, i.missing, i.blockedBy])).toEqual([]);
    expect(summary.total).toBe(summary.counts.ready);
    expect(summary.skippedDirectors).toEqual([]);
  });

  it('director 2 missing PAN → only director-2 items need inputs', () => {
    const resident = director('e2', 'yes', 'Beta', { panNumber: '' });
    const summary = evaluateDocPack({ state: fullState([NR, resident]), brRow: FINALIZED_BR });

    const d1 = summary.items.filter((i) => i.directorIndex === 1);
    const d2 = summary.items.filter((i) => i.directorIndex === 2);
    expect(d1.length).toBeGreaterThan(0);
    expect(d1.every((i) => i.status === 'ready')).toBe(true);
    expect(d2.map((i) => i.docId).sort()).toEqual(['deposit-declaration', 'dir-2', 'dir-8', 'inc-9']);
    // The deposit declaration does not print a PAN.
    expect(d2.find((i) => i.docId === 'deposit-declaration')?.status).toBe('ready');
    for (const item of d2.filter((i) => i.docId !== 'deposit-declaration')) {
      expect(item.status).toBe('needs-inputs');
      expect(item.missing).toEqual([
        { key: 'director.2.pan', label: 'PAN', stepId: 'pre-15', tabId: 'directors', directorIndex: 2 },
      ]);
    }
    // Company docs are untouched by a resident director's PAN.
    expect(summary.items.filter((i) => i.audience === 'company').every((i) => i.status === 'ready')).toBe(true);
  });

  it('PAN undertaking is produced for the non-resident director only', () => {
    const summary = evaluateDocPack({ state: fullState([NR, RESIDENT]), brRow: FINALIZED_BR });
    const pan = summary.items.filter((i) => i.docId === 'pan-undertaking');
    expect(pan).toHaveLength(1);
    expect(pan[0]?.audience).toBe('non-resident');
    expect(pan[0]?.key).toBe('pan-undertaking:non-resident');
  });

  it('a second resident director gets their own forms under resident-2', () => {
    const third = director('e3', 'yes', 'Gamma');
    const summary = evaluateDocPack({ state: fullState([NR, RESIDENT, third]), brRow: FINALIZED_BR });
    const items = summary.items.filter((i) => i.directorIndex === 3);
    expect(items.map((i) => i.key).sort()).toEqual([
      'deposit-declaration:resident-2',
      'dir-2:resident-2',
      'dir-8:resident-2',
      'inc-9:resident-2',
    ]);
    expect(summary.skippedDirectors).toEqual([]);
  });

  it('a director without a residency is reported as skipped, not invented', () => {
    const third = director('e3', '', 'Gamma');
    const summary = evaluateDocPack({ state: fullState([NR, RESIDENT, third]), brRow: FINALIZED_BR });
    expect(summary.items.filter((i) => i.directorIndex === 3)).toHaveLength(0);
    expect(summary.skippedDirectors).toEqual([
      expect.objectContaining({ index: 3, displayName: 'Gamma Director', reason: 'Resident status not set' }),
    ]);
  });

  it('without a non-resident director the letters point at the directors step', () => {
    const summary = evaluateDocPack({
      state: fullState([director('e1', 'yes', 'Alpha'), RESIDENT]),
      brRow: FINALIZED_BR,
    });
    const letter = summary.items.find((i) => i.docId === 'acceptance-letter');
    expect(letter?.status).toBe('needs-inputs');
    expect(letter?.missing).toEqual([
      { key: 'directors.nonResident', label: 'A non-resident director', stepId: 'pre-15', tabId: 'directors' },
    ]);
  });

  it('directors not accepted → incorp docs wait on release with a link to pre-15', () => {
    const summary = evaluateDocPack({
      state: fullState([NR, RESIDENT], { accepted: false }),
      brRow: FINALIZED_BR,
    });
    const dir2 = summary.items.find((i) => i.key === 'dir-2:non-resident');
    expect(dir2?.status).toBe('waiting-release');
    expect(dir2?.blockedBy).toEqual({
      gate: 'directors-accepted',
      label: 'Waiting for the proposed directors to be accepted',
      stepId: 'pre-15',
    });
    expect(summary.items.find((i) => i.docId === 'board-resolution')?.status).toBe('ready');
  });

  it('an attached Pre-7 file wins even when inputs are missing', () => {
    const resident = director('e2', 'yes', 'Beta', { panNumber: '' });
    const path = '00000000-0000-4000-8000-000000000000/residentDirectorDir2DraftUrl/1756720000000-dir-2.docx';
    const summary = evaluateDocPack({
      state: fullState([NR, resident], { pre7: { residentDirectorDir2DraftUrl: path } }),
      brRow: FINALIZED_BR,
    });
    const dir2 = summary.items.find((i) => i.key === 'dir-2:resident');
    expect(dir2?.status).toBe('ready');
    expect(dir2?.source).toBe('attached');
    expect(dir2?.storagePath).toBe(path);
    expect(dir2?.attachedAt).toBe(new Date(1756720000000).toISOString());
    expect(summary.items.find((i) => i.key === 'dir-8:resident')?.status).toBe('needs-inputs');
  });

  it('missing company inputs link to the right step and tab', () => {
    const state = fullState([NR, RESIDENT]);
    state['pre-14'] = { status: 'not-started', responses: {} };
    state['pre-5'] = { status: 'not-started', responses: {} };
    state['pre-1'] = { status: 'in-progress', responses: { ...state['pre-1']!.responses, proposedName1: '' } };
    const summary = evaluateDocPack({ state, brRow: FINALIZED_BR, engagement: { companyName: '' } });
    const moa = summary.items.find((i) => i.docId === 'moa');
    expect(moa?.status).toBe('needs-inputs');
    expect(moa?.missing).toEqual([
      { key: 'company.name', label: 'Approved company name', stepId: 'pre-5', tabId: 'name-approval' },
      {
        key: 'company.registeredOffice',
        label: 'Registered office address',
        stepId: 'pre-14',
        tabId: 'registered-office',
      },
      {
        key: 'company.registeredOfficeState',
        label: 'State of the registered office',
        stepId: 'pre-14',
        tabId: 'registered-office',
      },
    ]);
  });

  it('legacy engagements link director inputs to pre-6', () => {
    const state = fullState([]);
    state['pre-15'] = { status: 'not-started', responses: {} };
    state['pre-1'] = {
      status: 'completed',
      responses: {
        ...state['pre-1']!.responses,
        directorCount: '2',
        director1FirstName: 'Alpha',
        director1LastName: 'Director',
        director1IndiaResident: 'no',
        director2FirstName: 'Beta',
        director2LastName: 'Director',
        director2IndiaResident: 'yes',
      },
    };
    state['pre-6'] = {
      status: 'completed',
      reviewStatus: 'accepted',
      responses: {
        nrDirectorFirstName: 'Alpha',
        nrDirectorLastName: 'Director',
        residentDirectorFirstName: 'Beta',
        residentDirectorLastName: 'Director',
      },
    };
    const summary = evaluateDocPack({ state, brRow: FINALIZED_BR });
    const inc9 = summary.items.find((i) => i.key === 'inc-9:resident');
    expect(inc9?.status).toBe('needs-inputs');
    expect(inc9?.missing.every((m) => m.stepId === 'pre-6' && m.tabId === undefined)).toBe(true);
    expect(inc9?.sourceStepIds).toContain('pre-6');
  });
});

describe('answers that replaced hardcoded values', () => {
  it('a non-resident who has not answered the new questions blocks only their own documents', () => {
    const nr = director('e1', 'no', 'Alpha', { nationality: '', signingPlace: '', residenceProofType: '' });
    const summary = evaluateDocPack({ state: fullState([nr, RESIDENT]), brRow: FINALIZED_BR });
    const dir2 = summary.items.find((i) => i.key === 'dir-2:non-resident');
    expect(dir2?.missing.map((m) => m.key)).toEqual([
      'director.1.signingPlace',
      'director.1.nationality',
      'director.1.residenceProofType',
    ]);
    expect(dir2?.missing.every((m) => m.stepId === 'pre-15' && m.tabId === 'directors')).toBe(true);
    expect(summary.items.find((i) => i.key === 'inc-9:non-resident')?.missing.map((m) => m.key)).toEqual([
      'director.1.signingPlace',
    ]);
    expect(summary.items.find((i) => i.key === 'dir-2:resident')?.status).toBe('ready');
  });

  it('the parent country and the witness point at Pre-1 and Pre-7', () => {
    const state = fullState([NR, RESIDENT]);
    state['pre-1'] = { status: 'completed', responses: { ...state['pre-1']!.responses, parentEntityCountry: '' } };
    state['pre-7'] = { status: 'in-progress', responses: {} };
    const summary = evaluateDocPack({ state, brRow: FINALIZED_BR });
    expect(summary.items.find((i) => i.docId === 'authorisation-letter')?.missing).toEqual([
      { key: 'parent.country', label: 'Parent entity country of incorporation', stepId: 'pre-1', tabId: 'foreign-entity-details' },
    ]);
    const sheet = summary.items.find((i) => i.docId === 'moa-subscription-sheet');
    expect(sheet?.missing.map((m) => [m.key, m.stepId, m.tabId])).toEqual([
      ['witness.name', 'pre-7', 'draft-incorporation-docs'],
      ['witness.address', 'pre-7', 'draft-incorporation-docs'],
      ['witness.occupation', 'pre-7', 'draft-incorporation-docs'],
    ]);
  });
});

describe('independent companies', () => {
  const ENGAGEMENT = { companyName: 'Test Company Private Limited', ownershipType: 'independent' as const };

  function independentState(subscribers: Array<{ id: string; name: string; shares: string }>) {
    const state = fullState([director('e1', 'yes', 'Alpha'), RESIDENT]);
    const { parentEntityName: _n, parentEntityAddress: _a, parentEntityCountry: _c, ...company } =
      state['pre-1']!.responses as Record<string, string>;
    state['pre-1'] = { status: 'completed', responses: company };
    const pre16: Record<string, string> = { subscribers: subscribers.map((s) => s.id).join(',') };
    for (const s of subscribers) {
      pre16[repeatFieldId('subscribers', s.id, 'type')] = 'individual';
      pre16[repeatFieldId('subscribers', s.id, 'name')] = s.name;
      pre16[repeatFieldId('subscribers', s.id, 'shares')] = s.shares;
    }
    state['pre-16'] = { status: 'completed', responses: pre16 };
    return state;
  }

  it('no board resolution or parent letters, and no parent-field blockers', () => {
    const state = independentState([
      { id: 's1', name: 'Alpha Director', shares: '5000' },
      { id: 's2', name: 'Beta Director', shares: '5000' },
    ]);
    const summary = evaluateDocPack({ state, brRow: null, engagement: ENGAGEMENT });
    const ids = new Set(summary.items.map((i) => i.docId));
    expect(ids.has('board-resolution')).toBe(false);
    expect(ids.has('authorisation-letter')).toBe(false);
    expect(ids.has('acceptance-letter')).toBe(false);
    expect(ids.has('moa-subscription-sheet')).toBe(true);
    expect(summary.items.flatMap((i) => i.missing).filter((m) => m.key.startsWith('parent.'))).toEqual([]);
    expect(summary.counts['needs-inputs']).toBe(0);
    expect(summary.total).toBe(summary.counts.ready);
  });

  it('subscription sheets ask for Pre-16 subscribers who are proposed directors', () => {
    const empty = evaluateDocPack({ state: independentState([]), brRow: null, engagement: ENGAGEMENT });
    expect(empty.items.find((i) => i.docId === 'moa-subscription-sheet')?.missing).toEqual([
      {
        key: 'subscribers.any',
        label: 'Subscribers to the memorandum and the shares each takes',
        stepId: 'pre-16',
        tabId: 'subscribers',
      },
    ]);

    const stranger = evaluateDocPack({
      state: independentState([{ id: 's1', name: 'Someone Else', shares: '' }]),
      brRow: null,
      engagement: ENGAGEMENT,
    });
    expect(stranger.items.find((i) => i.docId === 'aoa-subscription-sheet')?.missing.map((m) => m.key)).toEqual([
      'subscriber.1.director',
      'subscriber.1.shares',
    ]);
  });
});

describe('attachedAtFromStoragePath', () => {
  it('reads the epoch prefix Pre-7 writes', () => {
    expect(attachedAtFromStoragePath('u/f/1756720000000-dir-2.docx')).toBe(
      new Date(1756720000000).toISOString(),
    );
    expect(attachedAtFromStoragePath('u/board-resolution.docx')).toBeUndefined();
  });
});
