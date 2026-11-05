import type { AppRole, AuthContext } from '@/auth/guards';
import type { AnswerEnvelope, AskShell } from '@/data/ask/schema';

/**
 * The metric catalog: named, exact, role-correct counts. A metric reads through a scoped
 * repository, so an admin sees the firm's number, a lead their own and a client their company's.
 * The model may only pick a `name` from a shortlist; it never writes a query or a number.
 */
export const METRIC_PERIODS = ['this_fy', 'last_fy', 'this_quarter', 'this_month', 'last_month', 'all_time'] as const;
export type MetricPeriod = (typeof METRIC_PERIODS)[number];

export interface MetricFilters {
  period?: MetricPeriod;
  /** Law area or service line, for metrics that declare it (for example `gst`). */
  area?: string;
  status?: string;
}

export interface MetricRow {
  label: string;
  value?: string;
  href?: string;
}

export interface MetricValue {
  count: number;
  /** A few top rows for the card; never sent to a model. */
  rows: MetricRow[];
  byMonth?: Array<{ month: string; count: number }>;
}

export interface MetricEnv {
  ctx: AuthContext;
  shell: AskShell;
  /** The client persona's project, already checked against the caller. */
  engagementId: string | null;
  now: Date;
}

export interface MetricDefinition {
  /** `<subject>.<measure>`, for example `companies.incorporated`. */
  name: string;
  label: string;
  /** Lowercase phrases, Hinglish included, for the strict local match. */
  aliases: readonly string[];
  roles: readonly AppRole[];
  /** Which filters this metric accepts; anything else in a match is dropped. */
  filters: ReadonlyArray<keyof MetricFilters>;
  defaultPeriod?: MetricPeriod;
  run(env: MetricEnv, filters: MetricFilters): Promise<MetricValue>;
  /** Code writes the answer card from the value, with `origin: 'deterministic'`. */
  answer(value: MetricValue, filters: MetricFilters, env: MetricEnv): AnswerEnvelope;
}

export interface MetricMatch {
  metric: MetricDefinition;
  filters: MetricFilters;
  via: 'local' | 'router';
}
