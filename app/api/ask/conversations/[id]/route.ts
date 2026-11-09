import { NextResponse } from 'next/server';
import { deleteOwnAskConversation, getAskConversationWithMessages } from '@/db/repositories/ask-conversations';
import { findActiveAskRun } from '@/db/repositories/ask-runs';
import { requireAsk } from '@/lib/ask/route-guard';

/** GET /api/ask/conversations/[id] — owner-only resume (U3). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAsk();
  if (gate.ok === false) return gate.response;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const found = await getAskConversationWithMessages(gate.ctx, id);
    if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    // A drop still working in the background, so a reopened panel picks its progress poll back up.
    const active = await findActiveAskRun(gate.ctx, found.conversation.id, new Date());
    return NextResponse.json({
      activeRunId: active?.id ?? null,
      conversation: {
        id: found.conversation.id,
        shell: found.conversation.shell,
        engagementId: found.conversation.engagementId,
      },
      messages: found.messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        text: m.text,
        answer: m.answer,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[ask-vcfo] conversation read failed', error);
    return NextResponse.json({ error: 'Could not load the conversation' }, { status: 500 });
  }
}

/** DELETE /api/ask/conversations/[id] — the caller's own chat only (owner item F4). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAsk();
  if (gate.ok === false) return gate.response;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const deleted = await deleteOwnAskConversation(gate.ctx, id);
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[ask-vcfo] conversation delete failed', error);
    return NextResponse.json({ error: 'Could not delete the chat' }, { status: 500 });
  }
}
