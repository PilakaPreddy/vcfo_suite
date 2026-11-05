import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdmin } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { createDeveloperProfile, FirmOrgForbiddenError } from '@/db/repositories/firm-org';
import { publicErrorMessage } from '@/lib/api-error';

const createSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  name: z.string().trim().max(120).optional(),
});

/** POST /api/admin/people/developers — the super admin creates a developer account. */
export async function POST(request: Request) {
  const guard = await requireSuperAdmin();
  if (guard.ok === false) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }
  const body = await parseJsonBody(request, createSchema);
  if (body.ok === false) {
    return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
  }
  try {
    const created = await createDeveloperProfile(guard.ctx, {
      email: body.data.email,
      password: body.data.password,
      fullName: body.data.name,
    });
    return NextResponse.json({ ok: true, ...created, role: 'developer' }, { status: 201 });
  } catch (err) {
    if (err instanceof FirmOrgForbiddenError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    }
    const message = publicErrorMessage(err, 'create_failed');
    return NextResponse.json({ ok: false, error: message }, { status: message === 'email_already_registered' ? 409 : 500 });
  }
}
