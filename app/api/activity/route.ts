import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import { createActivity, listActivity } from '@/db/repositories/activity';
import { publicErrorMessage } from '@/lib/api-error';

/** GET /api/activity */
export async function GET() {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  try {
    const activity = await listActivity(guard.ctx);
    return NextResponse.json({ activity });
  } catch (err) {
    const message = publicErrorMessage(err, 'list_failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/activity */
export async function POST(request: Request) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  let body: {
    engagementId?: string;
    actor?: string;
    verb?: string;
    target?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body.verb?.trim()) {
    return NextResponse.json({ error: 'verb_required' }, { status: 400 });
  }
  try {
    const event = await createActivity(guard.ctx, {
      engagementId: body.engagementId,
      actor: body.actor,
      verb: body.verb.trim(),
      target: body.target,
    });
    return NextResponse.json({ activity: event }, { status: 201 });
  } catch (err) {
    const message = publicErrorMessage(err, 'create_failed');
    const status = message.includes('not permitted') || message.includes('required') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
