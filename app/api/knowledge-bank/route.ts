import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { knowledgeBankRegisterBodySchema } from '@/lib/api/schemas';
import { parseJsonBody } from '@/lib/api/validate';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { listKnowledgeBankLibrary, registerKnowledgeBankFile } from '@/db/repositories/knowledge-bank';
import {
  knowledgeBankChildFolders,
  knowledgeBankFilesInFolder,
  knowledgeBankFolderAncestors,
} from '@/lib/knowledge-bank/knowledge-bank-folders';
import { isKnowledgeBankStoragePath } from '@/lib/knowledge-bank/knowledge-bank-storage';
import { bucketKey, deleteObject } from '@/storage/s3';
import { publicErrorMessage } from '@/lib/api-error';

function knowledgeBankErrorStatus(message: string): number {
  if (message.startsWith('Not permitted') || message.startsWith('Only admins')) return 403;
  if (message === 'parent_not_found') return 400;
  if (message === 'invalid_folder_name' || message === 'folder_too_deep') return 400;
  if (message === 'duplicate_folder_name' || message === 'folder_not_empty') return 409;
  return 500;
}

export async function GET(request: Request) {
  const auth = await requireAnyRole('admin', 'manager', 'intern');
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const folderIdParam = url.searchParams.get('folderId');

  try {
    const library = await listKnowledgeBankLibrary(auth.ctx, 200);
    const payload: Record<string, unknown> = {
      ok: true,
      files: library.files,
      folders: library.folders,
      tree: library.tree,
    };

    if (folderIdParam !== null) {
      const folderId =
        folderIdParam.trim() === '' || folderIdParam === 'root' ? null : folderIdParam;
      if (folderId) {
        const folder = library.folders.find((row) => row.id === folderId) ?? null;
        if (!folder) {
          return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
        }
        payload.current = {
          folderId,
          folder,
          ancestors: knowledgeBankFolderAncestors(folderId, library.folders),
          folders: knowledgeBankChildFolders(folderId, library.folders),
          files: knowledgeBankFilesInFolder(folderId, library.files),
        };
      } else {
        payload.current = {
          folderId: null,
          folder: null,
          ancestors: [],
          folders: knowledgeBankChildFolders(null, library.folders),
          files: knowledgeBankFilesInFolder(null, library.files),
        };
      }
    }

    return NextResponse.json(payload);
  } catch (err) {
    const message = publicErrorMessage(err, 'fetch_failed');
    return NextResponse.json(
      {
        ok: false,
        error: 'fetch_failed',
        detail: process.env.NODE_ENV === 'development' ? message : undefined,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAnyRole('admin', 'manager', 'intern');
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const parsed = await parseJsonBody(request, knowledgeBankRegisterBodySchema);
  if (parsed.ok === false) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
  }

  const body = parsed.data;
  if (!isKnowledgeBankStoragePath(body.id, body.storagePath)) {
    return NextResponse.json({ ok: false, error: 'invalid_storage_path' }, { status: 400 });
  }

  const storagePath = body.storagePath.trim();

  try {
    const file = await registerKnowledgeBankFile(auth.ctx, {
      id: body.id,
      title: body.title,
      description: body.description?.trim() || null,
      storagePath,
      fileName: body.fileName,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      folderId: body.folderId ?? null,
    });

    await recordAuditEvent(auth.ctx, {
      action: 'knowledge_bank.upload',
      summary: `Uploaded "${body.title}" to Knowledge Bank`,
      metadata: {
        fileId: body.id,
        fileName: body.fileName,
        folderId: file.folderId,
        folderPath: file.folderPath,
      },
      actorEmail: auth.ctx.email,
      actorName: auth.ctx.name,
    });

    return NextResponse.json({ ok: true, file }, { status: 201 });
  } catch (err) {
    try {
      await deleteObject(bucketKey('knowledge-bank', storagePath));
    } catch {
      /* best-effort cleanup */
    }
    const message = publicErrorMessage(err, 'save_failed');
    const status = knowledgeBankErrorStatus(message);
    return NextResponse.json(
      { ok: false, error: status === 500 ? 'save_failed' : message },
      { status },
    );
  }
}
