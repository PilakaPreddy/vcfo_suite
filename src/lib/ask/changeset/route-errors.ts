import 'server-only';

import { NextResponse } from 'next/server';
import { AskForbiddenError } from '@/lib/ask/access';
import { ChangesetRefused } from './apply';

/** The changeset routes' one way of answering a refusal; anything else is logged and stays vague. */
export function changesetRefusal(error: unknown): NextResponse {
  if (error instanceof ChangesetRefused) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof AskForbiddenError) return NextResponse.json({ error: 'This card is not available.' }, { status: 403 });
  console.error('[ask-vcfo] changeset route failed', error);
  return NextResponse.json({ error: 'Something went wrong. Nothing more was saved.' }, { status: 500 });
}
