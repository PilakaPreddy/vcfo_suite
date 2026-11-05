import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { knowledgeBankCreateFolderBodySchema } from '@/lib/api/schemas';
import { parseJsonBody } from '@/lib/api/validate';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { createKnowledgeBankFolder } from '@/db/repositories/knowledge-bank';
import { publicErrorMessage } from '@/lib/api-error';

export async function POST(request: Request) {
  const auth = await requireAnyRole('admin', 'manager', 'intern');
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const parsed = await parseJsonBody(request, knowledgeBankCreateFolderBodySchema);
  if (parsed.ok === false) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
  }

  try {
    const folder = await createKnowledgeBankFolder(auth.ctx, {
      name: parsed.data.name,
      parentId: parsed.data.parentId ?? null,
    });

    await recordAuditEvent(auth.ctx, {
      action: 'knowledge_bank.folder_create',
      summary: `Created Knowledge Bank folder "${folder.name}"`,
      metadata: { folderId: folder.id, parentId: folder.parentId },
      actorEmail: auth.ctx.email,
      actorName: auth.ctx.name,
    });

    return NextResponse.json({ ok: true, folder }, { status: 201 });
  } catch (err) {
    const message = publicErrorMessage(err, 'save_failed');
    if (message.startsWith('Not permitted')) {
      return NextResponse.json({ ok: false, error: message }, { status: 403 });
    }
    if (
      message === 'parent_not_found' ||
      message === 'invalid_folder_name' ||
      message === 'folder_too_deep'
    ) {
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
    if (message === 'duplicate_folder_name') {
      return NextResponse.json({ ok: false, error: message }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: 'save_failed' }, { status: 500 });
  }
}
