import { describe, expect, it } from 'vitest';
import { getPreIncPhases } from '@/data/checklist';
import { normalizeChecklistItemSlice, type ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import {
  canRoleEditField,
  DIRECT_FLOW_STEP_IDS,
  directFlowRoleLabel,
  directReopenPatch,
  directSubmitPatch,
  isAwaitingManagerDecision,
  isClientOnlyField,
  isDirectFlowStep,
  isDirectFlowStepComplete,
  isLeadOnlyField,
  isWaitingOnLead,
  LEAD_ONLY_STEP_IDS,
  MANAGER_APPROVAL_STEP_ID,
  stripClientOnlyResponses,
  stripLeadOnlyResponses,
  waitingOnLeadPatch,
} from '@/lib/incorporation/pre-inc-direct-flow';

const NOW = '2026-10-12T10:00:00.000Z';

describe('direct-flow step list', () => {
  it('is every active pre-incorporation step except the board resolution, plus GST registration', () => {
    const active = getPreIncPhases().flatMap((phase) => phase.items.map((item) => item.id));
    expect(new Set([...active.filter((id) => id !== MANAGER_APPROVAL_STEP_ID), 'reg-4'])).toEqual(
      new Set(DIRECT_FLOW_STEP_IDS),
    );
  });

  it('leaves out legacy, post-incorporation and registration steps', () => {
    for (const id of ['pre-2', 'pre-6', 'pre-8', 'post-1', 'reg-1']) {
      expect(isDirectFlowStep(id)).toBe(false);
    }
  });

  it('has no lead-only whole steps (owner decision)', () => {
    expect(LEAD_ONLY_STEP_IDS.size).toBe(0);
  });
});

describe('lead-only fields', () => {
  it('covers the NIC fields and the concrete ids of the NIC repeat group', () => {
    expect(isLeadOnlyField('pre-1', 'nicCode')).toBe(true);
    expect(isLeadOnlyField('pre-1', 'nicBusinessType')).toBe(true);
    expect(isLeadOnlyField('pre-1', 'additionalNicCodes')).toBe(true);
    expect(isLeadOnlyField('pre-1', 'additionalNicCodes.e1a2b3c4.code')).toBe(true);
    expect(isLeadOnlyField('pre-1', 'proposedName1')).toBe(false);
    expect(isLeadOnlyField('pre-13', 'nicCode')).toBe(false);
  });

  it('strips lead-only keys from a client patch', () => {
    expect(
      stripLeadOnlyResponses('pre-1', {
        proposedName1: 'Acme India Private Limited',
        nicCode: '62011',
        nicBusinessType: 'Software',
        additionalNicCodes: 'e1',
        'additionalNicCodes.e1.code': '62020',
      }),
    ).toEqual({ proposedName1: 'Acme India Private Limited' });
  });
});

describe('canRoleEditField', () => {
  it('lets the lead edit everything except the client\'s own Part A answers', () => {
    expect(canRoleEditField('intern', 'pre-1', 'nicCode')).toBe(true);
    expect(canRoleEditField('intern', 'pre-1', 'additionalNicCodes.e12345678.code')).toBe(true);
    expect(canRoleEditField('intern', 'pre-1', 'stepRemarks')).toBe(true);
    expect(canRoleEditField('intern', 'pre-1', 'businessDescription')).toBe(false);
    expect(canRoleEditField('intern', 'pre-1', 'director1FirstName')).toBe(false);
    expect(canRoleEditField('intern', 'pre-13', 'equityShares')).toBe(true);
    expect(canRoleEditField('intern', 'post-1', 'x')).toBe(true);
  });

  it('strips the client\'s Part A answers from a lead\'s save', () => {
    expect(
      stripClientOnlyResponses('pre-1', { nicCode: '62011', businessDescription: 'x', stepRemarks: 'note' }),
    ).toEqual({ nicCode: '62011', stepRemarks: 'note' });
    expect(stripClientOnlyResponses('pre-14', { registeredOfficeCompleteAddress: 'a' })).toEqual({
      registeredOfficeCompleteAddress: 'a',
    });
    expect(isClientOnlyField('pre-1', 'parentEntityName')).toBe(true);
    expect(isClientOnlyField('pre-1', 'nicCode')).toBe(false);
  });

  it('lets the client edit direct-flow fields but not the lead-only ones', () => {
    expect(canRoleEditField('client', 'pre-1', 'proposedName1')).toBe(true);
    expect(canRoleEditField('client', 'pre-1', 'nicCode')).toBe(false);
    expect(canRoleEditField('client', 'pre-12', 'dateOfIncorporation')).toBe(true);
    expect(canRoleEditField('client', 'pre-2', 'anything')).toBe(false);
    expect(canRoleEditField('client', 'post-1', 'anything')).toBe(false);
  });

  it('keeps managers read-only on direct-flow steps', () => {
    expect(canRoleEditField('manager', 'pre-1', 'proposedName1')).toBe(false);
    expect(canRoleEditField('admin', 'pre-13', 'equityShares')).toBe(false);
    expect(canRoleEditField('manager', 'post-1', 'x')).toBe(true);
  });
});

describe('directSubmitPatch', () => {
  it('completes the step and clears the review trail', () => {
    const patch = directSubmitPatch({ actorId: 'u1', actorName: ' Divya ', actorRole: 'intern', now: NOW });
    expect(patch).toMatchObject({
      status: 'completed',
      completedOn: '2026-10-12',
      locked: true,
      unlockedFields: [],
      clientSubmittedAt: NOW,
      deliveredToClientAt: NOW,
      reviewStatus: 'accepted',
      reviewedAt: NOW,
      reviewedBy: 'u1',
      submittedByName: 'Divya',
      submittedByRole: 'intern',
    });
    expect(patch.reviewSource).toBeUndefined();
    expect('approval' in patch).toBe(false);
    expect('clientFillRequest' in patch).toBe(false);
  });

  it('reads as complete', () => {
    const slice = { status: 'in-progress', ...directSubmitPatch({ actorId: 'u', actorRole: 'client', now: NOW }) } as ChecklistItemStateSlice;
    expect(isDirectFlowStepComplete('pre-13', slice)).toBe(true);
  });
});

describe('waitingOnLeadPatch', () => {
  it('waits without completing', () => {
    const slice = { status: 'in-progress', ...waitingOnLeadPatch({ actorId: 'c', actorName: 'Kiran', now: NOW }) } as ChecklistItemStateSlice;
    expect(isDirectFlowStepComplete('pre-1', slice)).toBe(false);
    expect(isWaitingOnLead('pre-1', slice)).toBe(true);
    expect(slice.clientSubmittedAt).toBeUndefined();
  });

  it('ends once the lead submits', () => {
    const slice = {
      status: 'in-progress',
      ...waitingOnLeadPatch({ actorId: 'c', now: NOW }),
      ...directSubmitPatch({ actorId: 'l', actorRole: 'intern', now: NOW }),
    } as ChecklistItemStateSlice;
    expect(isWaitingOnLead('pre-1', slice)).toBe(false);
  });
});

describe('directReopenPatch', () => {
  it('opens a submitted step again', () => {
    const submitted = { status: 'in-progress', ...directSubmitPatch({ actorId: 'l', actorRole: 'intern', now: NOW }) } as ChecklistItemStateSlice;
    const reopened = { ...submitted, ...directReopenPatch() } as ChecklistItemStateSlice;
    expect(isDirectFlowStepComplete('pre-13', reopened)).toBe(false);
    expect(reopened.status).toBe('in-progress');
  });
});

describe('old approval-era data on a direct-flow step (section 3.12)', () => {
  const read = (slice: ChecklistItemStateSlice) => isDirectFlowStepComplete('pre-13', slice);

  it('accepted reads complete', () => {
    expect(read({ status: 'in-progress', reviewStatus: 'accepted' })).toBe(true);
  });

  it('completed reads complete', () => {
    expect(read({ status: 'completed' })).toBe(true);
  });

  it('a pending lead request reads complete', () => {
    expect(
      read({ status: 'in-progress', reviewStatus: 'reviewing', reviewSource: 'lead_manager_request', locked: true }),
    ).toBe(true);
  });

  it('a pending client submit reads complete', () => {
    expect(
      read({
        status: 'in-progress',
        reviewStatus: 'reviewing',
        reviewSource: 'client_submission',
        locked: true,
        clientSubmittedAt: NOW,
      }),
    ).toBe(true);
  });

  it('rejected reads open', () => {
    expect(read({ status: 'completed', reviewStatus: 'rejected' })).toBe(false);
  });

  it('reopened fields read open', () => {
    expect(read({ status: 'completed', reviewStatus: 'accepted', unlockedFields: ['equityShares'] })).toBe(false);
  });

  it('ignores the approval and client-fill sub-states', () => {
    expect(
      read({
        status: 'in-progress',
        approval: { state: 'pending_client' },
        clientFillRequest: { status: 'pending_manager', requestedBy: 'l', requestedAt: NOW },
      }),
    ).toBe(false);
    expect(
      read({ status: 'completed', approval: { state: 'change_requested' } }),
    ).toBe(true);
  });
});

describe('isAwaitingManagerDecision', () => {
  const pending: ChecklistItemStateSlice = {
    status: 'in-progress',
    reviewStatus: 'reviewing',
    reviewSource: 'lead_manager_request',
  };

  it('is never true on a direct-flow step', () => {
    expect(isAwaitingManagerDecision('pre-13', pending)).toBe(false);
  });

  it('keeps the board resolution and other steps', () => {
    expect(isAwaitingManagerDecision('pre-2', pending)).toBe(true);
    expect(isAwaitingManagerDecision('post-1', pending)).toBe(true);
    expect(isAwaitingManagerDecision('post-1', { status: 'in-progress' })).toBe(false);
  });
});

describe('slice keys survive a save', () => {
  it('normalizeChecklistItemSlice keeps every direct-flow key', () => {
    const slice = normalizeChecklistItemSlice(
      {
        status: 'completed',
        submittedByName: 'Divya',
        submittedByRole: 'intern',
        waitingOnLeadAt: NOW,
        waitingOnLeadByName: 'Kiran',
        lastEditedAt: NOW,
        lastEditedByName: 'Kiran',
        lastEditedByRole: 'client',
      },
      'pre-1',
    );
    expect(slice).toMatchObject({
      submittedByName: 'Divya',
      submittedByRole: 'intern',
      waitingOnLeadAt: NOW,
      waitingOnLeadByName: 'Kiran',
      lastEditedAt: NOW,
      lastEditedByName: 'Kiran',
      lastEditedByRole: 'client',
    });
    expect(slice.responses).toBeUndefined();
  });
});

describe('directFlowRoleLabel', () => {
  it('never says intern', () => {
    expect(directFlowRoleLabel('intern')).toBe('Project Lead');
    expect(directFlowRoleLabel('client')).toBe('Client');
  });
});
