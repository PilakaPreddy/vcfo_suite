import { describe, expect, it } from 'vitest';
import { listPendingApprovals, pendingApprovalKind } from '@/lib/projects/pending-approvals';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';

const eng = { id: 'e1', companyName: 'Demo', slug: 'demo', stage: 'Pre-Incorporation' as const };
const pendingLead: ChecklistItemStateSlice = {
  status: 'in-progress',
  reviewStatus: 'reviewing',
  reviewSource: 'lead_manager_request',
};

function rows(state: Record<string, ChecklistItemStateSlice>) {
  return listPendingApprovals([eng], () => state);
}

describe('listPendingApprovals', () => {
  it('lists no direct-flow step, even with old pending data', () => {
    expect(
      rows({
        'pre-1': pendingLead,
        'pre-13': { status: 'in-progress', reviewStatus: 'reviewing', reviewSource: 'client_submission', locked: true, clientSubmittedAt: 'x' },
        'pre-12': { status: 'in-progress', clientFillRequest: { status: 'pending_manager', requestedBy: 'l', requestedAt: 'x' } },
      }),
    ).toEqual([]);
  });

  it('lists the board resolution as "Board resolution"', () => {
    const out = rows({ 'pre-2': pendingLead });
    expect(out).toHaveLength(1);
    expect(out[0]!.itemId).toBe('pre-2');
    expect(pendingApprovalKind(out[0]!)).toBe('Board resolution');
  });

  it('keeps post-incorporation approvals', () => {
    const out = rows({ 'post-1': pendingLead });
    expect(out.map((r) => r.itemId)).toEqual(['post-1']);
    expect(pendingApprovalKind(out[0]!)).toBe('Lead request');
  });

  it('lists registration steps: a lead request and a client-fill request (UAT D-T07-01)', () => {
    const out = listPendingApprovals([{ ...eng, stage: 'Post-Incorporation' }], () => ({
      'reg-7': pendingLead,
      'reg-6': { status: 'not-started', clientFillRequest: { status: 'pending_manager', requestedBy: 'l', requestedAt: 'x', requestedByName: 'Leo Lead' } },
    }));
    expect(out.map((r) => [r.itemId, pendingApprovalKind(r)])).toEqual([
      ['reg-6', 'Send to client · Leo Lead'],
      ['reg-7', 'Lead request'],
    ]);
  });

  it('still lists registration approvals once the project is in Compliance', () => {
    const out = listPendingApprovals([{ ...eng, stage: 'Operational Readiness' }], () => ({ 'reg-7': pendingLead, 'post-1': pendingLead }));
    expect(out.map((r) => r.itemId)).toEqual(['reg-7']);
  });
});
