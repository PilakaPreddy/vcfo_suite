import { NextResponse } from 'next/server';
import { z } from 'zod';
import { decideChangeset, rejectChangeset } from '@/lib/ask/changeset/apply';
import { changesetRefusal } from '@/lib/ask/changeset/route-errors';
import { loadChangesetView } from '@/lib/ask/changeset/view';
import { requireAsk } from '@/lib/ask/route-guard';

type RouteContext = { params: Promise<{ id: string }> };

const body = z.union([
  z.object({ contentHash: z.string().length(64), accept: z.array(z.string().uuid()).min(1).max(200) }),
  z.object({ reject: z.literal(true) }),
]);

/** POST: a person's approval of the rows they accepted. The agent has no call that reaches this. */
export async function POST(request: Request, context: RouteContext) {
  const gate = await requireAsk();
  if (gate.ok === false) return gate.response;
  const { id } = await context.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  try {
    if ('reject' in parsed.data) await rejectChangeset(gate.ctx, id);
    else await decideChangeset(gate.ctx, id, parsed.data);
    return NextResponse.json(await loadChangesetView(gate.ctx, id));
  } catch (error) {
    return changesetRefusal(error);
  }
}
