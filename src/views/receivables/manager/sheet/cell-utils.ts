import type { SheetInvoice } from '@/lib/receivables/model';

/** Shared bits of the sheet's cells (Phase 10): the in-place cell look and two small helpers. */

export const CELL =
  'h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-[13px] outline-none placeholder:text-ink-faint placeholder:font-sans hover:border-line focus:border-brand focus:bg-surface-raised focus:ring-4 focus:ring-focus-ring/25';

export const fxInput = (inv: SheetInvoice) => ({ currency: inv.currency ?? 'INR', fcAmount: inv.fcAmount ?? null, invoiceRate: inv.fxRate ?? null, amountInr: inv.amountInr });

export const invoiceName = (inv: Pick<SheetInvoice, 'clientName' | 'invoiceNo'>) => (inv.invoiceNo ? `${inv.clientName} ${inv.invoiceNo}` : inv.clientName);
