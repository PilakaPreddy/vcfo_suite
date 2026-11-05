import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import { createTask, listTasks } from '@/db/repositories/tasks';
import type { StatusCode } from '@/data/checklist';
import { assignTaskSchema, handleAssignTask } from '@/lib/work/assign-task';
import { publicErrorMessage } from '@/lib/api-error';

/** GET /api/tasks — list tasks scoped by role. */
export async function GET() {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  try {
    const tasks = await listTasks(guard.ctx);
    return NextResponse.json({ tasks });
  } catch (err) {
    const message = publicErrorMessage(err, 'list_failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/tasks — create a task (manager/intern).
 *
 * With `leadId` in the body it is the manager's "Assign task" (G-12):
 * `{ engagementId, leadId, title, description?, deadline? }`. The lead must be on the
 * engagement; they get a bell notification and an email, and an audit event is written.
 */
export async function POST(request: Request) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const raw: unknown = await request.json().catch(() => undefined);
  if (raw === undefined) {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (raw && typeof raw === 'object' && 'leadId' in raw) {
    const parsed = assignTaskSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'invalid_body' },
        { status: 400 },
      );
    }
    return handleAssignTask(guard.ctx, parsed.data);
  }
  type CreateBody = {
    engagementId?: string;
    title?: string;
    checklistKey?: string;
    status?: StatusCode;
    assigneeId?: string | null;
    dueAt?: string | null;
    notes?: string | null;
  };
  const body = (raw ?? {}) as CreateBody;
  if (!body.engagementId?.trim()) {
    return NextResponse.json({ error: 'engagementId_required' }, { status: 400 });
  }
  try {
    const task = await createTask(guard.ctx, {
      engagementId: body.engagementId,
      title: body.title,
      checklistKey: body.checklistKey,
      status: body.status,
      assigneeId: body.assigneeId,
      dueAt: body.dueAt,
      notes: body.notes,
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    const message = publicErrorMessage(err, 'create_failed');
    const status = message.includes('not permitted') || message.includes('may not') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
