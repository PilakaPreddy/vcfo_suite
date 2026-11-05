import { Chip } from '@/components/ui/spectrum-chip';
import type { SheetInvoice } from '@/lib/receivables/model';
import { statusText } from './format';

/** Received, N days overdue, Due today or Due in N days, in the status colours. */
export function StatusChip({ invoice, today }: { invoice: Pick<SheetInvoice, 'status' | 'dueDate'>; today: string }) {
  const s = statusText(invoice, today);
  return (
    <Chip raw tone={s.tone}>
      {s.text}
    </Chip>
  );
}
