import { z } from 'zod';

const note = z.string().trim().max(2000);

/**
 * The body of POST /api/budgets/[id]/workflow. Publish and approve take an optional note, which
 * the workspace sends as null when the box is empty (UAT D-T17-01: null was refused, so neither
 * button worked without a typed note). Return and revise need a reason.
 */
export const budgetWorkflowSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('publish'), note: note.nullish() }),
  z.object({ action: z.literal('approve'), note: note.nullish() }),
  z.object({ action: z.literal('reject'), note: note.min(1) }),
  z.object({ action: z.literal('revise'), note: note.min(1) }),
]);

export type BudgetWorkflowInput = z.infer<typeof budgetWorkflowSchema>;
