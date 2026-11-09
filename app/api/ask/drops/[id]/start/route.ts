import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAskAttachment, listAskRunAttachments } from '@/db/repositories/ask-attachments';
import { appendAskMessage } from '@/db/repositories/ask-messages';
import { getOwnAskRun, startQueuedAskRun } from '@/db/repositories/ask-runs';
import type { JsonValue } from '@/lib/ask/changeset/types';
import { instructionOf } from '@/lib/ask/data-router/read';
import { isDataMessage, STORED_USER_TEXT_MAX } from '@/lib/ask/do/entry';
import { queueAskDrop } from '@/lib/ask/drop/run';
import { DROP_WORKFLOW, emptyDropState, type DropState } from '@/lib/ask/drop/types';
import { maskIdentityNumbers } from '@/lib/ask/mask';
import { requireAsk } from '@/lib/ask/route-guard';
import { putObject } from '@/storage/s3';

const UUID = /^[0-9a-f-]{36}$/i;
const MESSAGE_MAX = 100_000;

/**
 * POST /api/ask/drops/:id/start: the person pressed send. Stores what they asked for, keeps a pasted
 * block in the message as a `paste` file of the drop, records their message in the chat, and queues
 * the job. Only the drop's owner can start it, and only once.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAsk();
  if (gate.ok === false) return gate.response;
  const { ctx } = gate;
  if (ctx.role === 'client') return NextResponse.json({ error: 'Dropping files is not available here.' }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { message?: unknown; page?: unknown } = {};
  try {
    const text = await request.text();
    body = text.trim() ? (JSON.parse(text) as typeof body) : {};
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const message = typeof body.message === 'string' ? body.message.slice(0, MESSAGE_MAX) : '';
  const rawPage = body.page as { path?: unknown } | undefined;
  const page = rawPage && typeof rawPage.path === 'string' && rawPage.path.startsWith('/') ? { path: rawPage.path.slice(0, 500) } : undefined;

  try {
    const run = await getOwnAskRun(ctx, id);
    if (!run || run.workflow !== DROP_WORKFLOW) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (run.status !== 'queued' || run.startedAt) return NextResponse.json({ error: 'This drop has already started.' }, { status: 409 });

    // A pasted block is kept as a file of the drop; the words around it are the instruction.
    const paste = message.trim() && isDataMessage(message) ? message : null;
    const instruction = paste ? instructionOf(message) : message.trim();
    if (paste) {
      const s3Key = `ask/attachments/${ctx.userId}/${randomUUID()}/paste.txt`;
      await putObject(s3Key, paste, 'text/plain; charset=utf-8');
      await createAskAttachment(ctx, { kind: 'paste', fileName: 'paste.txt', contentType: 'text/plain', sizeBytes: Buffer.byteLength(paste), s3Key, conversationId: run.conversationId, runId: run.id });
    }
    const files = await listAskRunAttachments(ctx, run.id);
    if (files.length === 0) return NextResponse.json({ error: 'Drop some files first.' }, { status: 400 });

    const current = (run.state ?? {}) as unknown as Partial<DropState>;
    const state: DropState = { ...emptyDropState(), ...current, instruction: maskIdentityNumbers(instruction).slice(0, 2000), ...(page ? { page } : {}) };
    const started = await startQueuedAskRun(ctx, run.id, { goal: instruction || `${files.length} dropped file${files.length === 1 ? '' : 's'}`, state: state as unknown as JsonValue });
    if (!started) return NextResponse.json({ error: 'This drop has already started.' }, { status: 409 });

    if (run.conversationId) {
      const uploaded = files.filter((f) => f.kind === 'file').length;
      const text = message.trim() ? maskIdentityNumbers(message).slice(0, STORED_USER_TEXT_MAX) : `Dropped ${uploaded} file${uploaded === 1 ? '' : 's'}`;
      await appendAskMessage(ctx, run.conversationId, { sender: 'user', text });
    }
    await queueAskDrop(run.id, { profileId: ctx.userId });
    return NextResponse.json({ runId: run.id }, { status: 202 });
  } catch (error) {
    console.error('[ask-vcfo] drop start failed', error);
    return NextResponse.json({ error: 'Could not start the drop' }, { status: 500 });
  }
}
