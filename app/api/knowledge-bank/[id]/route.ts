import { NextResponse } from 'next/server';
import { requireAdminOrManager } from '@/auth/guards';
import { knowledgeBankIdParamSchema } from '@/lib/api/schemas';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import {
  deleteKnowledgeBankFile,
  getKnowledgeBankFile,
} from '@/db/repositories/knowledge-bank';
import { bucketKey, deleteObject } from '@/storage/s3';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireAdminOrManager();
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const parsed = knowledgeBankIdParamSchema.safeParse({ id });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const existing = await getKnowledgeBankFile(auth.ctx, parsed.data.id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  try {
    const storagePath = await deleteKnowledgeBankFile(auth.ctx, parsed.data.id);
    if (storagePath) {
      await deleteObject(bucketKey('knowledge-bank', storagePath));
    }
  } catch (err) {
    const message = publicErrorMessage(err, 'delete_failed');
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  await recordAuditEvent(auth.ctx, {
    action: 'knowledge_bank.delete',
    summary: `Deleted "${existing.title}" from Knowledge Bank`,
    metadata: { fileId: existing.id },
    actorEmail: auth.ctx.email,
    actorName: auth.ctx.name,
  });

  return NextResponse.json({ ok: true, id: existing.id });
}
