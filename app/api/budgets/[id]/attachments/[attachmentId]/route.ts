import { NextResponse } from 'next/server';
import { attachmentDownloadUrl, removeAttachment } from '@/db/repositories/budgets';
import { budgetError, denied, guardBudgets } from '../../../_respond';

type Context = { params: Promise<{ id: string; attachmentId: string }> };

/** GET — send the person to a short-lived download link. */
export async function GET(_request: Request, { params }: Context) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id, attachmentId } = await params;
  try {
    return NextResponse.redirect(await attachmentDownloadUrl(guard.ctx, id, attachmentId));
  } catch (e) {
    return budgetError(e);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id, attachmentId } = await params;
  try {
    await removeAttachment(guard.ctx, id, attachmentId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return budgetError(e);
  }
}
