import { describe, expect, it } from 'vitest';
import { summarizeEngagement } from '@/lib/super/super-overview';
import {
  areaHealth,
  buildMonths,
  buildPracticeAreas,
  capacityTone,
  medianResponse,
  roomAcross,
  changeText,
  openRegistrations,
  overdueFilingsNow,
  riskAgeLabel,
  buildRisks,
  buildTeam,
  filingOutcome,
  inRegistrations,
  monthKeys,
  registrationCounts,
  type SuperInsightClient,
  type SuperInsightFiling,
} from '@/lib/super/super-insights-model';

const NOW = new Date('2026-10-20T09:00:00.000Z');

function client(id: string, overrides: Partial<SuperInsightClient> = {}, summaryOverrides: Record<string, unknown> = {}): SuperInsightClient {
  const summary = summarizeEngagement(
    {
      id,
      slug: id,
      companyName: `${id} Private Limited`,
      clientName: null,
      stage: 'Pre-Incorporation',
      health: 'on-track',
      leadId: 'i1',
      leadName: 'Priya Lead',
      managerId: 'm1',
      managerName: 'Meera Manager',
      incorporationDate: null,
      createdAt: new Date('2026-09-02T00:00:00.000Z'),
      updatedAt: new Date('2026-10-19T00:00:00.000Z'),
      state: {},
      ...summaryOverrides,
    },
    NOW,
  );
  return {
    summary,
    startedPreInc: true,
    certificateDate: null,
    daysToCoi: null,
    managerIds: ['m1'],
    leadIds: ['i1'],
    overdueSteps: [],
    registrations: {},
    currentStepHref: null,
    nextDueDate: null,
    currentStepDue: null,
    ...overrides,
  };
}

function filing(id: string, dueDate: string, overrides: Partial<SuperInsightFiling> = {}): SuperInsightFiling {
  return {
    id,
    engagementId: 'a',
    companyName: 'a Private Limited',
    title: 'GSTR-3B',
    authority: 'GST',
    dueDate,
    filedOn: null,
    status: 'upcoming',
    href: '/app/super/projects/a',
    ...overrides,
  };
}

describe('filingOutcome', () => {
  it('reads on time and late from the filing date against the due date', () => {
    expect(filingOutcome(filing('1', '2026-10-11', { status: 'filed', filedOn: '2026-10-10' }), '2026-10-20')).toBe('on-time');
    expect(filingOutcome(filing('2', '2026-10-11', { status: 'filed', filedOn: '2026-10-14' }), '2026-10-20')).toBe('late');
  });

  it('calls an unfiled filing past its due date overdue, and a future one open', () => {
    expect(filingOutcome(filing('3', '2026-10-11'), '2026-10-20')).toBe('overdue');
    expect(filingOutcome(filing('4', '2026-10-25'), '2026-10-20')).toBe('open');
  });
});

describe('buildMonths', () => {
  it('returns twelve months ending with the current one', () => {
    const keys = monthKeys(NOW);
    expect(keys).toHaveLength(12);
    expect(keys[11]).toBe('2026-10');
    expect(keys[0]).toBe('2025-11');
  });

  it('counts engagements started, certificates issued and filing outcomes by month', () => {
    const months = buildMonths(
      [
        client('a', { certificateDate: '2026-10-05', daysToCoi: 33 }),
        client('b', { startedPreInc: false, certificateDate: '2026-10-01' }),
      ],
      [
        filing('1', '2026-10-11', { status: 'filed', filedOn: '2026-10-10' }),
        filing('2', '2026-10-11', { status: 'filed', filedOn: '2026-10-14' }),
        filing('3', '2026-10-12'),
        filing('4', '2026-10-30'),
      ],
      NOW,
    );
    const sep = months.find((m) => m.key === '2026-09')!;
    const oct = months.find((m) => m.key === '2026-10')!;
    expect(sep.engagementsStarted).toBe(2);
    // Only the engagement SBC incorporated counts as a certificate issued.
    expect(oct.certificatesIssued).toBe(1);
    expect(oct.avgDaysToCoi).toBe(33);
    expect(oct).toMatchObject({ filingsDue: 4, filedOnTime: 1, filedLate: 1, overdue: 1, open: 1 });
  });
});

describe('buildTeam', () => {
  it('puts leads under the manager they report to, and counts co-assigned clients', () => {
    const team = buildTeam({
      staff: [
        { id: 'm1', name: 'Meera Manager', email: 'm@x', role: 'manager', internId: null, reportsToManagerId: null, status: 'active' },
        { id: 'm2', name: 'Arun Manager', email: 'a@x', role: 'manager', internId: null, reportsToManagerId: null, status: 'active' },
        { id: 'l1', name: 'Priya Lead', email: 'p@x', role: 'intern', internId: 'i1', reportsToManagerId: 'm1', status: 'active' },
        { id: 'l2', name: 'Ravi Lead', email: 'r@x', role: 'intern', internId: 'i2', reportsToManagerId: null, status: 'active' },
        { id: 's1', name: 'Super', email: 's@x', role: 'super_admin', internId: null, reportsToManagerId: null, status: 'active' },
      ],
      clients: [client('a'), client('b', { managerIds: ['m1', 'm2'], leadIds: ['i1', 'i2'] })],
      filings: [],
      lastActive: new Map([['l1', '2026-10-19T10:00:00.000Z']]),
      actions30d: new Map([['s1', 4]]),
      isAttention: () => false,
      now: NOW,
    });
    const meera = team.managers.find((m) => m.id === 'm1')!;
    const arun = team.managers.find((m) => m.id === 'm2')!;
    expect(meera.clients).toBe(2);
    expect(arun.clients).toBe(1);
    expect(meera.leads.map((l) => l.id)).toEqual(['l1']);
    expect(meera.leads[0]!.clients).toBe(2);
    expect(meera.leads[0]!.lastActiveAt).toBe('2026-10-19T10:00:00.000Z');
    expect(team.unassignedLeads.map((l) => l.id)).toEqual(['l2']);
    expect(team.admins).toEqual([expect.objectContaining({ id: 's1', role: 'Super admin', actions30d: 4 })]);
  });
});

describe('buildRisks', () => {
  it('lists overdue steps, overdue filings, stuck clients and clients with nobody on them', () => {
    const risks = buildRisks(
      {
        clients: [
          client('a', { overdueSteps: [{ id: 'pre-3', title: 'Name approval', href: '/x' }] }),
          client('b', { managerIds: [], leadIds: [] }, { updatedAt: new Date('2026-09-01T00:00:00.000Z') }),
        ],
        filings: [filing('f1', '2026-09-10'), filing('f2', '2026-11-10')],
      },
      NOW,
    );
    const kinds = risks.map((r) => `${r.kind}:${r.engagementId}`).sort();
    expect(kinds).toEqual(['filing:a', 'lead:b', 'owner:b', 'step:a', 'stuck:b']);
    const overdueFiling = risks.find((r) => r.kind === 'filing')!;
    expect(overdueFiling.ageDays).toBe(40);
    expect(overdueFiling.severity).toBe(3);
  });
});

describe('registrationCounts', () => {
  it('counts each registration by cell and skips the ones marked not needed', () => {
    const types = [
      { id: 'reg-4', title: 'GST Registration' },
      { id: 'reg-1', title: 'PF Registration' },
    ];
    const a = client('a', { registrations: { 'reg-4': 'done', 'reg-1': 'waiting' } });
    const b = client('b', { registrations: { 'reg-4': 'progress', 'reg-1': 'not-needed' } });
    const c = client('c', { registrations: { 'reg-4': 'locked', 'reg-1': 'locked' } });
    expect(inRegistrations(c)).toBe(false);
    const counts = registrationCounts({ clients: [a, b, c], registrationTypes: types });
    expect(counts[0]).toMatchObject({ id: 'reg-4', done: 1, progress: 1, needed: 3 });
    expect(counts[1]).toMatchObject({ id: 'reg-1', waiting: 1, needed: 2 });
  });
});

describe('riskAgeLabel', () => {
  it('says one day in the singular and keeps the dash when no date says', () => {
    expect(riskAgeLabel(null)).toBe('–');
    expect(riskAgeLabel(0)).toBe('Today');
    expect(riskAgeLabel(1)).toBe('1 day');
    expect(riskAgeLabel(5)).toBe('5 days');
  });
});

describe('changeText', () => {
  it('reads the change against the last stored month, or nothing without history', () => {
    expect(changeText(12, [10])).toBe('+2');
    expect(changeText(7, [10], 'pts')).toBe('\u22123 pts');
    expect(changeText(4, [4])).toBe('0');
    expect(changeText(4, [])).toBeUndefined();
    expect(changeText(null, [4])).toBeUndefined();
  });
});

describe('overdueFilingsNow', () => {
  it('counts unfiled filings due in the last 90 days only', () => {
    const rows = [
      filing('1', '2026-10-10'),
      filing('2', '2026-10-10', { status: 'filed', filedOn: '2026-10-09' }),
      filing('3', '2026-05-01'),
      filing('4', '2026-10-25'),
    ];
    expect(overdueFilingsNow(rows, NOW)).toBe(1);
  });
});

describe('openRegistrations and the practice areas', () => {
  it('counts open registration items and builds one row per area', () => {
    const a = client('a', { registrations: { gst: 'progress', pan: 'overdue' } });
    const b = client('b', { registrations: { gst: 'done' }, certificateDate: '2026-10-05' }, { incorporationDate: '2026-10-05' });
    const types = [
      { id: 'gst', title: 'GST' },
      { id: 'pan', title: 'PAN' },
    ];
    expect(openRegistrations({ clients: [a, b], registrationTypes: types })).toBe(2);

    const filings = [
      filing('f1', '2026-10-10', { engagementId: 'a' }),
      filing('f2', '2026-10-05', { engagementId: 'b', status: 'filed', filedOn: '2026-10-04' }),
    ];
    const hrefs = { Incorporation: '/i', Registrations: '/r', Compliances: '/c' };
    const [inc, reg, comp] = buildPracticeAreas({ clients: [a, b], filings }, hrefs, NOW);
    expect(inc).toMatchObject({ area: 'Incorporation', doneThisMonth: 1, href: '/i' });
    expect(reg).toMatchObject({ active: 1, overdue: 1, doneThisMonth: null, health: 'At risk', leadManager: 'Meera Manager' });
    expect(comp).toMatchObject({ active: 1, overdue: 1, doneThisMonth: 1 });
  });

  it('reads health from the overdue share', () => {
    expect(areaHealth(10, 0)).toBe('On track');
    expect(areaHealth(10, 2)).toBe('Watch');
    expect(areaHealth(10, 3)).toBe('At risk');
  });
});

describe('capacity and response helpers', () => {
  it('bands the load and sums the room under set capacities', () => {
    expect(capacityTone(85)).toBe('bad');
    expect(capacityTone(70)).toBe('warn');
    expect(capacityTone(40)).toBe('prog');
    const managers = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }] as Parameters<typeof roomAcross>[0];
    const people = new Map([
      ['m1', { load: { open: 8, capacity: 10 } }],
      ['m2', { load: { open: 12, capacity: 10 } }],
      ['m3', { load: { open: 3, capacity: null } }],
    ]);
    expect(roomAcross(managers, people)).toBe(2);
    expect(roomAcross(managers, new Map())).toBeNull();
  });

  it('reads the median time to resolve', () => {
    const h = 3_600_000;
    expect(medianResponse([])).toBe('–');
    expect(medianResponse([0.5 * h])).toBe('<1 h');
    expect(medianResponse([2 * h, 4 * h, 30 * h])).toBe('4 h');
    expect(medianResponse([72 * h])).toBe('3 d');
  });
});
