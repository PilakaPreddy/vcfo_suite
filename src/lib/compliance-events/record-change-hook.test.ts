import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';

/**
 * The checklist save hook proposes a compliance event only for an incorporated company, only when a
 * watched value changed on this save, and never breaks the save.
 */

const syncRecordChangeProposals = vi.fn();
vi.mock('@/db/repositories/compliance-events', () => ({ syncRecordChangeProposals: (...a: unknown[]) => syncRecordChangeProposals(...a) }));
vi.mock('@/db/repositories/engagements', () => ({ checklistStateFromRow: (row: { checklistState?: unknown }) => row.checklistState ?? {} }));

const { proposeEventsFromChecklistSave } = await import('./record-change-hook');

const lead: AuthContext = { userId: 'u-lead', email: 'lead@x.test', name: 'Lead', role: 'intern' };
const ENG = '11111111-1111-4111-8111-111111111111';
const incorporated = { id: ENG, incorporationDate: '2026-06-01', stage: 'Post-Incorporation', checklistState: {} } as never;
const notYet = { id: ENG, incorporationDate: null, stage: 'Pre-Incorporation', checklistState: {} } as never;
const slice = (responses: Record<string, string>) => ({ responses }) as never;
const NOW = new Date('2026-11-10T06:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  syncRecordChangeProposals.mockResolvedValue([{ id: 'ev-1' }]);
});

describe('proposeEventsFromChecklistSave', () => {
  it('proposes when an incorporated company changes its registered office', async () => {
    const n = await proposeEventsFromChecklistSave(lead, {
      engagement: incorporated,
      itemId: 'pre-14',
      prevSlice: slice({ registeredOfficeCompleteAddress: '12 MG Road' }),
      nextSlice: slice({ registeredOfficeCompleteAddress: '4 Park Street' }),
      now: NOW,
    });
    expect(n).toBe(1);
    expect(syncRecordChangeProposals).toHaveBeenCalledWith(lead, {
      engagementId: ENG,
      watchKey: 'pre-14:address',
      before: '12 MG Road',
      after: '4 Park Street',
      occurredOn: '2026-11-10',
    });
  });

  it('does nothing before incorporation', async () => {
    await proposeEventsFromChecklistSave(lead, {
      engagement: notYet,
      itemId: 'pre-14',
      prevSlice: slice({ registeredOfficeCompleteAddress: '12 MG Road' }),
      nextSlice: slice({ registeredOfficeCompleteAddress: '4 Park Street' }),
    });
    expect(syncRecordChangeProposals).not.toHaveBeenCalled();
  });

  it('does nothing when the watched value did not change on this save', async () => {
    await proposeEventsFromChecklistSave(lead, {
      engagement: incorporated,
      itemId: 'post-2',
      prevSlice: slice({ auditorName: 'A & Co', auditorDocsNotes: 'old' }),
      nextSlice: slice({ auditorName: 'A & Co', auditorDocsNotes: 'new' }),
    });
    expect(syncRecordChangeProposals).not.toHaveBeenCalled();
  });

  it('ignores steps it does not watch', async () => {
    await proposeEventsFromChecklistSave(lead, { engagement: incorporated, itemId: 'pre-1', prevSlice: slice({ a: '1' }), nextSlice: slice({ a: '2' }) });
    expect(syncRecordChangeProposals).not.toHaveBeenCalled();
  });

  it('never throws, so the save stands', async () => {
    syncRecordChangeProposals.mockRejectedValue(new Error('relation "compliance_events" does not exist'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      proposeEventsFromChecklistSave(lead, {
        engagement: incorporated,
        itemId: 'post-11',
        prevSlice: slice({ inc22NewAddress: 'Old' }),
        nextSlice: slice({ inc22NewAddress: 'New' }),
      }),
    ).resolves.toBe(0);
    err.mockRestore();
  });
});
