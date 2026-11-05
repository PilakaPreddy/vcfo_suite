import { NextResponse } from 'next/server';
import { z } from 'zod';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { getRegUpdate, rejectRegUpdate, retryRegUpdate } from '@/db/repositories/reg-updates';
import { publicErrorMessage } from '@/lib/api-error';
import { parseJsonBody } from '@/lib/api/parse-body';
import { hostOf, queueWatchProcess } from '@/lib/watch/process';
import { publishUpdate } from '@/lib/watch/publish';
import { editUpdate } from '@/lib/watch/review';
import { regReviewEditSchema } from '@/lib/watch/types';
import { signedDownloadUrl } from '@/storage/s3';
import { watchReviewer, watchStaff } from '../../_guard';

type Params = { params: Promise<{ id: string }> };

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('publish') }),
  z.object({ action: z.literal('reject'), reason: z.string().trim().min(1).max(500) }),
  z.object({ action: z.literal('retry') }),
]);

const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 });
const uuid = z.string().uuid();

/** GET: the update beside its source, with a short-lived link to an uploaded file. */
export async function GET(_request: Request, { params }: Params) {
  const guard = await watchStaff();
  if (guard.ok === false) return guard.response;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return notFound();
  try {
    const found = await getRegUpdate(guard.ctx, id);
    if (!found) return notFound();
    const { s3Key, ...update } = found;
    return NextResponse.json({ update: { ...update, fileUrl: s3Key ? await signedDownloadUrl(s3Key) : null } });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, 'read_failed') }, { status: 500 });
  }
}

/** PATCH: a reviewer's edit, checked by the same code as the model's output. */
export async function PATCH(request: Request, { params }: Params) {
  const guard = await watchReviewer();
  if (guard.ok === false) return guard.response;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return notFound();
  const body = await parseJsonBody(request, regReviewEditSchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    const { saved, problems } = await editUpdate(guard.ctx, id, body.data);
    if (!saved) return NextResponse.json({ error: 'not_editable' }, { status: 409 });
    await recordAuditEvent(guard.ctx, {
      action: 'watch.edit',
      summary: `Edited official update “${body.data.title.slice(0, 120)}”`,
      metadata: { updateId: id, problems: problems.length, acceptProblems: body.data.acceptProblems === true },
    });
    return NextResponse.json({ problems });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, 'edit_failed') }, { status: 500 });
  }
}

/** POST: publish, reject or read again. Publishing is one action and code picks the recipients. */
export async function POST(request: Request, { params }: Params) {
  const guard = await watchReviewer();
  if (guard.ok === false) return guard.response;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return notFound();
  const body = await parseJsonBody(request, actionSchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  const audit = (action: string, summary: string) => recordAuditEvent(guard.ctx, { action, summary, metadata: { updateId: id } });
  try {
    if (body.data.action === 'publish') {
      if ((await publishUpdate(guard.ctx, id)) === 'not_ready') return NextResponse.json({ error: 'not_ready' }, { status: 409 });
      await audit('watch.publish', 'Published an official update');
    } else if (body.data.action === 'reject') {
      if (!(await rejectRegUpdate(guard.ctx, id, body.data.reason))) return notFound();
      await audit('watch.reject', `Rejected an official update: ${body.data.reason.slice(0, 200)}`);
    } else {
      const row = await getRegUpdate(guard.ctx, id);
      if (!row || !(await retryRegUpdate(guard.ctx, id))) return NextResponse.json({ error: 'not_retryable' }, { status: 409 });
      await queueWatchProcess([{ id, host: hostOf(row.sourceUrl) }]);
      await audit('watch.retry', 'Asked for an official update to be read again');
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, 'action_failed') }, { status: 500 });
  }
}
