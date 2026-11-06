import { NextResponse } from 'next/server';
import { z } from 'zod';
import { changesetRefusal } from '@/lib/ask/changeset/route-errors';
import { editChangesetRow } from '@/lib/ask/changeset/apply';
import { loadChangesetView } from '@/lib/ask/changeset/view';
import { requireAsk } from '@/lib/ask/route-guard';

type RouteContext = { params: Promise<{ id: string }> };

const UUID = z.string().uuid();
const editBody = z.object({ rowId: z.string().uuid(), value: z.string().max(5000) });

/** GET: the review card, with masked values only. */
export async function GET(_request: Request, context: RouteContext) {
  const gate = await requireAsk();
  if (gate.ok === false) return gate.response;
  const { id } = await context.params;
  const view = UUID.safeParse(id).success ? await loadChangesetView(gate.ctx, id) : null;
  return view ? NextResponse.json(view) : NextResponse.json({ error: 'This card is not available.' }, { status: 404 });
}

/** PATCH: a person's correction to one row. Saves nothing to the step. */
export async function PATCH(request: Request, context: RouteContext) {
  const gate = await requireAsk();
  if (gate.ok === false) return gate.response;
  const { id } = await context.params;
  const body = editBody.safeParse(await request.json().catch(() => null));
  if (!body.success || !UUID.safeParse(id).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  try {
    await editChangesetRow(gate.ctx, id, body.data.rowId, body.data.value);
    return NextResponse.json(await loadChangesetView(gate.ctx, id));
  } catch (error) {
    return changesetRefusal(error);
  }
}
