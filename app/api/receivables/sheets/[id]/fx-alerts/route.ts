import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { createAlert, listAlerts } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';
import { alertFields } from '../../../_fx';

/**
 * GET  /api/receivables/sheets/:id/fx-alerts — the sheet's rate alerts.
 * POST /api/receivables/sheets/:id/fx-alerts — add one: email the manager when a currency's rate
 *      goes above or below a level (Phase 10).
 */
const schema = z.object(alertFields);

export async function GET(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    return NextResponse.json({ alerts: await listAlerts(guard.ctx, id) });
  } catch (e) {
    return receivablesError(e);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ alert: await createAlert(guard.ctx, id, body.data) });
  } catch (e) {
    return receivablesError(e);
  }
}
