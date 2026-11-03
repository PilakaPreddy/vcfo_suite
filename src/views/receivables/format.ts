import { daysLeft } from '@/lib/receivables/dates';
import type { SheetInvoice } from '@/lib/receivables/model';

/** Shared bits of the receivables screens: rupee figures and the status chip. */

const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** 2010500 → "20,10,500". */
export function inr(n: number | null | undefined): string {
  return INR.format(Math.round(n ?? 0));
}

const FC = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 12000 → "12,000.00", a foreign amount in the international grouping. */
export function fc(n: number | null | undefined): string {
  return FC.format(n ?? 0);
}

/**
 * "USD 12,000.00" for a foreign row with its foreign amount; null for an INR row, including a
 * row of a snapshot published before Phase 9 (no currency at all).
 */
export function fcText(row: Pick<SheetInvoice, 'currency' | 'fcAmount'>, amount: number | null | undefined = row.fcAmount): string | null {
  const c = (row.currency ?? '').trim().toUpperCase();
  if (!c || c === 'INR' || amount === null || amount === undefined) return null;
  return `${c} ${fc(amount)}`;
}

/** A booked or effective rate: "83.1250". */
export function rateText(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toFixed(4);
}

/** "+₹12,000" or "−₹3,400": a gain or loss in INR. */
export function signedInr(n: number): string {
  const r = Math.round(n);
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}₹${INR.format(Math.abs(r))}`;
}

/** "20,10,500" or "₹20,10,500" → 2010500; NaN when it is not a number. */
export function parseInr(s: string): number {
  return Number(s.replace(/[₹,\s]/g, ''));
}

function plural(n: number, w: string) {
  return `${n} ${w}${n === 1 ? '' : 's'}`;
}

export function statusText(inv: Pick<SheetInvoice, 'status' | 'dueDate'>, today: string): { text: string; tone: 'ok' | 'bad' | 'warn' | 'idle' } {
  if (inv.status === 'received') return { text: 'Received', tone: 'ok' };
  const dl = daysLeft(inv.dueDate, today);
  if (dl < 0) return { text: `${plural(-dl, 'day')} overdue`, tone: 'bad' };
  if (dl === 0) return { text: 'Due today', tone: 'warn' };
  return { text: `Due in ${plural(dl, 'day')}`, tone: 'idle' };
}

/** "3 Nov 2026, 09:15" in India time. */
export function stamp(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
}
