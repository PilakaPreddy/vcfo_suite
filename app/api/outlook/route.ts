import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { getOutlookStatus, updateOutlookSignature } from '@/db/repositories/outlook-connections';
import { outlookConfigured } from '@/lib/outlook/oauth';
import { publicErrorMessage } from '@/lib/api-error';

/** GET /api/outlook — connection status for the signed-in staff user. */
export async function GET() {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  try {
    const status = await getOutlookStatus(guard.ctx);
    return NextResponse.json({
      configured: outlookConfigured(),
      ...status,
    });
  } catch (err) {
    const message = publicErrorMessage(err, 'status_failed');
    const status = message.includes('not permitted') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

const signatureSchema = z
  .object({
    signatureEnabled: z.boolean().optional(),
    signatureText: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => v.signatureEnabled !== undefined || v.signatureText !== undefined, {
    message: 'nothing_to_change',
  });

/**
 * PATCH /api/outlook — the caller's email signature (K-40, G-23).
 * Body: { signatureEnabled?, signatureText? }. Needs a linked mailbox (409 otherwise).
 */
export async function PATCH(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const body = await parseJsonBody(request, signatureSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  try {
    const status = await updateOutlookSignature(guard.ctx, body.data);
    return NextResponse.json({ configured: outlookConfigured(), ...status });
  } catch (err) {
    const message = publicErrorMessage(err, 'save_failed');
    const status =
      message === 'outlook_not_connected' ? 409 : message.includes('not permitted') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
