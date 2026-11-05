import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { deleteMailGroup, MailGroupError, updateMailGroup } from '@/db/repositories/mail-groups';
import { groupIdSchema, updateMailGroupSchema } from '../schema';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

function fail(err: unknown) {
  if (err instanceof MailGroupError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = publicErrorMessage(err, 'groups_failed');
  return NextResponse.json({ error: message }, { status: 500 });
}

/** PATCH /api/outlook/groups/:id — rename, share or change members. Owner, or an admin for a shared group. */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const id = groupIdSchema.safeParse(await context.params);
  if (!id.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const body = await parseJsonBody(request, updateMailGroupSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  try {
    const group = await updateMailGroup(guard.ctx, id.data.id, {
      name: body.data.name,
      shared: body.data.shared,
      members: body.data.members?.map((m) => ({ email: m.email, name: m.name ?? null })),
    });
    return NextResponse.json({ group });
  } catch (err) {
    return fail(err);
  }
}

/** DELETE /api/outlook/groups/:id — owner, or an admin for a shared group. */
export async function DELETE(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const id = groupIdSchema.safeParse(await context.params);
  if (!id.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  try {
    await deleteMailGroup(guard.ctx, id.data.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
