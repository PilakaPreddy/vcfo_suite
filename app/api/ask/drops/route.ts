import { NextResponse } from 'next/server';
import { createAskConversation, getAskConversation } from '@/db/repositories/ask-conversations';
import { createAskRun } from '@/db/repositories/ask-runs';
import type { JsonValue } from '@/lib/ask/changeset/types';
import { askBudgets, askFlags } from '@/lib/ask/config';
import { DROP_WORKFLOW, emptyDropState } from '@/lib/ask/drop/types';
import { requireAsk } from '@/lib/ask/route-guard';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * POST /api/ask/drops: opens a drop, the container for a batch of files, folders and ZIPs a lead is
 * about to upload. Staff only. It joins the given conversation when that conversation is the
 * caller's, and starts a new one otherwise. Files then go to POST /api/ask/attachments with the
 * `dropId`, and POST /api/ask/drops/:id/start sends the drop to the background job.
 */
export async function POST(request: Request) {
  const gate = await requireAsk();
  if (gate.ok === false) return gate.response;
  const { ctx } = gate;
  if (ctx.role === 'client') return NextResponse.json({ error: 'Dropping files is not available here.' }, { status: 403 });
  const flags = askFlags();
  if (flags.killedPaths.has('fixed_workflow') || flags.killedTiers.has('T2')) {
    return NextResponse.json({ error: 'Filling in from files is switched off for now.' }, { status: 503 });
  }

  let body: { conversationId?: unknown } = {};
  try {
    const text = await request.text();
    body = text.trim() ? (JSON.parse(text) as typeof body) : {};
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const askedFor = typeof body.conversationId === 'string' ? body.conversationId : null;
  if (askedFor && !UUID.test(askedFor)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const conversation = askedFor
      ? await getAskConversation(ctx, askedFor)
      : await createAskConversation(ctx, { shell: ctx.role === 'super_admin' ? 'super' : 'admin' });
    if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const run = await createAskRun(ctx, {
      conversationId: conversation.id,
      workflow: DROP_WORKFLOW,
      goal: 'Dropped files',
      budgetTokens: askBudgets().dropMaxTokens,
      status: 'queued',
      state: emptyDropState() as unknown as JsonValue,
    });
    return NextResponse.json({ dropId: run.id, conversationId: conversation.id }, { status: 201 });
  } catch (error) {
    console.error('[ask-vcfo] drop create failed', error);
    return NextResponse.json({ error: 'Could not start the drop' }, { status: 500 });
  }
}
