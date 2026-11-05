import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import { getTaskById, updateTask } from '@/db/repositories/tasks';
import type { TaskInstance } from '@/data/engagements';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/tasks/[id] */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await context.params;
  const task = await getTaskById(guard.ctx, id);
  if (!task) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ task });
}

/** PATCH /api/tasks/[id] */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await context.params;
  let patch: Partial<TaskInstance>;
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  try {
    const task = await updateTask(guard.ctx, id, patch);
    if (!task) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ task });
  } catch (err) {
    const message = publicErrorMessage(err, 'update_failed');
    const status = message.includes('may not') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
