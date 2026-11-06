import 'server-only';

import { NextResponse } from 'next/server';
import { requireAuth, type AuthContext } from '@/auth/guards';
import { canUseAsk } from '@/lib/ask/access';
import { askConfig } from '@/lib/ask/config';

/**
 * Every Ask VCFO route: feature flag (404 when off) → session (401) → role
 * (403 for anyone `canUseAsk` leaves out, such as the developer role).
 */
export async function requireAsk(): Promise<{ ok: true; ctx: AuthContext } | { ok: false; response: NextResponse }> {
  if (!askConfig().enabled) {
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  const guard = await requireAuth();
  if (guard.ok === false) {
    return { ok: false, response: NextResponse.json({ error: guard.error }, { status: guard.status }) };
  }
  if (!canUseAsk(guard.ctx.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Ask VCFO is not available for your role' }, { status: 403 }) };
  }
  return { ok: true, ctx: guard.ctx };
}
