import type { AppRole } from '@/auth/guards';
import type { AnswerEnvelope, AnswerLink, MetricList, Visual } from '@/data/ask/schema';
import { isFirmWideAdmin } from '@/lib/auth';
import { monthsOf, periodRange, type PeriodRange } from './periods';
import type { MetricDefinition, MetricEnv, MetricFilters, MetricRow, MetricValue } from './types';

/** Who sees which metric, and the shared answer card every metric builds. */

export const EVERYONE: readonly AppRole[] = ['super_admin', 'admin', 'manager', 'intern', 'client'];
export const STAFF: readonly AppRole[] = ['super_admin', 'admin', 'manager', 'intern'];
export const ADMIN_AND_MANAGERS: readonly AppRole[] = ['super_admin', 'admin', 'manager'];

/** Rows drawn in the card; the link opens the full list. */
const CARD_ROWS = 8;
/** Key facts are capped by the visual's own contract. */
const CARD_FACTS = 6;

const grouped = (n: number) => n.toLocaleString('en-IN');

/** "No filings", "1 filing", "12 filings". */
export function tally(n: number, one: string, many: string): string {
  if (n === 0) return `No ${many}`;
  return n === 1 ? `1 ${one}` : `${grouped(n)} ${many}`;
}

export const isAre = (n: number) => (n === 1 ? 'is' : 'are');
export const wasWere = (n: number) => (n === 1 ? 'was' : 'were');

/** Where the count was taken: the firm, the caller's projects, or one company. */
export function scopeWords(env: MetricEnv, filters: MetricFilters): string {
  if (filters.client) return `for ${filters.client.name}`;
  if (env.shell === 'client') return 'for your company';
  return isFirmWideAdmin(env.ctx.role) ? 'across the firm' : 'on your projects';
}

export interface SentenceWords {
  /** "in FY 2026-27", "so far", or empty for a metric with no period. */
  when: string;
  where: string;
  total?: string;
}

export interface MetricSpec extends Omit<MetricDefinition, 'answer' | 'filters'> {
  filters?: MetricDefinition['filters'];
  say(n: number, words: SentenceWords, value: MetricValue, filters: MetricFilters, env: MetricEnv): string;
  /** The list this count came from, filtered where that list can be. */
  link?: (filters: MetricFilters, env: MetricEnv) => AnswerLink | null;
}

export const openList = (
  label: string,
  list: MetricList,
  filters: MetricFilters = {},
  extra: { status?: 'overdue' | 'due-soon' | 'filed'; view?: 'overdue' | 'waiting' } = {},
): AnswerLink => ({
  dest: { to: 'list', list, ...extra, ...(filters.client ? { company: filters.client.key } : {}) },
  label,
});

function rowsVisual(rows: readonly MetricRow[], env: MetricEnv): Visual | undefined {
  // A client card has no project rows: those link into staff pages.
  const asProjects = env.shell !== 'client' && rows.length > 0 && rows.every((r) => r.engagementId);
  if (asProjects) {
    return {
      type: 'projectRows',
      rows: rows.slice(0, CARD_ROWS).map((r) => ({
        engagementId: r.engagementId!,
        name: r.label.slice(0, 160),
        step: (r.detail ?? '').slice(0, 160),
        meta: (r.value ?? '').slice(0, 120),
        tone: r.tone ?? 'plain',
      })),
    };
  }
  if (rows.length < 2) return undefined;
  return {
    type: 'keyFacts',
    facts: rows.slice(0, CARD_FACTS).map((r) => ({
      k: r.label.slice(0, 60),
      v: ([r.detail, r.value].filter(Boolean).join(', ') || '—').slice(0, 200),
    })),
  };
}

/** Names when they fit on the card; past that a small chart says more, when there is one. */
function visualFor(value: MetricValue, env: MetricEnv): Visual | undefined {
  const bars = value.bars?.filter((b) => b.count > 0).length ?? 0;
  if (env.shell !== 'client' && value.bars && bars >= 2 && (value.count > CARD_ROWS || value.rows.length === 0)) {
    return { type: 'bars', items: value.bars.slice(0, 12).map((b) => ({ k: b.label.slice(0, 40), v: b.count })) };
  }
  return rowsVisual(value.rows, env);
}

export function defineMetric(spec: MetricSpec): MetricDefinition {
  const { say, link, ...rest } = spec;
  return {
    filters: [],
    ...rest,
    answer(value, filters, env): AnswerEnvelope {
      const range = periodRange(filters, env.now);
      const when = range?.label ?? (spec.filters?.includes('period') ? 'so far' : '');
      const line = say(value.count, { when, where: scopeWords(env, filters), total: value.total }, value, filters, env);
      const target = link?.(filters, env);
      return {
        line: line.replace(/\s+/g, ' ').replace(/ \./g, '.').trim(),
        citations: [],
        actions: [],
        origin: 'deterministic',
        depth: 'normal',
        visual: visualFor(value, env),
        ...(target ? { links: [{ ...target, primary: true }] } : {}),
      };
    },
  };
}

/** A count per month of the range, for a period metric, when the range is longer than one month. */
export function barsByMonth(days: ReadonlyArray<string | null | undefined>, range: PeriodRange | null): MetricValue['bars'] {
  if (!range) return undefined;
  const months = monthsOf(range);
  if (months.length < 2) return undefined;
  const counts = new Map<string, number>();
  for (const day of days) if (day) counts.set(day.slice(0, 7), (counts.get(day.slice(0, 7)) ?? 0) + 1);
  return months.map((m) => ({ label: m.label, count: counts.get(m.key) ?? 0 }));
}

/** The rows of a count: `rows` keeps everything, the card takes the first few. */
export const counted = (rows: MetricRow[], extra: Partial<MetricValue> = {}): MetricValue => ({ count: rows.length, rows, ...extra });
