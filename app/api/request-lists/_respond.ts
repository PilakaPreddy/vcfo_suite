import { NextResponse } from 'next/server';
import { z } from 'zod';
import { RequestListError } from '@/db/repositories/request-lists';

/** Shared answers for the request list routes. */

export const STAFF_AND_CLIENT = ['super_admin', 'admin', 'manager', 'intern', 'client'] as const;
export const STAFF = ['super_admin', 'admin', 'manager', 'intern'] as const;
export const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const itemKind = z.enum(['document', 'answer', 'confirmation']);

export function requestListError(error: unknown) {
  if (error instanceof RequestListError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('[request-lists] route failed', error);
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
}
