import { publicErrorMessage } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import {
  FirmOrgForbiddenError,
  listReportingLines,
  setManagerAdmin,
} from '@/db/repositories/firm-org';

const patchSchema = z.object({
  managerId: z.string().uuid(),
  adminId: z.union([z.string().uuid(), z.null()]),
});

/** GET /api/admin/people/reporting — every project manager and the admin they report to. */
export async function GET() {
  const guard = await requireAdmin();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  try {
    const lines = await listReportingLines(guard.ctx);
    return NextResponse.json({ lines });
  } catch (err) {
    if (err instanceof FirmOrgForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'list_failed' }, { status: 500 });
  }
}

/** PATCH /api/admin/people/reporting — set or clear the admin a manager reports to. */
export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const body = await parseJsonBody(request, patchSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  try {
    const line = await setManagerAdmin(guard.ctx, body.data.managerId, body.data.adminId);
    return NextResponse.json({ line });
  } catch (err) {
    if (err instanceof FirmOrgForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = publicErrorMessage(err, 'update_failed');
    const status = message === 'manager_not_found' || message === 'admin_not_found' ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
