/** Class names and plain text helpers of the FX tab (Phase 10), shared by its sections. */

export const TH = 'whitespace-nowrap bg-surface-sunken px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[.04em] text-ink-muted';
export const TD = 'border-t border-line-soft px-2.5 py-2 align-middle';
export const NUM = `${TD} text-right font-mono tabular-nums`;
export const SELECT = 'h-10 rounded-md border-1.5 border-line-strong bg-surface-raised px-3 text-[14px]';

export function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.';
}

/** "+0.42%" with its sign. */
export function pctText(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined) return '—';
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}%`;
}

/** A rate change: "+0.4120" or "−0.1200". */
export function signedRate(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(4)}`;
}

export function invoiceName(r: { clientName: string | null; invoiceNo: string | null }) {
  return `${r.clientName ?? 'Foreign receipt'}${r.invoiceNo ? ` ${r.invoiceNo}` : ''}`;
}
