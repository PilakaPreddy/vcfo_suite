import type { MetricDefinition } from '../types';
import { COMPANY_METRICS } from './companies';
import { FILING_METRICS } from './filings';
import { INVOICE_METRICS } from './invoices';
import { PROJECT_METRICS } from './projects';
import { WORK_METRICS } from './work';

/** Every named metric. A name is the only thing the router may choose. */
export const METRICS: readonly MetricDefinition[] = [
  ...COMPANY_METRICS,
  ...PROJECT_METRICS,
  ...FILING_METRICS,
  ...WORK_METRICS,
  ...INVOICE_METRICS,
];

export function getMetric(name: string): MetricDefinition | undefined {
  return METRICS.find((m) => m.name === name);
}
