import { NextResponse } from 'next/server';
import { z } from 'zod';
import { undoChangeset } from '@/lib/ask/changeset/apply';
import { changesetRefusal } from '@/lib/ask/changeset/route-errors';
import { loadChangesetView } from '@/lib/ask/changeset/view';
import { requireAsk } from '@/lib/ask/route-guard';

type RouteContext = { params: Promise<{ id: string }> };

/** POST: puts back what the card saved, for the person who saved it. */
export async function POST(_request: Request, context: RouteContext) {
  const gate = await requireAsk();
  if (gate.ok === false) return gate.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  try {
    await undoChangeset(gate.ctx, id);
    return NextResponse.json(await loadChangesetView(gate.ctx, id));
  } catch (error) {
    return changesetRefusal(error);
  }
}
