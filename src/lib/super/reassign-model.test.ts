import { describe, expect, it } from 'vitest';
import { summarizeEngagement } from '@/lib/super/super-overview';
import type { SuperInsightClient, SuperTeamManager } from './super-insights-model';
import { buildReassignSuggestions, type ManagerLoad } from './reassign-model';

const NOW = new Date('2026-10-20T09:00:00.000Z');

function client(id: string, s: Record<string, unknown> = {}, extra: Partial<SuperInsightClient> = {}): SuperInsightClient {
  const summary = summarizeEngagement(
    {
      id,
      slug: id,
      companyName: `${id} Private Limited`,
      clientName: null,
      stage: 'Pre-Incorporation',
      health: 'on-track',
      leadId: 'i1',
      leadName: 'Priya',
      managerId: 'm1',
      managerName: 'Meera',
      incorporationDate: null,
      createdAt: new Date('2026-10-14T00:00:00.000Z'),
      updatedAt: new Date('2026-10-19T00:00:00.000Z'),
      state: {},
      ...s,
    },
    NOW,
  );
  return {
    summary,
    startedPreInc: true,
    certificateDate: null,
    daysToCoi: null,
    managerIds: summary.managerId ? [summary.managerId] : [],
    leadIds: summary.leadId ? [summary.leadId] : [],
    overdueSteps: [],
    registrations: {},
    currentStepHref: null,
    nextDueDate: null,
    currentStepDue: null,
    ...extra,
  };
}

function manager(id: string, name: string, clients: number, leads: SuperTeamManager['leads'] = []): SuperTeamManager {
  return {
    id,
    name,
    email: `${id}@x`,
    status: 'active',
    lastActiveAt: null,
    clients,
    incorporating: 0,
    openSteps: 0,
    overdueSteps: 0,
    approvalsPending: 0,
    attention: 0,
    overdueFilings: 0,
    filedOnTime: 0,
    filedLate: 0,
    avgDaysToCoi: null,
    leads,
  } as SuperTeamManager;
}

const lead = (id: string, internId: string, name: string, clients: number) =>
  ({ id, name, email: '', internId, status: 'active', lastActiveAt: null, clients, openSteps: 0, overdueSteps: 0, attention: 0 }) as SuperTeamManager['leads'][number];

describe('buildReassignSuggestions', () => {
  it('gives a client with no manager to the manager with the most room', () => {
    const loads: Record<string, ManagerLoad> = {
      m1: { open: 18, capacity: 20, pct: 90 },
      m2: { open: 4, capacity: 20, pct: 20 },
    };
    const out = buildReassignSuggestions({
      clients: [client('a', { managerId: null, managerName: null })],
      managers: [manager('m1', 'Meera', 6), manager('m2', 'Arjun', 2)],
      load: (id) => loads[id],
    });
    expect(out[0]).toMatchObject({ kind: 'manager', fromName: 'No manager', toId: 'm2', toName: 'Arjun', action: 'Assign', why: 'Added 14 Oct · room for 16' });
  });

  it('gives a client with no lead to the manager’s lightest lead, with the step due date', () => {
    const out = buildReassignSuggestions({
      clients: [client('b', { leadId: null, leadName: null }, { currentStepDue: '2026-10-18' })],
      managers: [manager('m1', 'Meera', 1, [lead('p1', 'i1', 'Priya', 4), lead('p2', 'i2', 'Rahul', 1)])],
      load: () => undefined,
    });
    expect(out).toEqual([
      expect.objectContaining({ kind: 'lead', fromName: 'No project lead', toId: 'i2', toName: 'Rahul', why: 'Due 18 Oct' }),
    ]);
  });

  it('moves the lightest client from a manager over 80% to the lowest under 70%', () => {
    const loads: Record<string, ManagerLoad> = {
      m1: { open: 17, capacity: 20, pct: 85 },
      m2: { open: 6, capacity: 20, pct: 30 },
    };
    const out = buildReassignSuggestions({
      clients: [client('c'), client('d')],
      managers: [manager('m1', 'Meera', 2), manager('m2', 'Arjun', 0)],
      load: (id) => loads[id],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ action: 'Reassign', fromId: 'm1', toId: 'm2', why: 'Meera at 85% · Arjun at 30%' });
  });

  it('suggests nothing when every client is placed and no load is set', () => {
    const out = buildReassignSuggestions({
      clients: [client('e')],
      managers: [manager('m1', 'Meera', 1, [lead('p1', 'i1', 'Priya', 1)])],
      load: () => undefined,
    });
    expect(out).toEqual([]);
  });
});
