import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/auth/guards';
import { listAuditEvents } from '@/db/repositories/audit-events';
import { publicErrorMessage } from '@/lib/api-error';

/**
 * GET /api/audit-logs — role-scoped audit feed (Path A in listAuditEvents).
 * Intern: own actor + assigned-engagement events. Manager: owned clients only.
 * Client: own engagements. Admin/super: firm-wide.
 *
 * Paging (G-28): `?before=<iso>&beforeId=<uuid>` returns the page older than the last row
 * shown; the response's `next` is that cursor for the page after, or null on the last page.
 */
const querySchema = z.object({
  engagementId: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  before: z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'invalid_before')
    .optional(),
  beforeId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const url = new URL(request.url);
  const query = querySchema.safeParse({
    engagementId: url.searchParams.get('engagementId') || undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    before: url.searchParams.get('before') || undefined,
    beforeId: url.searchParams.get('beforeId') || undefined,
  });
  if (!query.success) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }
  const { engagementId, limit, before, beforeId } = query.data;

  try {
    const rows = await listAuditEvents(guard.ctx, {
      engagementId: engagementId || null,
      before: before ? new Date(before) : undefined,
      beforeId,
      limit: limit + 1,
    });
    const events = rows.slice(0, limit);
    const last = events.at(-1);
    return NextResponse.json({
      ok: true,
      events,
      next: rows.length > limit && last ? { before: last.created_at, beforeId: last.id } : null,
      scope: engagementId ? 'project' : 'global',
    });
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
