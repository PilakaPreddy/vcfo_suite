import { NextResponse } from 'next/server';
import { getOwnAskRun } from '@/db/repositories/ask-runs';
import { emptyDropState, type DropRunView, type DropState } from '@/lib/ask/drop/types';
import { requireAsk } from '@/lib/ask/route-guard';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * GET /api/ask/runs/:id: the progress of a run, for the panel's poll. Only the run's owner reads it;
 * anyone else gets a 404, as for a run that does not exist. The state is stored masked, so nothing
 * here carries an identity number.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAsk();
  if (gate.ok === false) return gate.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const run = await getOwnAskRun(gate.ctx, id);
    if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const state: DropState = { ...emptyDropState(), ...((run.state ?? {}) as unknown as Partial<DropState>) };
    const view: DropRunView = {
      id: run.id,
      status: run.status,
      progress: state.progress,
      files: state.files,
      groups: state.groups,
      unplaced: state.unplaced,
      answerMessageId: state.answerMessageId ?? null,
    };
    return NextResponse.json(view, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[ask-vcfo] run read failed', error);
    return NextResponse.json({ error: 'Could not load the progress' }, { status: 500 });
  }
}
