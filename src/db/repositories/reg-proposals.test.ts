import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import { complianceInstances, complianceReminders, filingEvents, regCalendarProposals, regUpdateLinks, regUpdates } from '@/db/schema';

/** Records each write by table; a select or `returning` answers with the next prepared rows. */
type Write = { op: 'insert' | 'update'; table: unknown; data?: Record<string, unknown> };
const writes: Write[] = [];
let selects: unknown[][] = [];
let claimed: unknown[] = [];

function chain(result: () => unknown, write?: Write): unknown {
  const self: unknown = new Proxy(() => undefined, {
    get(_target, key) {
      if (key === 'then') return (resolve: (value: unknown) => void) => resolve(result());
      if ((key === 'set' || key === 'values') && write) return (data: Record<string, unknown>) => ((write.data = data), self);
      return () => self;
    },
  });
  return self;
}

const mutate = (op: Write['op']) => (table: unknown) => {
  const write: Write = { op, table };
  writes.push(write);
  return chain(() => (table === regCalendarProposals ? claimed : [{ id: 'new-update' }]), write);
};

const db = {
  select: () => chain(() => selects.shift() ?? []),
  selectDistinct: () => chain(() => selects.shift() ?? []),
  insert: mutate('insert'),
  update: mutate('update'),
  transaction: (run: (tx: unknown) => unknown) => run(db),
};

vi.mock('@/db/client', () => ({ db }));

let scoped: string[] = [];
vi.mock('./engagements', async (original) => ({ ...(await original<typeof import('./engagements')>()), listScopedEngagementIds: async () => scoped }));

const { decideCalendarProposal, getUpdateImpact, listCalendarChanges, listCalendarProposals, writeCalendarProposals } = await import('./reg-proposals');
const { addPastedAlertMail, systemQueueAlertMail } = await import('./reg-updates');
const { moveFilingPeriod } = await import('./compliance');

const as = (role: string) => ({ role, userId: 'manager-1', internId: null, clientId: null }) as unknown as AuthContext;
const PROPOSAL = {
  id: 'p1',
  updateId: 'u1',
  obligationId: 'mca-mgt-7',
  period: 'Form MGT-7 FY 2025-26',
  oldDueDate: '2026-11-29',
  newDueDate: '2026-12-31',
  status: 'approved',
  affectedEngagementIds: ['open', 'filed'],
};
const period = (id: string, dueDate: string, filed = false) => ({ id, engagementId: id, obligationId: PROPOSAL.obligationId, periodLabel: PROPOSAL.period, dueDate, ownerId: `owner-${id}`, filed });

const tablesWritten = () => writes.map((write) => write.table);

beforeEach(() => {
  writes.length = 0;
  selects = [];
  claimed = [];
  scoped = [];
});

describe('deciding a calendar change', () => {
  it('a rejected proposal writes the decision and nothing else', async () => {
    claimed = [{ ...PROPOSAL, status: 'rejected' }];
    await expect(decideCalendarProposal(as('manager'), 'p1', 'rejected')).resolves.toMatchObject({ moved: [] });
    expect(tablesWritten()).toEqual([regCalendarProposals]);
    expect(writes[0]!.data).toMatchObject({ status: 'rejected', decidedById: 'manager-1' });
  });

  it('a proposal already decided moves nothing, which is what a second click does', async () => {
    await expect(decideCalendarProposal(as('manager'), 'p1', 'approved')).resolves.toBeNull();
    expect(tablesWritten()).toEqual([regCalendarProposals]);
  });

  it('approving moves only open rows, and records who actually moved', async () => {
    claimed = [PROPOSAL];
    selects = [[period('open', '2026-11-29'), period('filed', '2026-11-29', true), period('done', '2026-12-31')]];
    const decided = await decideCalendarProposal(as('admin'), 'p1', 'approved');
    expect(decided!.moved).toEqual([{ id: 'open', engagementId: 'open', ownerId: 'owner-open' }]);
    expect(decided!.proposal.affectedEngagementIds).toEqual(['open']);
    expect(tablesWritten()).toEqual([regCalendarProposals, complianceReminders, complianceInstances, filingEvents, regCalendarProposals]);
    const instanceWrite = writes.find((write) => write.table === complianceInstances)!;
    expect(instanceWrite.data).toMatchObject({ dueDate: '2026-12-31' });
    const events = writes.find((write) => write.table === filingEvents)!.data as unknown as Array<{ instanceId: string; label: string }>;
    expect(events.map((event) => event.instanceId)).toEqual(['open']);
    expect(events[0]!.label).toContain('29 Nov 2026');
    expect(writes.at(-1)!.data).toEqual({ affectedEngagementIds: ['open'] });
  });

  it('a client already holding a row on the new date is not moved into a clash', async () => {
    claimed = [PROPOSAL];
    selects = [[{ ...period('same', '2026-11-29') }, { ...period('same', '2026-12-31'), id: 'already' }]];
    expect((await decideCalendarProposal(as('manager'), 'p1', 'approved'))!.moved).toEqual([]);
    expect(tablesWritten()).toEqual([regCalendarProposals, regCalendarProposals]);
  });
});

describe('writing proposals at publish', () => {
  const update = { id: 'u1', title: 'MGT-7 extended', area: 'mca', act: null, changeType: 'due_date', summary: null, affects: null, quote: null, oldDueDate: '2026-11-29', newDueDate: '2026-12-31' };

  it('adds a row in the caller transaction for a due-date update with a match', async () => {
    selects = [[period('open', '2026-11-29')]];
    await writeCalendarProposals(update, db as never);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ op: 'insert', table: regCalendarProposals });
    expect(writes[0]!.data).toEqual([expect.objectContaining({ updateId: 'u1', obligationId: 'mca-mgt-7', affectedEngagementIds: ['open'] })]);
  });

  it('writes nothing when no open filing matches', async () => {
    await writeCalendarProposals(update, db as never);
    await writeCalendarProposals({ ...update, changeType: 'other' }, db as never);
    expect(writes).toEqual([]);
  });
});

describe('alert mail intake', () => {
  const MAIL = { messageId: 'm1', sender: 'a@mca.gov.in', subject: 'Extended', body: 'PAN ABCDE1234F extended.', link: null, sentOn: '2026-11-05' };

  it('stores a new mail with a masked body and no link as its own document', async () => {
    expect(await systemQueueAlertMail('source', MAIL)).toBe('new-update');
    expect(writes[0]).toMatchObject({ table: regUpdates, data: { intake: 'email', sourceUrl: null, intakeById: null } });
    expect(writes[0]!.data!.sourceText).not.toContain('ABCDE1234F');
    expect(writes[1]).toMatchObject({ table: regUpdateLinks, data: { url: 'mail:m1', externalKey: 'm1' } });
  });

  it('a repeated mail or known link adds no update', async () => {
    selects = [[{ updateId: 'earlier' }]];
    expect(await systemQueueAlertMail('source', MAIL)).toBeNull();
    expect(tablesWritten()).toEqual([regUpdateLinks]);
  });

  it('a pasted mail names who added it, and a client cannot add one', async () => {
    await addPastedAlertMail(as('intern'), 'source', MAIL);
    expect(writes[0]!.data).toMatchObject({ intakeById: 'manager-1' });
    await expect(addPastedAlertMail(as('client'), 'source', MAIL)).rejects.toThrow('not permitted');
  });
});

describe('who sees which client', () => {
  const NAMES = [
    { id: 'mine', name: 'Mine Ltd' },
    { id: 'other', name: 'Other Ltd' },
  ];
  const listed = (id: string, affectedEngagementIds: string[]) => ({ proposal: { ...PROPOSAL, id, status: 'proposed', affectedEngagementIds }, title: `Update ${id}` });

  it('a lead sees only cards touching their own clients, naming only those beside the firm-wide count', async () => {
    scoped = ['mine'];
    selects = [[listed('p1', ['mine', 'other']), listed('p2', ['other'])], NAMES];
    const views = await listCalendarProposals(as('intern'));
    expect(views.map((view) => view.id)).toEqual(['p1']);
    expect(views[0]).toMatchObject({ total: 2, clients: [{ companyName: 'Mine Ltd' }] });
  });

  it('a manager sees every card to decide it, and still names only their own clients', async () => {
    scoped = ['mine'];
    selects = [[listed('p1', ['mine', 'other']), listed('p2', ['other'])], NAMES];
    const views = await listCalendarProposals(as('manager'));
    expect(views.map((view) => view.clients.map((client) => client.companyName))).toEqual([['Mine Ltd'], []]);
    expect(views.map((view) => view.total)).toEqual([2, 1]);
  });

  it('an admin names every client', async () => {
    selects = [[listed('p1', ['mine', 'other'])], NAMES];
    const [view] = await listCalendarProposals(as('admin'));
    expect(view!.clients.map((client) => client.companyName)).toEqual(['Mine Ltd', 'Other Ltd']);
  });

  it('the list on an update names only a lead\'s own clients, with the reason and the firm-wide count', async () => {
    scoped = ['mine'];
    const client = (engagementId: string, companyName: string) => ({ engagementId, companyName, legalForm: 'company', questionnaire: null, trigger: null });
    selects = [
      [client('mine', 'Mine Ltd'), client('other', 'Other Ltd')],
      [
        { engagementId: 'mine', obligationId: 'mca-mgt-7' },
        { engagementId: 'other', obligationId: 'mca-mgt-7' },
      ],
      [{ ...PROPOSAL, status: 'proposed', affectedEngagementIds: ['mine', 'other'] }],
    ];
    const impact = await getUpdateImpact(as('intern'), { id: 'u1', status: 'published', title: 'Form MGT-7 time extended', area: 'mca', act: null, changeType: 'due_date', summary: null, affects: null, quote: null, oldDueDate: '2026-11-29', newDueDate: '2026-12-31' });
    expect(impact).toMatchObject({ basis: 'filing', total: 2, clients: [{ companyName: 'Mine Ltd', reason: 'Form MGT-7 open' }] });
    expect(impact.proposals[0]).toMatchObject({ total: 2, clients: [{ companyName: 'Mine Ltd' }] });
  });
});

describe('roles', () => {
  it.each(['intern', 'client', 'developer'])('%s cannot decide or move a filing', async (role) => {
    await expect(decideCalendarProposal(as(role), 'p1', 'approved')).rejects.toThrow('not permitted');
    await expect(moveFilingPeriod(as(role), PROPOSAL, db as never)).rejects.toThrow('not permitted');
    expect(writes).toEqual([]);
  });

  it.each(['client', 'developer'])('%s reads nothing', async (role) => {
    await expect(listCalendarProposals(as(role))).rejects.toThrow('not permitted');
    await expect(listCalendarChanges(as(role))).rejects.toThrow('not permitted');
    await expect(getUpdateImpact(as(role), { id: 'u1', status: 'unreviewed', title: 'T', area: null, act: null, changeType: null, summary: null, affects: null, quote: null, oldDueDate: null, newDueDate: null })).rejects.toThrow('not permitted');
  });
});
