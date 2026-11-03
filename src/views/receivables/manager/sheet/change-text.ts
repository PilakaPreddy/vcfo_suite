import { monthLong, sheetDate } from '@/lib/receivables/dates';
import { inr } from '../../format';

/**
 * How a change row's before and after values read on the sheet (Phase 10): dates as
 * `02-Nov-26`, amounts in rupees, a partner by name, the invoice month by its name.
 */
export function changeValue(field: string | null, v: string | null, partnerNames: Map<string, string>): string {
  if (v === null || v === '') return '—';
  switch (field) {
    case 'partnerId':
      return partnerNames.get(v) ?? 'a removed partner';
    case 'dueDate':
    case 'invoiceDate':
    case 'remindersPausedUntil':
      return sheetDate(v);
    case 'invoiceMonth':
      return monthLong(v);
    case 'amountInr':
    case 'partPaid':
      return Number.isFinite(Number(v)) ? `₹${inr(Number(v))}` : v;
    case 'fxRate':
      return Number.isFinite(Number(v)) ? Number(v).toFixed(4) : v;
    default:
      return v;
  }
}

/** "due date 16-Oct-26 → 20-Oct-26", or null when the change has no before and after. */
export function changeDiff(c: { field: string | null; before: string | null; after: string | null }, partnerNames: Map<string, string>): string | null {
  if (!c.field || (c.before === null && c.after === null)) return null;
  return `${changeValue(c.field, c.before, partnerNames)} → ${changeValue(c.field, c.after, partnerNames)}`;
}
