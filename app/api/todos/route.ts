import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/auth/guards';
import { listPersonalTodos, upsertPersonalTodo } from '@/db/repositories/tasks';
import { parseJsonBody } from '@/lib/api/parse-body';
import { canAccessPersonalTodos, INTERN_FOCUS_TITLE_MAX } from '@/lib/intern/personal-todos';
import { publicErrorMessage } from '@/lib/api-error';

const createSchema = z.object({
  entryId: z.string().trim().min(1).max(240).optional(),
  title: z.string().trim().min(1).max(INTERN_FOCUS_TITLE_MAX),
  done: z.boolean().optional(),
  custom: z.boolean().optional(),
});

/** GET /api/todos — personal todos scoped by role (Path A). */
export async function GET() {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  if (!canAccessPersonalTodos(guard.ctx.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const todos = await listPersonalTodos(guard.ctx);
    return NextResponse.json({ todos });
  } catch (err) {
    const message = publicErrorMessage(err, 'list_failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/todos — create or upsert the signed-in user's todo. */
export async function POST(request: Request) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  if (!canAccessPersonalTodos(guard.ctx.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = await parseJsonBody(request, createSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  try {
    const todo = await upsertPersonalTodo(guard.ctx, {
      entryId: body.data.entryId,
      title: body.data.title,
      done: body.data.done,
      custom: body.data.custom,
    });
    return NextResponse.json({ todo }, { status: 200 });
  } catch (err) {
    const message = publicErrorMessage(err, 'create_failed');
    const status =
      message.includes('not permitted') || message === 'forbidden'
        ? 403
        : message === 'title_required'
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
