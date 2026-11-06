import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MAX_FILING_PDF_BYTES, looksLikePdf, uploadPortalPdf, uploadSignedPdf } from '@/lib/mca-filing/filing-service';
import { NO_STORE, assistStaff, filingError, formSchema, notFound } from '@/lib/mca-filing/route-helpers';

type RouteContext = { params: Promise<{ id: string }> };

const fieldsSchema = z.object({
  form: formSchema,
  kind: z.enum(['portal_pdf', 'signed_pdf']),
  fileName: z.string().trim().min(1).max(200),
});
const jsonSchema = fieldsSchema.extend({ base64: z.string().min(1) });

/** A 15 MB file in base64 with its JSON wrapper. */
const MAX_BODY_BYTES = Math.ceil(MAX_FILING_PDF_BYTES * 1.4) + 4096;

const tooLarge = () => NextResponse.json({ ok: false, error: 'file_too_large', message: 'A filing PDF can be 15 MB at most.' }, { status: 413 });

/**
 * POST /api/assist/engagements/[id]/filing/documents — a portal or signed PDF, as multipart
 * (`form`, `kind`, `file`) or JSON (`form`, `kind`, `fileName`, `base64`). PDF only, 15 MB at most.
 * A portal PDF is compared with the assist profile and, when its text changed, makes earlier
 * signed copies stale. A signed PDF must pass every check, or the response is a named refusal and
 * nothing is stored. Staff only; 503 while VCFO_ASSIST_ENABLED is not on.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await assistStaff();
  if (auth.ok === false) return auth.response;
  const { id } = await context.params;
  const length = Number(request.headers.get('content-length') ?? NaN);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return tooLarge();

  let fields: z.infer<typeof fieldsSchema>;
  let bytes: Buffer;
  try {
    if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      const body = await request.formData();
      const file = body.get('file');
      if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'file_required' }, { status: 400 });
      if (file.size > MAX_FILING_PDF_BYTES) return tooLarge();
      const parsed = fieldsSchema.safeParse({ form: body.get('form'), kind: body.get('kind'), fileName: file.name || 'filing.pdf' });
      if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'invalid_body' }, { status: 400 });
      fields = parsed.data;
      bytes = Buffer.from(await file.arrayBuffer());
    } else {
      const parsed = jsonSchema.safeParse(await request.json());
      if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'invalid_body' }, { status: 400 });
      fields = parsed.data;
      bytes = Buffer.from(parsed.data.base64, 'base64');
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  if (bytes.length > MAX_FILING_PDF_BYTES) return tooLarge();
  if (!looksLikePdf(bytes)) return NextResponse.json({ ok: false, error: 'not_a_pdf', message: 'Only a PDF can be added here.' }, { status: 415 });

  try {
    const upload = fields.kind === 'portal_pdf' ? uploadPortalPdf : uploadSignedPdf;
    const out = await upload(auth.ctx, id, fields.form, fields.fileName, bytes);
    if (!out) return notFound();
    return NextResponse.json({ ok: true, document: out.document, filing: out.filing, created: out.created }, { status: out.created ? 201 : 200, headers: NO_STORE });
  } catch (e) {
    return filingError(e, 'filing document upload');
  }
}
