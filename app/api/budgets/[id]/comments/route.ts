import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addComment, listComments } from '@/db/repositories/budgets';
import { parseJsonBody } from '@/lib/api/parse-body';
import { sectionParam } from '@/lib/budget/wire';
import { budgetError, denied, guardBudgets, type IdContext } from '../../_respond';

const schema = z.object({ section: sectionParam, rowId: z.string().uuid().nullable().optional(), body: z.string().trim().min(1).max(2000) });

export async function GET(_request: Request, { params }: IdContext) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id } = await params;
  try {
    return NextResponse.json({ comments: await listComments(guard.ctx, id) });
  } catch (e) {
    return budgetError(e);
  }
}

export async function POST(request: Request, { params }: IdContext) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id } = await params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    await addComment(guard.ctx, id, body.data);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return budgetError(e);
  }
}
