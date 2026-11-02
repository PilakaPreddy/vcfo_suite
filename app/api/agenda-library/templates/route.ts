import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { listTemplates, saveTemplate } from '@/db/repositories/board-meetings';
import { agendaItem, meetingError } from '../../board-meetings/_respond';

/**
 * GET  /api/agenda-library/templates?engagementId= — firm templates plus that client's.
 * POST /api/agenda-library/templates — save an agenda as a template (client, or firm for admins).
 */
export async function GET(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    return NextResponse.json({ templates: await listTemplates(guard.ctx, new URL(request.url).searchParams.get('engagementId')) });
  } catch (e) {
    return meetingError(e);
  }
}

export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const body = await parseJsonBody(
    request,
    z.object({ name: z.string().min(1).max(120), meetingType: z.string(), agenda: z.array(agendaItem).max(60), engagementId: z.string().nullable().optional() }),
  );
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ template: await saveTemplate(guard.ctx, body.data as Parameters<typeof saveTemplate>[1]) }, { status: 201 });
  } catch (e) {
    return meetingError(e);
  }
}
