import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/repositories/engagements', () => ({}));
vi.mock('@/lib/email/send-after-response', () => ({}));

const { ChecklistPatchRefused, checklistPatchForRole } = await import('./apply-checklist-patch');

const NOW = '2026-11-06T10:00:00.000Z';
const lead = { role: 'intern' as const, name: 'Divya' };
const client = { role: 'client' as const, name: 'Asha' };

describe('checklistPatchForRole', () => {
  it('keeps a lead from writing a client-only answer on a direct-flow step', () => {
    const patch = checklistPatchForRole(lead, 'pre-1', { responses: { director1FirstName: 'Asha', nicCode: '62011' } }, undefined, NOW);
    expect(patch.responses).toEqual({ nicCode: '62011' });
  });

  it('keeps a lead from stamping a review on a direct-flow step or the manager step', () => {
    for (const step of ['pre-15', 'pre-2']) {
      const patch = checklistPatchForRole(lead, step, { reviewStatus: 'pending', locked: true, responses: { x: '1' } }, undefined, NOW);
      expect(patch.reviewStatus).toBeUndefined();
      expect(patch.locked).toBeUndefined();
    }
  });

  it('stamps who edited a direct-flow step', () => {
    const patch = checklistPatchForRole(lead, 'pre-15', { responses: { directors: 'e1' } }, undefined, NOW);
    expect(patch).toMatchObject({ lastEditedByName: 'Divya', lastEditedAt: NOW });
  });

  it('refuses a client on a direct-flow step already submitted', () => {
    expect(() => checklistPatchForRole(client, 'pre-1', { responses: { a: '1' } }, { locked: true, clientSubmittedAt: NOW, responses: {} } as never, NOW)).toThrow(ChecklistPatchRefused);
  });

  it('strips review fields from a client patch on a reviewed step', () => {
    const patch = checklistPatchForRole(client, 'post-7', { reviewStatus: 'accepted', notes: 'n' }, undefined, NOW);
    expect(patch).toEqual({ notes: 'n' });
  });
});
