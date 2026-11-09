import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAnyRole, type GuardResult } from '@/auth/guards';
import { AssistAgentAccessError } from '@/db/repositories/assist-agent-runs';
import { AssistResolveRefused } from './resolve';

/**
 * The VCFO Assist agent routes' shared edges. Staff only: super admin (through `admin`), admin,
 * manager and project lead; clients and developers get 403 from the guard. The routes are
 * same-origin (the extension fetches from inside a signed-in Suite tab,
 * docs/specs/assist-profile/06-no-cors.md), so none of them sets a CORS header or answers OPTIONS.
 */

export const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } as const;

export function assistStaffGuard(): Promise<GuardResult> {
  return requireAnyRole('admin', 'manager', 'intern');
}

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function guardFailure(guard: Extract<GuardResult, { ok: false }>): NextResponse {
  return json({ ok: false, error: guard.error }, guard.status);
}

/** Maps the errors the repositories and the resolver throw on purpose; anything else is a 500. */
export function assistErrorResponse(error: unknown, label: string): NextResponse {
  if (error instanceof AssistAgentAccessError) return json({ ok: false, error: error.message }, error.status);
  if (error instanceof AssistResolveRefused) return json({ ok: false, error: error.message }, 422);
  if (error instanceof ZodError) return json({ ok: false, error: error.issues[0]?.message ?? 'invalid_body' }, 400);
  console.error(`[assist-agents] ${label} failed`, error);
  return json({ ok: false, error: 'server_error' }, 500);
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A run or patch id from the URL; anything else reads as not found before it reaches Postgres. */
export function isRowId(value: string): boolean {
  return UUID_SHAPE.test(value);
}
