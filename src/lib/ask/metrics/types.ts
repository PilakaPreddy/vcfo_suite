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
  /** A named financial year by its April start, for example 2025 for FY 2025-26. Wins over `period`. */
  fyStartYear?: number;
  /** Law area for filings, as stored on the obligation (for example `GST`). */
  area?: string;
  /** A value from the metric's own `statuses`. */
  status?: string;
  /** One company already resolved inside the caller's scope: database id, route id and name. */
  client?: { id: string; key: string; name: string };
}

export interface MetricRow {
  label: string;
  /** The second line of a row. */
  detail?: string;
  /** The short tag at the end of a row. */
  value?: string;
  /** Route key of the project this row opens, when it belongs to one. */
  engagementId?: string;
  tone?: 'late' | 'waiting' | 'plain';
}

export interface MetricValue {
  count: number;
  /** The rows behind the count, in display order; the card draws the first few. Never sent to a model. */
  rows: MetricRow[];
  /** A count per month or per bucket, drawn as a small chart when the rows are too many to read. */
  bars?: Array<{ label: string; count: number }>;
  /** A sum or remark that belongs in the sentence, already formatted. */
  total?: string;
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
  /** Which filters this metric accepts. A question that asks for any other is not this metric. */
  filters: ReadonlyArray<keyof MetricFilters>;
  /** Words that select a status, mapped to the value `run` reads from `filters.status`. */
  statuses?: Readonly<Record<string, string>>;
  defaultPeriod?: MetricPeriod;
  run(env: MetricEnv, filters: MetricFilters): Promise<MetricValue>;
  /** Code writes the answer card from the value, with `origin: 'deterministic'`. */
  answer(value: MetricValue, filters: MetricFilters, env: MetricEnv): AnswerEnvelope;
}
