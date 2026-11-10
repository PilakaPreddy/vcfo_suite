import { describe, expect, it } from 'vitest';
import { budgetWorkflowSchema } from '@/lib/budget/workflow-schema';

describe('budget workflow body (UAT D-T17-01)', () => {
  it('accepts publish and approve with the empty note the workspace sends as null', () => {
    expect(budgetWorkflowSchema.safeParse({ action: 'publish', note: null }).success).toBe(true);
    expect(budgetWorkflowSchema.safeParse({ action: 'approve', note: null }).success).toBe(true);
    expect(budgetWorkflowSchema.safeParse({ action: 'publish' }).success).toBe(true);
  });
  it('still needs a reason to return or revise', () => {
    expect(budgetWorkflowSchema.safeParse({ action: 'reject', note: null }).success).toBe(false);
    expect(budgetWorkflowSchema.safeParse({ action: 'reject', note: '' }).success).toBe(false);
    expect(budgetWorkflowSchema.safeParse({ action: 'revise', note: 'Headcount changed' }).success).toBe(true);
  });
});
