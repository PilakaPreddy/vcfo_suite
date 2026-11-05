import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { setMessageTriage } from '@/db/repositories/client-messages';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { MESSAGE_TRIAGE_LABEL } from '@/lib/messages/types';
import { triagePatchSchema } from '@/lib/messages/schemas';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/messages/:id { triage } — staff move a client message to new, to do, done or ignored. */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { id } = await context.params;
  const parsed = await parseJsonBody(request, triagePatchSchema);
  if (parsed.ok === false) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const message = await setMessageTriage(guard.ctx, id, parsed.data.triage);
    if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

    await recordAuditEvent(guard.ctx, {
      engagementId: message.engagementId,
      action: 'message.triaged',
      summary: `Client message moved to ${MESSAGE_TRIAGE_LABEL[message.triage].toLowerCase()}`,
      metadata: { messageId: message.id, triage: message.triage },
    });
    return NextResponse.json({ message });
  } catch (err) {
    const msg = publicErrorMessage(err, 'triage_failed');
    if (msg.startsWith('Only client messages')) return NextResponse.json({ error: msg }, { status: 400 });
    console.error('[api/messages/:id] triage failed', err);
    return NextResponse.json({ error: 'Could not update the message' }, { status: 500 });
  }
}
