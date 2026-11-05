import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { ReceivablesError } from '@/db/repositories/receivables';
import { INVOICE_CURRENCY_CODES } from '@/lib/receivables/currencies';

/**
 * Shared parts of the /api/receivables routes (docs/specs/receivables/PLAN.md): the staff guard,
 * the error mapping and field schemas. Who may touch which sheet is decided in the repository
 * (its own manager and the firm-wide admins); the guard only keeps other roles out early.
 */
export function guardReceivables() {
  return requireAnyRole('super_admin', 'admin', 'manager');
}

export function denied(guard: { status: number; error: string }) {
  return NextResponse.json({ error: guard.error }, { status: guard.status });
}

export function receivablesError(e: unknown) {
  if (e instanceof ReceivablesError) return NextResponse.json({ error: e.code }, { status: e.status });
  console.error('[receivables] route failed', e instanceof Error ? e.message : e);
  return NextResponse.json({ error: 'server_error' }, { status: 500 });
}

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date');
export const amount = z.number().positive('amount').max(1e12, 'amount');

export type RouteContext = { params: Promise<{ id: string }> };

/** Phase 9: the invoice currency (INR or a supported foreign currency, Phase 10) and the foreign-currency fields. */
export const currency = z.enum(INVOICE_CURRENCY_CODES, { message: 'currency' });
export const fxFields = {
  currency: currency.optional(),
  fcAmount: z.number().positive('fc_amount').max(1e12, 'fc_amount').nullable().optional(),
  fxRate: z.number().positive('fx_rate').max(100_000, 'fx_rate').nullable().optional(),
  invoiceDate: isoDate.nullable().optional(),
};
