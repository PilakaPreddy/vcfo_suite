import { describe, expect, it } from 'vitest';
import { getItem } from '@/data/checklist';
import { ACTIVITY_SEED } from '@/data/compliance-activities';
import { CLIENT_RESPONSE_FIELDS } from '@/lib/checklist/checklist-responses';
import { ASSIST_AGENTS, allSubAgents, assistHostAllowed, findSubAgent } from './catalog';
import { getRecipe } from './registry';

describe('assist agent catalog', () => {
  it('has the four agents in order and the sixteen sub-agents', () => {
    expect(ASSIST_AGENTS.map((a) => a.id)).toEqual(['incorporation', 'post-incorporation', 'registration', 'compliance']);
    expect(allSubAgents().map((s) => s.id)).toEqual([
      'spice-a', 'spice-b', 'agile-pro-s', 'emoa', 'eaoa', 'inc-9',
      'inc-20a', 'adt-1',
      'gst-reg-01', 'udyam', 'iec', 'shops-establishment', 'pt',
      'dir-3-kyc', 'aoc-4', 'mgt-7',
    ]);
  });

  it('gives every sub-agent its own agent id', () => {
    for (const agent of ASSIST_AGENTS) for (const sub of agent.subAgents) expect(sub.agent).toBe(agent.id);
  });

  it('names checklist steps that exist, with the right prefix per agent', () => {
    const prefix: Record<string, RegExp> = { incorporation: /^pre-\d+$/, 'post-incorporation': /^post-\d+$/, registration: /^reg-\d+$/ };
    for (const sub of allSubAgents()) {
      if (sub.agent === 'compliance') {
        expect(sub.stepId).toBeNull();
        expect(ACTIVITY_SEED.some((a) => a.id === sub.activityId)).toBe(true);
        continue;
      }
      expect(sub.stepId, sub.id).toMatch(prefix[sub.agent]!);
      expect(getItem(sub.stepId!), `${sub.id} → ${sub.stepId}`).toBeDefined();
    }
  });

  it('writes the SRN only into an existing staff field on that step', () => {
    for (const sub of allSubAgents().filter((s) => s.srnField)) {
      const fields = CLIENT_RESPONSE_FIELDS[sub.stepId!] ?? [];
      const field = fields.find((f) => f.id === sub.srnField);
      expect(field, `${sub.id} ${sub.srnField}`).toBeDefined();
      expect(field!.type).toBe('textarea');
    }
  });

  it('points recipes at files the registry holds, and only beta or ready agents have one', () => {
    for (const sub of allSubAgents()) {
      if (sub.recipeId) {
        expect(getRecipe(sub.recipeId)?.subAgent).toBe(sub.id);
        expect(sub.status).not.toBe('later');
      } else {
        expect(sub.status).toBe('later');
      }
    }
    expect(findSubAgent('spice-a')?.status).toBe('beta');
  });

  it('allows the mock host always and live hosts only when enabled', () => {
    expect(assistHostAllowed('localhost:3100', {})).toBe(true);
    expect(assistHostAllowed('www.mca.gov.in', {})).toBe(false);
    expect(assistHostAllowed('www.mca.gov.in', { ASSIST_LIVE_PORTALS: 'true' })).toBe(true);
    expect(assistHostAllowed('mock.sbc.test', { ASSIST_MOCK_HOSTS: 'mock.sbc.test' })).toBe(true);
    expect(assistHostAllowed('localhost', { ASSIST_MOCK_HOSTS: 'mock.sbc.test' })).toBe(false);
  });
});
