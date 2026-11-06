import 'server-only';

import { listOpenInvoicesForMetrics, type OpenInvoiceRow } from '@/db/repositories/ask-metrics';
import { formatFilingDate, todayIST } from '@/lib/compliance/filings';
import { ADMIN_AND_MANAGERS, defineMetric, isAre, openList, tally } from '../define';
import type { MetricDefinition, MetricValue } from '../types';

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function valueOf(rows: OpenInvoiceRow[]): MetricValue {
  return {
    count: rows.length,
    total: inr(rows.reduce((sum, r) => sum + Number(r.amountInr), 0)),
    rows: rows.map((r) => ({
      label: r.clientName,
      detail: r.invoiceNo ? `Invoice ${r.invoiceNo}, due ${formatFilingDate(r.dueDate)}` : `Due ${formatFilingDate(r.dueDate)}`,
      value: inr(Number(r.amountInr)),
    })),
  };
}

export const INVOICE_METRICS: MetricDefinition[] = [
  defineMetric({
    name: 'invoices.outstanding',
    label: 'Outstanding invoices',
    aliases: ['outstanding invoices', 'invoices outstanding', 'open invoices', 'invoices open', 'unpaid invoices', 'invoices unpaid', 'pending invoices', 'invoices pending', 'receivables', 'outstanding receivables', 'outstanding', 'total outstanding', 'invoices baki', 'baki invoices', 'paisa baki'],
    roles: ADMIN_AND_MANAGERS,
    run: async (env) => valueOf(await listOpenInvoicesForMetrics(env.ctx)),
    say: (n, { total }) => (n === 0 ? 'No invoices are outstanding on your receivable sheets.' : `${tally(n, 'invoice is', 'invoices are')} outstanding on your receivable sheets, ${total} in all.`),
    link: () => openList('Open receivables', 'receivables'),
  }),
  defineMetric({
    name: 'invoices.overdue',
    label: 'Overdue invoices',
    aliases: ['overdue invoices', 'invoices overdue', 'late invoices', 'invoices late', 'overdue receivables', 'receivables overdue', 'overdue payments', 'payments overdue', 'invoices past due'],
    roles: ADMIN_AND_MANAGERS,
    async run(env) {
      const today = todayIST(env.now);
      return valueOf((await listOpenInvoicesForMetrics(env.ctx)).filter((r) => r.dueDate < today && !r.disputed));
    },
    say: (n, { total }) => (n === 0 ? 'No invoices are overdue on your receivable sheets.' : `${tally(n, 'invoice is', 'invoices are')} overdue on your receivable sheets, ${total} in all, leaving out disputed ones.`),
    link: () => openList('Open receivables', 'receivables'),
  }),
];
