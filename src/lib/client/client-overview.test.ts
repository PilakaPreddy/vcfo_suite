import { describe, expect, it } from 'vitest';

import { getActiveCatalogItems } from '@/data/checklist';
import {
  buildCompanySnapshot,
  buildBallInCourt,
  buildDeliverables,
  buildDocumentCounts,
  buildMilestones,
  buildNextAction,
  buildProgress,
  clientStepHref,
  complianceGroupForAuthority,
  identifiersFromState,
  latestCompletedPhase,
  type ClientOverviewState,
} from '@/lib/client/client-overview';

const CATALOG = getActiveCatalogItems();

/** Mark the first `count` catalog steps sequentially complete. */
function completeFirst(count: number): ClientOverviewState {
  const state: ClientOverviewState = {};
  for (const item of CATALOG.slice(0, count)) {
    state[item.id] = { status: 'completed' };
  }
  return state;
}

describe('buildProgress', () => {
  it('reports zero and locks everything after the first step on an empty engagement', () => {
    const progress = buildProgress({});

    expect(progress.overallPct).toBe(0);
    expect(progress.done).toBe(0);
    expect(progress.total).toBe(CATALOG.length);
    expect(progress.byStatus.completed).toBe(0);
    // Only the first catalog step is open; everything after it is gated.
    expect(progress.byStatus.locked).toBe(CATALOG.length - 1);
  });

  it('returns exactly the four incorporation phases in order', () => {
    const progress = buildProgress({});

    expect(progress.byPhase.map((p) => p.id)).toEqual([
      'pre-inc-phase-1',
      'pre-inc-phase-2',
      'post-inc-phase-3',
      'registration-phase-4',
    ]);
    expect(progress.byPhase.map((p) => p.label)).toEqual([
      'SPICe+ Part A',
      'SPICe+ Part B',
      'Post-incorporation',
      'Registration',
    ]);
    expect(progress.byPhase.every((p) => p.total > 0)).toBe(true);
  });

  it('fills phase 1 to 100% once its five steps are complete', () => {
    const phaseOneSize = 5;
    const progress = buildProgress(completeFirst(phaseOneSize));

    expect(progress.byPhase[0]?.pct).toBe(100);
    expect(progress.byPhase[0]?.done).toBe(phaseOneSize);
    expect(progress.byPhase[1]?.pct).toBe(0);
    expect(progress.done).toBe(phaseOneSize);
  });

  it('counts a rejected step as awaiting the client, not as completed', () => {
    const state = completeFirst(2);
    const reopened = CATALOG[1]!.id;
    state[reopened] = { status: 'completed', reviewStatus: 'rejected', rejectionNote: 'Redo KYC' };

    const progress = buildProgress(state);

    expect(progress.done).toBe(1);
    expect(progress.byStatus.awaitingClient).toBeGreaterThan(0);
  });
});

describe('buildNextAction', () => {
  it('points at the first client-owned step on a fresh engagement', () => {
    const next = buildNextAction({});

    expect(next?.stepId).toBe('pre-1');
    expect(next?.href).toBe('/app/client/incorporation?step=pre-1');
    expect(next?.needsCorrection).toBe(false);
  });

  it('is undefined while the ball is with the firm', () => {
    // pre-1 is client-owned; pre-2 onward is the firm's, so completing pre-1
    // leaves nothing waiting on the client.
    expect(buildNextAction(completeFirst(1))).toBeUndefined();
  });

  it('surfaces the rejection note when a step came back for corrections', () => {
    const next = buildNextAction({
      'pre-1': {
        status: 'completed',
        reviewStatus: 'rejected',
        rejectionNote: '  Passport scan is unreadable.  ',
      },
    });

    expect(next?.stepId).toBe('pre-1');
    expect(next?.needsCorrection).toBe(true);
    expect(next?.correctionNote).toBe('Passport scan is unreadable.');
  });

  it('never points at a locked step', () => {
    const next = buildNextAction({});
    const index = CATALOG.findIndex((item) => item.id === next?.stepId);
    expect(index).toBe(0);
  });
});

describe('buildBallInCourt', () => {
  it('puts the opening move with the client and nothing with the firm', () => {
    expect(buildBallInCourt({})).toEqual({ waitingOnClient: 1, waitingOnFirm: 0 });
  });

  it('hands the ball to the firm once the client has submitted step one', () => {
    expect(buildBallInCourt(completeFirst(1))).toEqual({
      waitingOnClient: 0,
      waitingOnFirm: 1,
    });
  });

  it('ignores locked steps entirely', () => {
    const { waitingOnClient, waitingOnFirm } = buildBallInCourt({});
    expect(waitingOnClient + waitingOnFirm).toBeLessThan(CATALOG.length);
  });
});

describe('buildDeliverables', () => {
  it('is empty until a certificate is actually on file', () => {
    expect(buildDeliverables({})).toEqual([]);
  });

  it('surfaces the COI, PAN card, and GST certificate from real storage paths', () => {
    const deliverables = buildDeliverables({
      'pre-12': {
        status: 'completed',
        deliveredToClientAt: '2026-04-02T10:00:00.000Z',
        responses: {
          certificateOfIncorporationFinalUrl: 'eng/coi/1-coi.pdf',
          panCardFinalUrl: 'eng/pan/1-pan.pdf',
        },
      },
      'reg-4': {
        status: 'completed',
        responses: { gstCertificateUrl: 'eng/gst/1-gst.pdf' },
      },
    });

    expect(deliverables.map((d) => d.name)).toEqual([
      'Certificate of Incorporation',
      'PAN card',
      'GST certificate',
    ]);
    expect(deliverables[0]?.storagePath).toBe('eng/coi/1-coi.pdf');
    expect(deliverables[0]?.issuedAt).toBe('2026-04-02T10:00:00.000Z');
  });

  it('never lists a board-resolution draft', () => {
    const deliverables = buildDeliverables({
      'pre-8': {
        status: 'completed',
        responses: {
          boardResolutionSignedForIncorpUrl: 'eng/br/1-br.pdf',
          moaSubscriptionSheetSignedUrl: 'eng/moa/1-moa.pdf',
        },
      },
    });

    expect(deliverables.map((d) => d.name)).toEqual(['Memorandum of Association']);
  });
});

describe('buildDocumentCounts', () => {
  it('counts the open client step as requested and nothing as submitted', () => {
    expect(buildDocumentCounts({}, 0)).toEqual({ requested: 1, submitted: 0, delivered: 0 });
  });

  it('moves a submitted client step out of requested', () => {
    const counts = buildDocumentCounts(
      { 'pre-1': { status: 'completed', clientSubmittedAt: '2026-01-06T00:00:00.000Z' } },
      2,
    );

    expect(counts.submitted).toBe(1);
    expect(counts.requested).toBe(0);
    expect(counts.delivered).toBe(2);
  });
});

describe('buildMilestones', () => {
  it('emits one node per catalog step, carrying the gate kind', () => {
    const milestones = buildMilestones({});

    expect(milestones).toHaveLength(CATALOG.length);
    expect(milestones[0]?.kind).toBe('active');
    expect(milestones[1]?.kind).toBe('locked');
    expect(milestones.at(-1)?.kind).toBe('locked');
  });

  it('marks completed steps done and keeps phase colours attached', () => {
    const milestones = buildMilestones(completeFirst(3));

    expect(milestones.slice(0, 3).every((m) => m.kind === 'done')).toBe(true);
    expect(milestones[0]?.phaseId).toBe('pre-inc-phase-1');
    expect(milestones[0]?.colorKey).toBe('pre');
  });
});

describe('identifiersFromState', () => {
  it('is empty before the certificate step is filled', () => {
    expect(identifiersFromState({})).toEqual({
      cin: undefined,
      pan: undefined,
      tan: undefined,
      pfCode: undefined,
      esiCode: undefined,
    });
  });

  it('reads the statutory identifiers off pre-12', () => {
    const identifiers = identifiersFromState({
      'pre-12': {
        status: 'completed',
        responses: {
          cin: 'U74999KA2026PTC123456',
          pan: 'AAACA1234A',
          tan: 'BLRA12345B',
          pfCode: '  ',
        },
      },
    });

    expect(identifiers.cin).toBe('U74999KA2026PTC123456');
    expect(identifiers.tan).toBe('BLRA12345B');
    expect(identifiers.pfCode).toBeUndefined();
  });
});

describe('latestCompletedPhase', () => {
  it('is null before a phase closes', () => {
    expect(latestCompletedPhase(buildProgress({}))).toBeNull();
  });

  it('returns phase 1 once its steps are all complete', () => {
    expect(latestCompletedPhase(buildProgress(completeFirst(5)))?.id).toBe('pre-inc-phase-1');
  });
});

describe('complianceGroupForAuthority', () => {
  it('maps the real authority codes to client-readable buckets', () => {
    expect(complianceGroupForAuthority('GST')).toBe('GST');
    expect(complianceGroupForAuthority('IT')).toBe('Income tax');
    expect(complianceGroupForAuthority('EPFO')).toBe('Payroll');
    expect(complianceGroupForAuthority('ESIC')).toBe('Payroll');
    expect(complianceGroupForAuthority('MCA')).toBe('MCA');
    expect(complianceGroupForAuthority('RBI')).toBe('FEMA');
    expect(complianceGroupForAuthority('something-else')).toBe('Other');
  });
});

describe('clientStepHref', () => {
  it('deep-links into the gated flowchart rather than duplicating the workflow', () => {
    expect(clientStepHref('reg-4')).toBe('/app/client/incorporation?step=reg-4');
  });
});

describe('buildCompanySnapshot', () => {
  it('is empty with links for a new engagement', () => {
    const snapshot = buildCompanySnapshot({});
    expect(snapshot.directors).toEqual([]);
    expect(snapshot.subscribers).toEqual([]);
    expect(snapshot.capital).toEqual({ authorised: null, paidUp: null, nominalValue: null, shareClasses: [] });
    expect(snapshot.links.directors).toBe('/app/client/incorporation/step/proposed-directors');
    expect(snapshot.links.capital).toContain('?tab=proposed-share-capital-structure');
  });

  it('reads directors, capital, share classes and subscribers', () => {
    const snapshot = buildCompanySnapshot({
      'pre-1': {
        status: 'completed',
        responses: { authorisedShareCapital: '1000000', paidUpShareCapital: '100000', nominalValuePerEquityShare: '10' },
      },
      'pre-13': {
        status: 'completed',
        responses: { equityShares: 'yes', equityQuantity: '100000', equityNominalValue: '10', equityTotal: '1000000', preferenceShares: 'no' },
      },
      'pre-15': {
        status: 'completed',
        responses: {
          directors: 'd1,d2',
          'directors.d1.firstName': 'Priya',
          'directors.d1.lastName': 'Sharma',
          'directors.d1.indiaResident': 'yes',
          'directors.d1.din': '01234567',
          'directors.d2.firstName': 'John',
          'directors.d2.lastName': 'Smith',
          'directors.d2.indiaResident': 'no',
        },
      },
      'pre-16': {
        status: 'completed',
        responses: { subscribers: 's1', 'subscribers.s1.name': 'Parent Co', 'subscribers.s1.shares': '10000' },
      },
    });
    expect(snapshot.directors).toEqual([
      { name: 'Priya Sharma', indiaResident: true, din: '01234567' },
      { name: 'John Smith', indiaResident: false, din: null },
    ]);
    expect(snapshot.capital.authorised).toBe('1000000');
    expect(snapshot.capital.shareClasses).toEqual([
      { kind: 'equity', quantity: '100000', nominalValue: '10', total: '1000000' },
    ]);
    expect(snapshot.subscribers).toEqual([{ name: 'Parent Co', shares: '10000' }]);
  });
});
