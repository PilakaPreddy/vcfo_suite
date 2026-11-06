import { NextResponse } from 'next/server';
import {
  createAskDocument,
  getAskDocument,
  listAskDocuments,
  setAskDocumentStorageKey,
  type AskDocumentAudience,
  type AskSourceType,
} from '@/db/repositories/ask-documents';
import { isFirmWideAdmin } from '@/lib/auth';
import { askSourceStoragePath, queueAskIngestion } from '@/lib/ask/ingest/run';
import { sourceKindFor } from '@/lib/ask/ingest/extract';
import { requireAsk } from '@/lib/ask/route-guard';
import { MAX_UPLOAD_BYTES } from '@/lib/upload-limits';
import { bucketKey, putObject } from '@/storage/s3';

const SOURCE_TYPES: readonly AskSourceType[] = ['govt', 'firm_pdf', 'firm_note'];
const AUDIENCES: readonly AskDocumentAudience[] = ['client', 'staff', 'both'];

function view(row: Awaited<ReturnType<typeof listAskDocuments>>[number]) {
  return {
    id: row.id,
    title: row.title,
    sourceType: row.sourceType,
    sourceUrl: row.sourceUrl,
    audience: row.audience,
    status: row.status,
    error: row.error,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    supersededAt: row.supersededAt?.toISOString() ?? null,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** GET /api/ask/admin/documents — knowledge sources (admin / super admin). */
export async function GET() {
  const gate = await requireAsk();
  if (gate.ok === false) return gate.response;
  if (!isFirmWideAdmin(gate.ctx.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  try {
    return NextResponse.json({ documents: (await listAskDocuments(gate.ctx)).map(view) });
  } catch (error) {
    console.error('[ask-vcfo] sources list failed', error);
    return NextResponse.json({ error: 'Could not load sources' }, { status: 500 });
  }
}

/**
 * POST /api/ask/admin/documents — multipart: title, sourceType, audience,
 * optional sourceUrl / effectiveFrom / effectiveTo / supersedesDocumentId, and
 * either `file` (PDF, DOCX, TXT, MD) or `note` (firm note text). Stores the bytes in S3, then queues indexing.
 */
export async function POST(request: Request) {
  const gate = await requireAsk();
  if (gate.ok === false) return gate.response;
  if (!isFirmWideAdmin(gate.ctx.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  }
  const title = String(form.get('title') ?? '').trim().slice(0, 200);
  const sourceType = String(form.get('sourceType') ?? '') as AskSourceType;
  const audience = String(form.get('audience') ?? '') as AskDocumentAudience;
  const sourceUrlRaw = String(form.get('sourceUrl') ?? '').trim();
  const effectiveFrom = String(form.get('effectiveFrom') ?? '').trim() || null;
  const effectiveTo = String(form.get('effectiveTo') ?? '').trim() || null;
  const supersedesDocumentId = String(form.get('supersedesDocumentId') ?? '').trim() || null;
  const note = String(form.get('note') ?? '').trim();
  const file = form.get('file');

  if (!title) return NextResponse.json({ error: 'Give the source a title' }, { status: 400 });
  if (!SOURCE_TYPES.includes(sourceType)) return NextResponse.json({ error: 'Choose a source type' }, { status: 400 });
  if (!AUDIENCES.includes(audience)) return NextResponse.json({ error: 'Choose who may see answers from it' }, { status: 400 });
  if (effectiveFrom && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    return NextResponse.json({ error: 'Effective date must be a date' }, { status: 400 });
  }
  if (effectiveTo && (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo) || (effectiveFrom && effectiveTo < effectiveFrom))) {
    return NextResponse.json({ error: 'The end date must be a date after the start' }, { status: 400 });
  }
  let sourceUrl: string | null = null;
  if (sourceUrlRaw) {
    try {
      const url = new URL(sourceUrlRaw);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol');
      sourceUrl = url.toString();
    } catch {
      return NextResponse.json({ error: 'Source link must be a web address' }, { status: 400 });
    }
  }

  let bytes: Buffer;
  let fileName: string;
  let contentType: string;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'That file is too large' }, { status: 413 });
    if (!sourceKindFor(file.name, file.type)) {
      return NextResponse.json({ error: 'Upload a PDF, DOCX, TXT or MD file' }, { status: 400 });
    }
    bytes = Buffer.from(await file.arrayBuffer());
    fileName = file.name;
    contentType = file.type || 'application/octet-stream';
  } else if (note) {
    bytes = Buffer.from(note.slice(0, 200_000), 'utf8');
    fileName = 'note.md';
    contentType = 'text/markdown';
  } else {
    return NextResponse.json({ error: 'Attach a file or write a note' }, { status: 400 });
  }

  try {
    if (supersedesDocumentId && !(await getAskDocument(gate.ctx, supersedesDocumentId))) {
      return NextResponse.json({ error: 'The source it replaces was not found' }, { status: 400 });
    }
    const doc = await createAskDocument(gate.ctx, { title, sourceType, audience, sourceUrl, effectiveFrom, effectiveTo, supersedesDocumentId });
    const key = bucketKey('knowledge-bank', askSourceStoragePath(doc.id, fileName));
    await putObject(key, bytes, contentType);
    await setAskDocumentStorageKey(gate.ctx, doc.id, key);
    const mode = await queueAskIngestion(doc.id);
    return NextResponse.json({ document: view({ ...doc, s3Key: key }), indexing: mode }, { status: 201 });
  } catch (error) {
    console.error('[ask-vcfo] source upload failed', error);
    return NextResponse.json({ error: 'Could not save the source' }, { status: 500 });
  }
}
