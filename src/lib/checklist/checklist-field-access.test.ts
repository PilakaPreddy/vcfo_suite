import { describe, expect, it } from 'vitest';
import { filterFieldsByViewer, isMilestoneFormReadOnly } from './checklist-field-access';

describe('isMilestoneFormReadOnly', () => {
  it('locks client view after intern delivery', () => {
    expect(
      isMilestoneFormReadOnly({
        variant: 'client',
        itemId: 'post-1',
        itemState: { status: 'completed', deliveredToClientAt: '2026-06-01T00:00:00.000Z' },
      }),
    ).toBe(true);
  });

  it('lets the client edit a pre-incorporation direct-flow step the gate opens', () => {
    expect(isMilestoneFormReadOnly({ variant: 'client', itemId: 'pre-5' })).toBe(false);
    expect(isMilestoneFormReadOnly({ variant: 'client', itemId: 'pre-13', readOnly: true })).toBe(true);
  });

  it('keeps intern/manager form editable after delivery', () => {
    expect(
      isMilestoneFormReadOnly({
        variant: 'admin',
        itemId: 'pre-5',
        itemState: {
          status: 'completed',
          deliveredToClientAt: '2026-06-01T00:00:00.000Z',
        },
      }),
    ).toBe(false);
  });

  it('respects explicit readOnly for staff', () => {
    expect(
      isMilestoneFormReadOnly({
        readOnly: true,
        variant: 'admin',
        itemId: 'pre-5',
        itemState: { status: 'completed', deliveredToClientAt: '2026-06-01T00:00:00.000Z' },
      }),
    ).toBe(true);
  });

  it('does not lock staff on non-delivery steps', () => {
    expect(
      isMilestoneFormReadOnly({
        variant: 'admin',
        itemId: 'pre-1',
        itemState: { reviewStatus: 'accepted', status: 'completed' },
      }),
    ).toBe(false);
  });
});

describe('filterFieldsByViewer — direct flow', () => {
  const fields = [
    { id: 'a', label: 'A', type: 'text' as const },
    { id: 'b', label: 'B', type: 'text' as const, filledBy: 'intern' as const },
  ];

  it('shows the client every field of a direct-flow step', () => {
    expect(filterFieldsByViewer(fields, 'client', 'pre-5').map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('hides the project lead\'s own fields from the client (Part A NIC codes)', () => {
    const partA = [
      { id: 'businessDescription', label: 'Business', type: 'text' as const },
      { id: 'nicCode', label: 'NIC', type: 'text' as const },
      { id: 'additionalNicCodes', label: 'More NIC', type: 'repeat' as const },
    ];
    expect(filterFieldsByViewer(partA, 'client', 'pre-1').map((f) => f.id)).toEqual(['businessDescription']);
    expect(filterFieldsByViewer(partA, 'admin', 'pre-1').map((f) => f.id)).toEqual([
      'businessDescription',
      'nicCode',
      'additionalNicCodes',
    ]);
  });

  it('keeps hiding lead fields elsewhere', () => {
    expect(filterFieldsByViewer(fields, 'client', 'post-1').map((f) => f.id)).toEqual(['a']);
    expect(filterFieldsByViewer(fields, 'client').map((f) => f.id)).toEqual(['a']);
  });
});
