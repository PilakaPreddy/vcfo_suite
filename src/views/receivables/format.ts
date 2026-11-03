import { daysLeft } from '@/lib/receivables/dates';
import type { SheetInvoice } from '@/lib/receivables/model';

/** Shared bits of the receivables screens: rupee figures and the status chip. */

const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** 2010500 → "20,10,500". */
export function inr(n: number | null | undefined): string {
  return INR.format(Math.round(n ?? 0));
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
