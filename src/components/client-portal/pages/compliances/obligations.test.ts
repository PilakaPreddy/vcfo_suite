import { describe, expect, it } from 'vitest';
import type { PortalFiling } from '@/lib/client-portal/compliances';
import { dueWithin, freqKey, groupObligations, waitingOnClient } from './obligations';
import { slugOf } from '@/lib/client-portal/compliances';

const TODAY = '2026-10-14';

function row(over: Partial<PortalFiling>): PortalFiling {
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

const rows: PortalFiling[] = [
  row({ id: 'g-aug', dueDate: '2026-09-20', filedOn: '2026-09-18', period: 'Aug 2026' }),
  row({ id: 'g-sep', dueDate: '2026-10-20', period: 'Sep 2026' }),
  row({ id: 'g-oct', dueDate: '2026-11-20', period: 'Oct 2026' }),
  row({ id: 't-q2', particular: 'TDS Return 26Q', name: 'TDS Return 26Q', area: 'IT', authority: 'IT', frequency: 'quarterly', freqLabel: 'Quarterly', dueDate: '2026-10-10', period: 'Jul–Sep 2026' }),
  row({ id: 'm-aoc', particular: 'AOC-4 Filing', name: 'AOC-4', area: 'MCA', authority: 'MCA', frequency: 'annual', freqLabel: 'Annual', dueDate: '2026-10-29', filedOn: '2026-10-05', period: 'FY 2025-26' }),
];

describe('slugOf', () => {
  it('makes a URL segment from a filing name', () => {
    expect(slugOf('GSTR-3B Filing')).toBe('gstr-3b-filing');
    expect(slugOf('MSME-1 (Apr–Sep)')).toBe('msme-1-apr-sep');
    expect(slugOf('***')).toBe('filing');
  });
});

describe('groupObligations', () => {
  const obs = groupObligations(rows, TODAY);
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
    const two = groupObligations([...rows, row({ id: 'other', engagementId: 'eng-2' })], TODAY);
    expect(two.filter((o) => o.name === 'GSTR-3B').map((o) => o.id).sort()).toEqual(['gstr-3b-filing--eng-1', 'gstr-3b-filing--eng-2']);
  });

  it('groups by frequency key', () => {
    expect(freqKey(byName['TDS Return 26Q']!)).toBe('quarterly');
    expect(freqKey({ frequency: 'weekly' })).toBe('other');
  });
});

describe('rail lists', () => {
  const obs = groupObligations(rows, TODAY);

  it('lists open periods due within 15 days, overdue first', () => {
    expect(dueWithin(obs, TODAY).map((h) => h.f.id)).toEqual(['t-q2', 'g-sep']);
  });

  it('lists periods waiting on the client only when they are open now', () => {
    const w = waitingOnClient(obs, TODAY, 'Northwind');
    expect(w.map((h) => h.f.id)).toEqual(['t-q2', 'g-sep']);
    expect(w[0]!.step).toBe('Send data');
    const prepared = groupObligations([row({ id: 'p', dataReceivedOn: '2026-10-01', preparingSince: '2026-10-02' })], TODAY);
    expect(waitingOnClient(prepared, TODAY, 'Northwind')).toEqual([]);
  });
});
