import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getBudgetView, markSection, sendBackSection, setSectionOwners } from '@/db/repositories/budgets';
import { parseJsonBody } from '@/lib/api/parse-body';
import { notifyOwnersAssigned, notifySectionDone, notifySectionSentBack } from '@/lib/budget/notify';
import { sectionParam } from '@/lib/budget/wire';
import { budgetError, denied, guardBudgets } from '../../../_respond';

type Context = { params: Promise<{ id: string; section: string }> };

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('owners'), userIds: z.array(z.string()).max(20), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }),
  z.object({ action: z.literal('done') }),
  z.object({ action: z.literal('reopen') }),
  z.object({ action: z.literal('send_back'), note: z.string().trim().min(1).max(2000) }),
]);

/** POST /api/budgets/[id]/sections/[section] — owners and due date, done, reopen, send back. */
export async function POST(request: Request, { params }: Context) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id, section: raw } = await params;
  const section = sectionParam.safeParse(raw);
  if (!section.success) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  const actor = { id: guard.ctx.userId, name: guard.ctx.name };
  try {
    const input = body.data;
    if (input.action === 'owners') {
      const view = await getBudgetView(guard.ctx, id);
      const added = await setSectionOwners(guard.ctx, id, section.data, { userIds: input.userIds, dueDate: input.dueDate }, view.people.map((p) => p.userId));
      if (added.length) await notifyOwnersAssigned(id, section.data, added, input.dueDate, actor);
    } else if (input.action === 'send_back') {
      await sendBackSection(guard.ctx, id, section.data, input.note);
      await notifySectionSentBack(id, section.data, input.note, actor);
    } else {
      await markSection(guard.ctx, id, section.data, input.action === 'done');
      if (input.action === 'done') await notifySectionDone(id, section.data, actor);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return budgetError(e);
  }
}
