import { NextResponse } from 'next/server';
import { NoticeError } from '@/db/repositories/notice-cases';
import type { ActionContext } from '@/lib/actions/types';
import { maskIdentityNumbers } from '@/lib/ask/mask';

/** Shared answers for the notice desk routes. */

export const STAFF = ['super_admin', 'admin', 'manager', 'intern'] as const;

/** The screen acts as the signed-in person, exactly as the chat would. */
export function routeActionContext(auth: ActionContext['auth']): ActionContext {
  return { auth, engagementId: null, conversationId: null, runId: null, now: new Date(), via: 'route' };
}

/** Maps a repository refusal to its status; anything else is a 500 and is logged masked. */
export function noticeError(e: unknown) {
  if (e instanceof NoticeError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error('[notices] route failed', maskIdentityNumbers(e instanceof Error ? (e.stack ?? e.message) : String(e)));
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
}
