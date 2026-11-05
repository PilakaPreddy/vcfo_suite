import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import {
  CHANGE_REQUEST_KINDS,
  createChangeRequest,
  listChangeRequests,
  type ChangeRequestStatus,
} from '@/db/repositories/engagement-change-requests';
import { parseChangeRequestPayload } from '@/lib/projects/project-change-requests';
import { publicErrorMessage } from '@/lib/api-error';

const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;

const previewFieldSchema = z.object({
  label: z.string().trim().min(1).max(80),
  from: z.string().trim().max(240),
  to: z.string().trim().max(240),
});

const createSchema = z.object({
  engagementId: z.string().trim().min(1),
  kind: z.enum(CHANGE_REQUEST_KINDS),
  payload: z.record(z.string(), z.unknown()).default({}),
  preview: z
    .object({
      companyName: z.string().trim().max(120).optional(),
      fields: z.array(previewFieldSchema).max(12).optional(),
    })
    .default({}),
  reason: z.string().trim().max(1000).optional(),
});

/**
 * GET /api/engagement-change-requests?status=pending,approved
 * Admins see every request; managers see only the ones they filed.
 */
export async function GET(request: Request) {
  const guard = await requireAnyRole('admin', 'super_admin', 'manager');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const url = new URL(request.url);
  const raw = url.searchParams.get('status');
  const statuses = raw
    ? (raw
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is ChangeRequestStatus =>
          (STATUSES as readonly string[]).includes(s),
        ) as ChangeRequestStatus[])
    : undefined;
  const engagementId = url.searchParams.get('engagementId') ?? undefined;

  const requests = await listChangeRequests(guard.ctx, {
    statuses: statuses && statuses.length > 0 ? statuses : undefined,
    engagementId,
  });
  return NextResponse.json({ requests });
}

/**
 * POST /api/engagement-change-requests — a manager asks an admin to make a
 * high-risk change. The proposed values are stored on the request, so approving
 * it later executes exactly what the admin reviewed.
 */
export async function POST(request: Request) {
  const guard = await requireAnyRole('admin', 'super_admin', 'manager');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const body = await parseJsonBody(request, createSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const payload = parseChangeRequestPayload(body.data.kind, body.data.payload);
  if (payload.ok === false) {
    return NextResponse.json({ error: payload.error }, { status: 400 });
  }

  try {
    const created = await createChangeRequest(guard.ctx, {
      engagementId: body.data.engagementId,
      kind: body.data.kind,
      payload: payload.data as Record<string, unknown>,
      preview: body.data.preview,
      reason: body.data.reason,
    });
    return NextResponse.json({ request: created }, { status: 201 });
  } catch (err) {
    const message = publicErrorMessage(err, 'create_failed');
    const status = message === 'not_found' ? 404 : message === 'not_permitted' ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
