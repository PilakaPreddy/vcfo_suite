import { NextResponse } from 'next/server';
import { ClientHealthError } from '@/db/repositories/client-health';
import type { ActionContext } from '@/lib/actions/types';

/** Shared answers for the client health routes. */

export const STAFF = ['super_admin', 'admin', 'manager', 'intern'] as const;

/** The screen acts as the signed-in person, exactly as the chat would. */
export function routeActionContext(auth: ActionContext['auth']): ActionContext {
  return { auth, engagementId: null, conversationId: null, runId: null, now: new Date(), via: 'route' };
}

export function healthError(e: unknown) {
  if (e instanceof ClientHealthError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error('[client-health] route failed', e instanceof Error ? e.message : String(e));
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
}
