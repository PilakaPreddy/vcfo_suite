import { publicErrorMessage } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { requireAdminOrManager } from '@/auth/guards';
import { knowledgeBankIdParamSchema } from '@/lib/api/schemas';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import {
  deleteKnowledgeBankFolder,
  getKnowledgeBankFolder,
} from '@/db/repositories/knowledge-bank';

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

  const existing = await getKnowledgeBankFolder(auth.ctx, parsed.data.id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  try {
    const deleted = await deleteKnowledgeBankFolder(auth.ctx, parsed.data.id);
    if (!deleted) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
  } catch (err) {
    const message = publicErrorMessage(err, 'delete_failed');
    if (message.startsWith('Only admins')) {
      return NextResponse.json({ ok: false, error: message }, { status: 403 });
    }
    if (message === 'folder_not_empty') {
      return NextResponse.json({ ok: false, error: 'folder_not_empty' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  await recordAuditEvent(auth.ctx, {
    action: 'knowledge_bank.folder_delete',
    summary: `Deleted Knowledge Bank folder "${existing.name}"`,
    metadata: { folderId: existing.id, parentId: existing.parentId },
    actorEmail: auth.ctx.email,
    actorName: auth.ctx.name,
  });

  return NextResponse.json({ ok: true, id: existing.id });
}
