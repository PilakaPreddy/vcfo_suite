import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { COMPLIANCE_EVENT_KINDS, EVENT_TRIGGER_RULES } from '@/data/event-triggers';
import { COMPLIANCE_EVENT_STATUSES, listComplianceEvents, type ComplianceEventStatus } from '@/db/repositories/compliance-events';
import { complianceEventError, STAFF } from './_respond';

/**
 * Company events that start an MCA filing (IDEAS-PLAN wave 2, D).
 *
 * GET /api/compliance-events?engagementId=&status=proposed,tracked — staff in scope. The answer
 *     also carries the rule table (form and days per kind) for the record form. Recording or
 *     confirming an event is the reviewed `filing.recordEvent` action (`/api/compliance-events/review`).
 */
export async function GET(request: Request) {
  const guard = await requireAnyRole(...STAFF);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const p = new URL(request.url).searchParams;
  const status = (p.get('status') ?? '')
    .split(',')
    .filter((s): s is ComplianceEventStatus => (COMPLIANCE_EVENT_STATUSES as readonly string[]).includes(s));
  try {
    const events = await listComplianceEvents(guard.ctx, { engagementId: p.get('engagementId'), status });
    const rules = COMPLIANCE_EVENT_KINDS.map((kind) => {
      const r = EVENT_TRIGGER_RULES[kind];
      return { kind, label: r.label, form: r.form, days: r.days, detailKeys: r.detailKeys };
    });
    return NextResponse.json({ events, rules });
  } catch (e) {
    return complianceEventError(e);
  }
}
