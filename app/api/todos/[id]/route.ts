import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/auth/guards';
import { deletePersonalTodo, updatePersonalTodo } from '@/db/repositories/tasks';
import { parseJsonBody } from '@/lib/api/parse-body';
import { canAccessPersonalTodos, INTERN_FOCUS_TITLE_MAX } from '@/lib/intern/personal-todos';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

const idSchema = z.string().uuid();
const patchSchema = z.object({
  title: z.string().trim().min(1).max(INTERN_FOCUS_TITLE_MAX).optional(),
  done: z.boolean().optional(),
});

function mapError(message: string): number {
  if (message.includes('not permitted') || message === 'forbidden') return 403;
  if (message === 'title_required' || message === 'invalid_body') return 400;
  return 500;
}

/** PATCH /api/todos/[id] — owner only. */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  if (!canAccessPersonalTodos(guard.ctx.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  const body = await parseJsonBody(request, patchSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  try {
    const todo = await updatePersonalTodo(guard.ctx, id, body.data);
    if (!todo) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ todo });
  } catch (err) {
    const message = publicErrorMessage(err, 'update_failed');
    return NextResponse.json({ error: message }, { status: mapError(message) });
  }
}

/** DELETE /api/todos/[id] — owner only. */
export async function DELETE(_request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  if (!canAccessPersonalTodos(guard.ctx.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  try {
    const ok = await deletePersonalTodo(guard.ctx, id);
    if (!ok) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = publicErrorMessage(err, 'delete_failed');
    return NextResponse.json({ error: message }, { status: mapError(message) });
  }
}
