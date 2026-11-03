import { NextResponse } from 'next/server';
import { parseCamt } from '@/lib/receivables/bank-feed/camt';
import { importCredits } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../../_respond';

/**
 * POST /api/receivables/sheets/:id/credits/import — a bank statement file (ISO 20022 camt.053 or
 * camt.054 XML, as HSBCnet exports it) in the `file` field. Credits already stored are skipped,
 * sure matches are marked received in the draft, and the rest wait for the manager.
 */
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file_required' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 400 });
  let parsed;
  try {
    parsed = parseCamt(await file.text(), 'manual');
  } catch {
    return NextResponse.json({ error: 'not_a_statement' }, { status: 400 });
  }
  if (parsed.kind === 'unknown') return NextResponse.json({ error: 'not_a_statement' }, { status: 400 });
  try {
    const result = await importCredits(guard.ctx, id, parsed.credits);
    return NextResponse.json({ ...result, found: parsed.credits.length, skipped: parsed.skipped, kind: parsed.kind, account: parsed.account });
  } catch (e) {
    return receivablesError(e);
  }
}
