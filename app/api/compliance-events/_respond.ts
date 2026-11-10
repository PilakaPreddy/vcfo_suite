import { NextResponse } from 'next/server';
import { ComplianceEventError } from '@/db/repositories/compliance-events';

/** Shared answers for the compliance event routes. */

export const STAFF = ['super_admin', 'admin', 'manager', 'intern'] as const;

export function complianceEventError(error: unknown) {
  if (error instanceof ComplianceEventError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('[compliance-events] route failed', error);
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
}
