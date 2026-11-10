import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { deleteExpiryItem, getExpiryItem, markRenewed, upsertExpiryItem } from '@/db/repositories/expiry-items';
import { parseJsonBody } from '@/lib/api/parse-body';
import { expiryError } from '../_respond';

type RouteContext = { params: Promise<{ id: string }> };

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'invalid date');

const bodySchema = z.discriminatedUnion('action', [
  /** Mark renewed; with a new date the item carries on, without one it closes (or rolls on for DIR-3 KYC and LEI). */
  z.object({ action: z.literal('renew'), newExpiresOn: isoDate.nullable().optional() }),
  z.object({
    action: z.literal('edit'),
    expiresOn: isoDate,
    referenceLabel: z.string().trim().max(160).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  }),
]);

/** PATCH /api/expiries/:id — staff mark an item renewed or change its date. */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  const parsed = await parseJsonBody(request, bodySchema);
  if (parsed.ok === false) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const b = parsed.data;
    if (b.action === 'renew') return NextResponse.json({ item: await markRenewed(guard.ctx, id, { newExpiresOn: b.newExpiresOn ?? null }) });
    const existing = await getExpiryItem(guard.ctx, id);
    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const { item } = await upsertExpiryItem(guard.ctx, {
      id,
      engagementId: existing.engagementId,
      kind: existing.kind,
      subjectName: existing.subjectName,
      expiresOn: b.expiresOn,
      referenceLabel: b.referenceLabel,
      notes: b.notes,
      source: 'manual',
    });
    return NextResponse.json({ item });
  } catch (e) {
    return expiryError(e);
  }
}

/** DELETE /api/expiries/:id — staff remove an item added in error. */
export async function DELETE(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  try {
    const ok = await deleteExpiryItem(guard.ctx, id);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch (e) {
    return expiryError(e);
  }
}
