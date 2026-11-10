import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { listExpiryItems, upsertExpiryItem } from '@/db/repositories/expiry-items';
import { parseJsonBody } from '@/lib/api/parse-body';
import { EXPIRY_KINDS } from '@/lib/expiries/model';
import { expiryError } from './_respond';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'invalid date');

/**
 * GET /api/expiries — the expiry register in the caller's scope, soonest first.
 * `?withinDays=30` keeps items expiring within 30 days (and expired ones, not renewed);
 * `?engagementId=` keeps one client.
 */
export async function GET(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern', 'client');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const url = new URL(request.url);
  const within = url.searchParams.get('withinDays');
  const withinDays = within && /^\d{1,4}$/.test(within) ? Number(within) : undefined;
  try {
    const items = await listExpiryItems(guard.ctx, { withinDays, engagementId: url.searchParams.get('engagementId') });
    return NextResponse.json({ items });
  } catch (e) {
    return expiryError(e);
  }
}

const body = z.object({
  engagementId: z.string().trim().min(1).max(80),
  kind: z.enum(EXPIRY_KINDS),
  subjectName: z.string().trim().min(1).max(160),
  referenceLabel: z.string().trim().max(160).nullable().optional(),
  expiresOn: isoDate,
  notes: z.string().trim().max(1000).nullable().optional(),
});

/** POST /api/expiries — staff add an item by hand (or update the one with the same client, kind and name). */
export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const parsed = await parseJsonBody(request, body);
  if (parsed.ok === false) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const { item } = await upsertExpiryItem(guard.ctx, { ...parsed.data, source: 'manual' });
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    return expiryError(e);
  }
}
