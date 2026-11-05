import { describe, expect, it } from 'vitest';
import { filingStatus, todayIST, type FilingRow } from '@/lib/compliance/filings';
import { COMP_OF, slugOf, statusOf, type PortalFiling } from '@/lib/client-portal/compliances';
import {
  dueWithinSoon,
  flowCounts,
  freqKey,
  groupCompanyObligations,
  groupObligations,
  matchesFilter,
  periodsDueSoon,
  periodsWaitingOnClient,
  waitingOnClient,
} from '@/lib/compliance/obligation-groups';

const NOW = new Date('2026-10-16T09:00:00Z');

function row(patch: Partial<FilingRow> & { id: string }): FilingRow {
  return {
    engagementId: 'acme',
    companyName: 'Acme Pvt Ltd',
    compliance: 'GST',
    particular: 'GSTR-3B',
    authority: 'GST',
    frequency: 'monthly',
    dueDate: '2026-10-20',
    filedOn: null,
    periodLabel: 'Sep 2026',
    fyLabel: 'FY 2026-27',
    rawStatus: 'upcoming',
    obligationId: 'gst-3b',
    windowFrom: null,
    windowTo: null,
    ...patch,
  };
}

function detail(id: string, patch: Partial<PortalFiling> = {}): PortalFiling {
  return { id, dataReceivedOn: null, acknowledgementNo: null, ...patch } as PortalFiling;
}

describe('groupObligations', () => {
  it('bands each obligation on its earliest unfiled due date and counts that period', () => {
    const rows = [
      row({ id: 'a-sep', dueDate: '2026-10-20', filedOn: '2026-10-12' }),
      row({ id: 'b-sep', engagementId: 'birch', companyName: 'Birch LLP', dueDate: '2026-10-20' }),
      row({ id: 'a-oct', dueDate: '2026-11-20', periodLabel: 'Oct 2026' }),
      row({ id: 'a-aug', dueDate: '2026-09-20', filedOn: '2026-09-18', periodLabel: 'Aug 2026' }),
    ];
    const [group] = groupObligations(rows, new Map(), NOW);
    expect(group?.dueDate).toBe('2026-10-20');
    expect(group?.total).toBe(2);
    expect(group?.filed).toBe(1);
    expect(group?.status).toBe('due-soon');
    expect(group?.rows.map((r) => r.key)).toEqual(['a-sep', 'b-sep']);
    // Acme filed September, so its next due is October; its last filing is the latest one.
    expect(group?.rows[0]?.nextDue).toBe('2026-11-20');
    expect(group?.rows[0]?.lastFiled).toBe('2026-10-12');
    expect(group?.instances).toHaveLength(4);
  });

  it('shows the latest period when every period is filed', () => {
    const rows = [
      row({ id: 'x1', dueDate: '2026-08-20', filedOn: '2026-08-19' }),
      row({ id: 'x2', dueDate: '2026-09-20', filedOn: '2026-09-19' }),
    ];
    const [group] = groupObligations(rows, new Map(), NOW);
    expect(group?.dueDate).toBe('2026-09-20');
    expect(group?.filed).toBe(1);
    expect(group?.status).toBe('filed');
  });

  it('sorts obligations by band date and marks a late band overdue', () => {
    const rows = [
      row({ id: 'g1', dueDate: '2026-11-11', obligationId: 'gstr1', particular: 'GSTR-1' }),
      row({ id: 't1', dueDate: '2026-10-07', obligationId: 'tds', particular: 'TDS payment', compliance: 'Income Tax' }),
    ];
    const groups = groupObligations(rows, new Map(), NOW);
    expect(groups.map((g) => g.obligationId)).toEqual(['tds', 'gstr1']);
    expect(groups[0]?.status).toBe('overdue');
    expect(groups[0]?.rows[0]?.word).toBe('Overdue');
  });
});

describe('rail rules', () => {
  it('counts due in the next 15 days only for unfiled rows', () => {
    expect(dueWithinSoon(row({ id: '1', dueDate: '2026-10-31' }), NOW)).toBe(true);
    expect(dueWithinSoon(row({ id: '2', dueDate: '2026-11-01' }), NOW)).toBe(false);
    expect(dueWithinSoon(row({ id: '3', dueDate: '2026-10-20', filedOn: '2026-10-10' }), NOW)).toBe(false);
    expect(dueWithinSoon(row({ id: '4', dueDate: '2026-10-10' }), NOW)).toBe(false);
  });

  it('waits on the client while the client step is live and the period is open (within 30 days or late)', () => {
    const near = row({ id: 'n', dueDate: '2026-10-25' });
    const far = row({ id: 'f', dueDate: '2026-12-25' });
    expect(waitingOnClient(near, detail('n'), NOW)).toBe(true);
    expect(waitingOnClient(far, detail('f'), NOW)).toBe(false);
    expect(waitingOnClient(near, { ...detail('n'), dataReceivedOn: '2026-10-14' }, NOW)).toBe(false);
    // Without the side-table facts nothing is claimed.
    expect(waitingOnClient(near, undefined, NOW)).toBe(false);
  });

  it('filters client rows by the strip keys', () => {
    const [group] = groupObligations([row({ id: 'o', dueDate: '2026-10-01' })], new Map([['o', detail('o')]]), NOW);
    const r = group!.rows[0]!;
    expect(matchesFilter(r, 'overdue', NOW)).toBe(true);
    expect(matchesFilter(r, 'waiting', NOW)).toBe(true);
    expect(matchesFilter(r, 'done', NOW)).toBe(false);
    expect(matchesFilter(r, '', NOW)).toBe(true);
  });

  it('splits the progress flow by data received, filed and acknowledged', () => {
    const rows = [
      row({ id: 'd' }),
      row({ id: 'p' }),
      row({ id: 'f', filedOn: '2026-10-10' }),
      row({ id: 'k', filedOn: '2026-10-11' }),
      row({ id: 'none' }),
    ];
    const details = new Map([
      ['d', detail('d')],
      ['p', { ...detail('p'), dataReceivedOn: '2026-10-05' }],
      ['f', detail('f')],
      ['k', { ...detail('k'), acknowledgementNo: 'AA2910260012345' }],
    ]);
    expect(flowCounts(rows, details)).toEqual({ data: 1, prepared: 1, filed: 1, acknowledged: 1 });
  });
});

const TODAY = '2026-10-14';

function prow(over: Partial<PortalFiling>): PortalFiling {
  return {
    id: over.id ?? 'x',
    engagementId: 'eng-1',
    companyName: 'Northwind Technologies Private Limited',
    particular: 'GSTR-3B Filing',
    name: 'GSTR-3B',
    area: 'GST',
    authority: 'GST',
    authorityName: 'GSTN',
    frequency: 'monthly',
    freqLabel: 'Monthly',
    dueDate: '2026-10-20',
    filedOn: null,
    period: 'Sep 2026',
    periodLong: null,
    fyLabel: 'FY 2026-27',
    rawStatus: 'pending',
    windowFrom: null,
    windowTo: null,
    penaltyRisk: 'medium',
    ownerName: 'Bharath',
    acknowledgementNo: null,
    amountPaid: null,
    filedByName: null,
    dataReceivedOn: null,
    preparingSince: null,
    draftDueOn: null,
    approvalDueOn: null,
    approvedOn: null,
    proofCount: 0,
    reminderOn: null,
    ...over,
  };
}

const prows: PortalFiling[] = [
  prow({ id: 'g-aug', dueDate: '2026-09-20', filedOn: '2026-09-18', period: 'Aug 2026' }),
  prow({ id: 'g-sep', dueDate: '2026-10-20', period: 'Sep 2026' }),
  prow({ id: 'g-oct', dueDate: '2026-11-20', period: 'Oct 2026' }),
  prow({ id: 't-q2', particular: 'TDS Return 26Q', name: 'TDS Return 26Q', area: 'IT', authority: 'IT', frequency: 'quarterly', freqLabel: 'Quarterly', dueDate: '2026-10-10', period: 'Jul–Sep 2026' }),
  prow({ id: 'm-aoc', particular: 'AOC-4 Filing', name: 'AOC-4', area: 'MCA', authority: 'MCA', frequency: 'annual', freqLabel: 'Annual', dueDate: '2026-10-29', filedOn: '2026-10-05', period: 'FY 2025-26' }),
];

describe('slugOf', () => {
  it('makes a URL segment from a filing name', () => {
    expect(slugOf('GSTR-3B Filing')).toBe('gstr-3b-filing');
    expect(slugOf('MSME-1 (Apr–Sep)')).toBe('msme-1-apr-sep');
    expect(slugOf('***')).toBe('filing');
  });
});

describe('groupCompanyObligations', () => {
  const obs = groupCompanyObligations(prows, TODAY);
  const byName = Object.fromEntries(obs.map((o) => [o.name, o]));

  it('makes one obligation per filing', () => {
    expect(obs.map((o) => o.name).sort()).toEqual(['AOC-4', 'GSTR-3B', 'TDS Return 26Q']);
    expect(byName['GSTR-3B']!.instances.map((r) => r.id)).toEqual(['g-aug', 'g-sep', 'g-oct']);
  });

  it('counts the filed periods of the current financial year', () => {
    expect(byName['GSTR-3B']!.filed).toBe(1);
    expect(byName['GSTR-3B']!.total).toBe(3);
  });

  it('takes the worst open state and the next due date', () => {
    expect(byName['GSTR-3B']!.status).toBe('due');
    expect(byName['GSTR-3B']!.next?.id).toBe('g-sep');
    expect(byName['GSTR-3B']!.tileDate).toBe('2026-10-20');
    expect(byName['TDS Return 26Q']!.status).toBe('over');
    expect(byName['AOC-4']!.status).toBe('ok');
    expect(byName['AOC-4']!.tileDate).toBe('2026-10-05');
  });

  it('adds the engagement to the id only when the client has more than one', () => {
    expect(byName['GSTR-3B']!.id).toBe('gstr-3b-filing');
    const two = groupCompanyObligations([...prows, prow({ id: 'other', engagementId: 'eng-2' })], TODAY);
    expect(two.filter((o) => o.name === 'GSTR-3B').map((o) => o.id).sort()).toEqual(['gstr-3b-filing--eng-1', 'gstr-3b-filing--eng-2']);
  });

  it('groups by frequency key', () => {
    expect(freqKey(byName['TDS Return 26Q']!)).toBe('quarterly');
    expect(freqKey({ frequency: 'weekly' })).toBe('other');
  });
});

describe('client rail lists', () => {
  const obs = groupCompanyObligations(prows, TODAY);

  it('lists open periods due within 15 days, overdue first', () => {
    expect(periodsDueSoon(obs, TODAY).map((h) => h.f.id)).toEqual(['t-q2', 'g-sep']);
  });

  it('lists periods waiting on the client only when they are open now', () => {
    const w = periodsWaitingOnClient(obs, TODAY, 'Northwind');
    expect(w.map((h) => h.f.id)).toEqual(['t-q2', 'g-sep']);
    expect(w[0]!.step).toBe('Send data');
    const prepared = groupCompanyObligations([prow({ id: 'p', dataReceivedOn: '2026-10-01', preparingSince: '2026-10-02' })], TODAY);
    expect(periodsWaitingOnClient(prepared, TODAY, 'Northwind')).toEqual([]);
  });

  it('counts the approval step as waiting on the client, and only inside the 30-day window', () => {
    const approve = prow({ id: 'a', dataReceivedOn: '2026-10-01', preparingSince: '2026-10-02', draftDueOn: '2026-10-10' });
    expect(periodsWaitingOnClient(groupCompanyObligations([approve], TODAY), TODAY, 'Northwind')[0]?.step).toBe('Northwind approves');
    const far = prow({ id: 'far', dueDate: '2026-11-20' });
    expect(periodsWaitingOnClient(groupCompanyObligations([far], TODAY), TODAY, 'Northwind')).toEqual([]);
    expect(periodsWaitingOnClient(groupCompanyObligations([{ ...far, windowFrom: '2026-10-01' }], TODAY), TODAY, 'Northwind')).toHaveLength(1);
  });
});

describe('client and staff agree', () => {
  it('reads the same row with the same status and waiting rule on both sides', () => {
    const now = new Date('2026-10-14T20:00:00Z'); // 15 Oct in India
    for (const dueDate of ['2026-10-14', '2026-10-15', '2026-10-30', '2026-10-31', '2026-11-20']) {
      const f = prow({ id: dueDate, dueDate });
      const s = row({ id: dueDate, dueDate });
      expect(statusOf(f, todayIST(now))).toBe(COMP_OF[filingStatus(s, now)]);
      expect(periodsWaitingOnClient(groupCompanyObligations([f], todayIST(now)), todayIST(now), 'N').length > 0).toBe(waitingOnClient(s, f, now));
    }
  });
});
