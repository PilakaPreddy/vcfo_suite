import { publicErrorMessage } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rejectLargeBody } from '@/lib/api/body-limit';
import { requireAuth } from '@/auth/guards';
import {
  addClientFilingProof,
  addFilingProof,
  complianceErrorStatus,
  listFilingProofs,
} from '@/db/repositories/client-compliances';

type Ctx = { params: Promise<{ id: string }> };

function fail(e: unknown) {
  const status = complianceErrorStatus(e);
  if (status == null) throw e;
  return NextResponse.json({ error: publicErrorMessage(e, 'request_failed') }, { status });
}

/** GET /api/client/compliances/:id/proofs — the filing's proof files (rule 15). */
export async function GET(_request: Request, ctx: Ctx) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ proofs: await listFilingProofs(guard.ctx, id) });
  } catch (e) {
    return fail(e);
  }
}

const kindSchema = z.enum(['acknowledgement', 'challan', 'certificate', 'other']);
const clientKindSchema = z.enum(['acknowledgement', 'challan', 'other']);

/**
 * POST multipart `file` (+ `kind`).
 *  - Staff: upload of an acknowledgement / challan / certificate (unchanged).
 *  - Client (G-03): add a proof file to a filing of their own engagement. It is
 *    stored as the client's upload, never as the primary proof, and the filing
 *    stays as it is: staff decide whether it is filed. The lead is notified.
 */
export async function POST(request: Request, ctx: Ctx) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await ctx.params;
  const isClient = guard.ctx.role === 'client';
  const tooLarge = rejectLargeBody(request, 25 * 1024 * 1024);
  if (tooLarge) return tooLarge;
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'file_required' }, { status: 400 });
  const rawKind = form?.get('kind');
  const kind = (isClient ? clientKindSchema : kindSchema).safeParse(rawKind == null || rawKind === '' ? (isClient ? 'other' : 'acknowledgement') : rawKind);
  if (!kind.success) return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  try {
    const input = { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) };
    const proof = isClient
      ? await addClientFilingProof(guard.ctx, id, input, kind.data)
      : await addFilingProof(guard.ctx, id, input, kind.data);
    return NextResponse.json({ proof }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
