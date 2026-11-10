import { describe, expect, it } from 'vitest';
import { getSentBackNotice, internLeadManagerRequestPatch, leadWritablePatch } from '@/lib/checklist/checklist-item-review';

describe('leadWritablePatch', () => {
  it('keeps a request for approval intact', () => {
    const request = internLeadManagerRequestPatch({ status: 'not-started' });
    expect(leadWritablePatch({ responses: { a: '1' }, ...request })).toEqual({
      responses: { a: '1' },
      ...request,
    });
  });

  it('drops everything that would release or decide the step', () => {
    expect(
      leadWritablePatch({
        responses: { a: '1' },
        status: 'completed',
        completedOn: '2026-09-15',
        deliveredToClientAt: '2026-09-15T10:00:00.000Z',
        reviewStatus: 'accepted',
        reviewedAt: '2026-09-15T10:00:00.000Z',
        reviewedBy: 'lead',
        approval: { state: 'pending_client' },
      }),
    ).toEqual({ responses: { a: '1' } });
    expect(leadWritablePatch({ status: 'not-applicable' })).toEqual({});
    expect(leadWritablePatch({ reviewStatus: 'rejected' })).toEqual({});
  });

  it('still lets a lead move a step to in-progress or ask the client to fill', () => {
    expect(leadWritablePatch({ status: 'in-progress' })).toEqual({ status: 'in-progress' });
    const fill = {
      status: 'pending_manager' as const,
      requestedBy: 'lead',
      requestedAt: '2026-09-15',
    };
    expect(leadWritablePatch({ clientFillRequest: fill })).toEqual({ clientFillRequest: fill });
  });

  it('re-requesting an accepted step does not carry the old completed mark', () => {
    const rerequest = internLeadManagerRequestPatch({ status: 'completed' });
    expect(rerequest.status).toBe('completed');
    expect(leadWritablePatch(rerequest).status).toBeUndefined();
    expect(leadWritablePatch(rerequest).reviewStatus).toBe('reviewing');
  });
});

describe('getSentBackNotice (UAT D-T07-02)', () => {
  it('shows the manager reason while a rejected step is open again', () => {
    expect(getSentBackNotice({ status: 'in-progress', reviewStatus: 'rejected', rejectionNote: 'Wrong establishment.' })).toBe(
      'Sent back by the manager: “Wrong establishment.”',
    );
  });
  it('falls back to a plain line without a reason, and says nothing otherwise', () => {
    expect(getSentBackNotice({ status: 'in-progress', reviewStatus: 'rejected' })).toMatch(/^Sent back by the manager\./);
    expect(getSentBackNotice({ status: 'completed', reviewStatus: 'rejected', rejectionNote: 'x' })).toBeNull();
    expect(getSentBackNotice({ status: 'in-progress', reviewStatus: 'accepted' })).toBeNull();
    expect(getSentBackNotice(null)).toBeNull();
  });
});
