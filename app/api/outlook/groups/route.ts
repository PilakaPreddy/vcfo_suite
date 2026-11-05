import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { createMailGroup, listMailGroups, MailGroupError } from '@/db/repositories/mail-groups';
import { createMailGroupSchema } from './schema';
import { publicErrorMessage } from '@/lib/api-error';

function fail(err: unknown) {
  if (err instanceof MailGroupError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = publicErrorMessage(err, 'groups_failed');
  return NextResponse.json({ error: message }, { status: 500 });
}

/** GET /api/outlook/groups — the caller's mail groups and the shared ones (G-23). */
export async function GET() {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  try {
    return NextResponse.json({ groups: await listMailGroups(guard.ctx) });
  } catch (err) {
    return fail(err);
  }
}

/**
 * POST /api/outlook/groups — create a group. Body: { name, shared?, members: [{ email, name? }] }.
 * Only firm-wide admins may set `shared` (403 otherwise).
 */
export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const body = await parseJsonBody(request, createMailGroupSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  try {
    const group = await createMailGroup(guard.ctx, {
      name: body.data.name,
      shared: body.data.shared,
      members: body.data.members.map((m) => ({ email: m.email, name: m.name ?? null })),
    });
    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
