import { NextResponse } from 'next/server';
import { ExpiryError } from '@/db/repositories/expiry-items';

/** Maps a repository refusal to its status; anything else is a 500 and is rethrown to the log. */
export function expiryError(e: unknown) {
  if (e instanceof ExpiryError) return NextResponse.json({ error: e.code }, { status: e.status });
  console.error('[expiries]', e);
  return NextResponse.json({ error: 'server_error' }, { status: 500 });
}
