import 'server-only';

import { NextResponse } from 'next/server';
import { requireAnyRole, type AuthContext } from '@/auth/guards';
import { AssistForbiddenError } from '@/db/repositories/assist-runs';
import { assistSetUp } from '@/lib/assist-runs/runs';
import { FILING_FORMS, FilingRefusal } from '@/lib/mca-filing/filing-state';
import { z } from 'zod';

/** Shared by every MCA filing route: 503 while Assist is off, staff only, one error shape. */
export async function assistStaff(): Promise<{ ok: true; ctx: AuthContext } | { ok: false; response: NextResponse }> {
  if (!assistSetUp()) return { ok: false, response: NextResponse.json({ ok: false, error: 'assist_not_set_up' }, { status: 503 }) };
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return { ok: false, response: NextResponse.json({ ok: false, error: guard.error }, { status: guard.status }) };
  return { ok: true, ctx: guard.ctx };
}

export const NO_STORE = { 'Cache-Control': 'private, no-store' };

export const notFound = () => NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

export const formSchema = z.enum(FILING_FORMS);

export function filingError(e: unknown, label: string): NextResponse {
  if (e instanceof FilingRefusal) return NextResponse.json({ ok: false, error: e.code, message: e.message }, { status: e.status });
  if (e instanceof AssistForbiddenError) return NextResponse.json({ ok: false, error: e.message }, { status: 403 });
  console.error(`[mca-filing] ${label} failed`, e instanceof Error ? e.message : e);
  return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
}
