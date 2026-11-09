import { describe, expect, it } from 'vitest';
import { capabilityAnswer, isCapabilityQuestion } from './capabilities';

describe('isCapabilityQuestion', () => {
  it.each([
    'what are the things you can do from chat in spice a',
    'What can you do?',
    'how can you help',
    'what can I ask here',
    'what are u able to do',
  ])('matches "%s"', (q) => expect(isCapabilityQuestion(q)).toBe(true));

  it.each(['What is SPICe+ Part A?', 'Which projects are waiting on clients?', 'Fill the PAN for Routeware'])(
    'leaves "%s" alone',
    (q) => expect(isCapabilityQuestion(q)).toBe(false),
  );
});

describe('capabilityAnswer', () => {
  it('lists the registry actions for a lead and never sends them to their lead', async () => {
    const answer = await capabilityAnswer('intern', 'admin');
    expect(answer.origin).toBe('deterministic');
    expect(answer.line).not.toMatch(/read only|your (project )?lead/i);
    const listed = answer.visual?.type === 'steps' ? answer.visual.items.map((i) => i.label).join(' ') : answer.line;
    expect(listed).toMatch(/Fill checklist answers/);
    expect(answer.line).toMatch(/never submit to MCA/);
  });

  it('tells a client plainly that the lead makes changes', async () => {
    const answer = await capabilityAnswer('client', 'client');
    expect(answer.visual).toBeUndefined();
    expect(answer.line).toMatch(/your project lead does that/);
  });
});
