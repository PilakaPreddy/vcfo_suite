import { NextResponse } from 'next/server';
import { addAttachment, listAttachments } from '@/db/repositories/budgets';
import { MAX_UPLOAD_BYTES, maxUploadSizeError } from '@/lib/upload-limits';
import { budgetError, denied, guardBudgets } from '../../../../_respond';

type Context = { params: Promise<{ id: string; rowId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id, rowId } = await params;
  try {
    return NextResponse.json({ attachments: await listAttachments(guard.ctx, id, rowId) });
  } catch (e) {
    return budgetError(e);
  }
}

/** POST — attach a supporting document (a quote, a lease) to a row. */
export async function POST(request: Request, { params }: Context) {
  const guard = await guardBudgets();
  if (guard.ok === false) return denied(guard);
  const { id, rowId } = await params;
  const file = (await request.formData()).get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file_required' }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: maxUploadSizeError() }, { status: 413 });
  try {
    await addAttachment(guard.ctx, id, rowId, { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return budgetError(e);
  }
}
