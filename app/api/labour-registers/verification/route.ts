import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { clearVerification, listVerifications, saveVerification } from '@/db/repositories/labour-registers';
import { formById } from '@/data/labour-registers/forms';
import { resolveVerification, verificationIndex } from '@/lib/labour-registers/verification';

/**
 * Record how far the firm has checked a form's layout.
 *
 * This is the one write in the feature that is not about a client at all. A verdict is keyed on
 * the form alone, because a form's layout is a property of the law: whether Form XIX matches
 * what the Punjab rules prescribe is the same question for every client in Punjab, and
 * answering it per engagement would mean answering it thirty times and getting thirty answers.
 *
 * It takes effect without a deploy, which was the point. The catalogue's claim is a developer's
 * claim in a TypeScript file; this is the company secretary's, made with the gazette open, and
 * it is printed verbatim at the head of every sheet the form produces from then on.
 *
 * Because it is printed, it re-keys. `templateVersionFor` folds the verdict's fingerprint into
 * the content address, so the next generation of that form rebuilds and the other twenty-eight
 * registers are still answered from storage.
 *
 * GET    /api/labour-registers/verification            → { verdicts: [...] }
 * POST   /api/labour-registers/verification            { formId, status, ... }
 * DELETE /api/labour-registers/verification?formId=…   → the catalogue's claim stands again
 */
const bodySchema = z.object({
  formId: z.string().min(1).max(64),
  status: z.enum(['unverified', 'disputed', 'checked-against-sample', 'gazette-verified']),
  /** What it was checked against: a gazette citation, a form PDF, a filed client workbook. */
  against: z.string().max(400).optional(),
  /** Why it is disputed. Printed on the sheet verbatim, so it is written for an inspector. */
  disputedBecause: z.string().max(600).optional(),
  /** What is still unresolved — signatory, seal, page initialling, column order. */
  openItems: z.array(z.string().min(1).max(120)).max(20).optional(),
  evidenceKey: z.string().max(400).nullable().optional(),
  evidenceFileName: z.string().max(200).nullable().optional(),
  /** The firm's decision that this register is not one it owes at all. */
  suppressed: z.boolean().optional(),
  suppressedReason: z.string().max(400).optional(),
});

export async function GET() {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern', 'client');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const rows = await listVerifications(guard.ctx);
  return NextResponse.json({
    verdicts: rows.map((row) => ({
      formId: row.formId,
      status: row.status,
      against: row.against,
      disputedBecause: row.disputedBecause,
      openItems: row.openItems,
      evidenceFileName: row.evidenceFileName,
      suppressed: row.suppressed,
      suppressedReason: row.suppressedReason,
      verifiedAt: row.verifiedAt,
    })),
  });
}

export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });

  const form = formById(body.data.formId);
  if (!form) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  /* Two refusals, because both would produce a sheet that says nothing useful. A dispute with
     no reason prints "contradicted by a source we consider reliable" and names none; a
     suppression with no reason leaves a gap in the act's folder that nobody can account for. */
  if (body.data.status === 'disputed' && !body.data.disputedBecause?.trim()) {
    return NextResponse.json(
      { error: 'Say what the dispute is. It is printed on the register, so write it for whoever reads that sheet.' },
      { status: 400 },
    );
  }
  if (body.data.suppressed && !body.data.suppressedReason?.trim()) {
    return NextResponse.json(
      { error: 'Say why this register is not produced. A gap nobody can account for is worse than a flagged draft.' },
      { status: 400 },
    );
  }

  const row = await saveVerification(guard.ctx, body.data);
  if (!row) return NextResponse.json({ error: 'not_saved' }, { status: 500 });

  return NextResponse.json({ verdict: resolveVerification(form, verificationIndex([row])) });
}

export async function DELETE(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const formId = new URL(request.url).searchParams.get('formId');
  if (!formId) return NextResponse.json({ error: 'form_required' }, { status: 400 });

  const form = formById(formId);
  if (!form) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await clearVerification(guard.ctx, formId);
  return NextResponse.json({ verdict: resolveVerification(form, undefined) });
}
