import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';

/**
 * The SRN write-back when the run URL names the engagement by its slug (API.md accepts uuid, legacy
 * id or slug). The checklist lookup and save must get the uuid the run repository resolved, never
 * the slug: Postgres refuses a slug as a uuid and the write-back used to report `checklist_refused`.
 */

const UUID = '44444444-4444-4444-8444-444444444404';
const RUN = '55555555-5555-4555-8555-555555555505';
const CTX: AuthContext = { userId: 'user-intern', email: 'lead@vcfo.local', name: 'Lead', role: 'intern' };

const getEngagementById = vi.fn();
const applyChecklistPatch = vi.fn();
const updateAgentRun = vi.fn();

vi.mock('@/db/repositories/engagements', () => ({
  getEngagementById: (...a: unknown[]) => getEngagementById(...a),
  checklistStateFromRow: (row: { state: unknown }) => row.state,
  assertEngagementAccess: vi.fn(),
}));
vi.mock('@/lib/incorporation/apply-checklist-patch', () => ({ applyChecklistPatch: (...a: unknown[]) => applyChecklistPatch(...a) }));
vi.mock('@/db/repositories/assist-agent-runs', () => ({
  updateAgentRun: (...a: unknown[]) => updateAgentRun(...a),
  getAgentRun: vi.fn(),
  AssistAgentAccessError: class extends Error {},
}));
vi.mock('@/auth/guards', () => ({ requireAnyRole: async () => ({ ok: true, ctx: CTX }) }));

const { recordRunSrn } = await import('./record-srn');
const { PATCH } = await import('../../../app/api/engagements/[id]/assist-runs/[runId]/route');

beforeEach(() => {
  vi.clearAllMocks();
  getEngagementById.mockImplementation(async (_ctx: AuthContext, id: string) => (id === UUID ? { id: UUID, state: { 'pre-4': { responses: {} } } } : Promise.reject(new Error('invalid input syntax for type uuid'))));
  applyChecklistPatch.mockResolvedValue({});
});

describe('SRN write-back by engagement slug', () => {
  it('recordRunSrn reads and saves the checklist by the uuid', async () => {
    expect(await recordRunSrn(CTX, UUID, 'spice-a', 'AA1234567', new Date('2026-11-09T10:00:00Z'))).toEqual({ recorded: true, stepId: 'pre-4', field: 'nameApplicationFilingNotes' });
    expect(applyChecklistPatch).toHaveBeenCalledWith(CTX, UUID, 'pre-4', { responses: { nameApplicationFilingNotes: 'SRN AA1234567 (VCFO Assist, 2026-11-09)' } });
  });

  it('PATCH under a slug URL records the SRN through the resolved uuid', async () => {
    updateAgentRun.mockResolvedValue({ run: { id: RUN, status: 'done', srn: 'AA1234567', subAgent: 'spice-a' }, finished: true, engagementDbId: UUID });
    const request = new Request(`http://localhost/api/engagements/acme-labs/assist-runs/${RUN}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'done', srn: 'AA1234567' }),
    });
    const res = await PATCH(request, { params: Promise.resolve({ id: 'acme-labs', runId: RUN }) });
    const body = await res.json();
    expect(updateAgentRun).toHaveBeenCalledWith(CTX, 'acme-labs', RUN, expect.objectContaining({ status: 'done' }));
    expect(body.srnWriteBack).toEqual({ recorded: true, stepId: 'pre-4', field: 'nameApplicationFilingNotes' });
    expect(getEngagementById).toHaveBeenCalledWith(CTX, UUID);
    expect(applyChecklistPatch.mock.calls[0]![1]).toBe(UUID);
  });
});
