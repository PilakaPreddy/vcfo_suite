import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { getRegUpdate, saveRegUpdateEdit } from '@/db/repositories/reg-updates';
import type { RegReviewEdit, RegVerifyProblem } from './types';
import { verifyRegSummary } from './verify';

/** A reviewer's edit is checked by the same code as the model's output. */
export async function editUpdate(
  ctx: AuthContext,
  id: string,
  edit: RegReviewEdit,
): Promise<{ saved: boolean; problems: RegVerifyProblem[] }> {
  const current = await getRegUpdate(ctx, id);
  if (!current?.sourceText) return { saved: false, problems: [] };
  const { acceptProblems, ...fields } = edit;
  const problems = verifyRegSummary(fields, current.sourceText);
  const saved = await saveRegUpdateEdit(ctx, id, fields, problems, acceptProblems === true, current.sourceName);
  return { saved, problems };
}
