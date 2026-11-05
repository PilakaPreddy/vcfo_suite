import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { actionsForRole, getAction, indexActions } from './registry';
import { agentMayExecute, defineAction, needsApproval, type ActionTier } from './types';

const action = (name: string, tier: ActionTier = 'T0') =>
  defineAction({
    name,
    description: name,
    input: z.object({}),
    tier,
    roles: ['admin'],
    preview: async () => null,
    execute: async () => ({ ok: true, summary: 'done' }),
  });

describe('action registry', () => {
  it('indexes actions by name', () => {
    const index = indexActions([['tasks', [action('tasks.create')]]]);
    expect(index.get('tasks.create')?.description).toBe('tasks.create');
  });

  it('refuses an action outside its area and a duplicate name', () => {
    expect(() => indexActions([['tasks', [action('labour.close')]]])).toThrow(/outside area/);
    expect(() => indexActions([['tasks', [action('tasks.a'), action('tasks.a')]]])).toThrow(/Duplicate/);
  });

  it('loads every area file and finds nothing that was not registered', async () => {
    expect(await getAction('no.such')).toBeNull();
    expect(Array.isArray(await actionsForRole('admin'))).toBe(true);
  });
});

describe('tier rules', () => {
  it('never lets the agent execute T4', () => {
    expect(agentMayExecute('T4')).toBe(false);
    for (const tier of ['T0', 'T1', 'T2', 'T3'] as const) expect(agentMayExecute(tier)).toBe(true);
  });

  it('asks for approval on T2 and T3 only', () => {
    expect(['T0', 'T1', 'T2', 'T3', 'T4'].filter((t) => needsApproval(t as ActionTier))).toEqual(['T2', 'T3']);
  });
});
