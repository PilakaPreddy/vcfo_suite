import type { AppRole } from '@/auth/guards';
import { METRICS } from './catalog';
import { otherTimeWords, readPeriod, type PeriodRead } from './periods';
import type { MetricDefinition, MetricFilters } from './types';

/**
 * The strict local match. A question matches a metric only when every word in it is accounted for:
 * a question word, a period, a status or the metric's own alias. A leftover word ("why", "not",
 * "penalty") means this is some other question, so it falls through to the router. A wrong number is
 * worse than a model call, so nothing here guesses.
 */

/** Question scaffolding, English and common Hinglish. Words that change the meaning stay out of it. */
const SCAFFOLD_PHRASES = /\b(?:how many|how much|number of|no of|count of|total number of|tell me|show me|give me|right now|at present|as of now|do we have|have we)\b/g;
const SCAFFOLD_WORDS = new Set(
  (
    'a an the are is was were be been am has have had do does did will we our i my me us you your there any all in on of for by to at with ' +
    'what whats which show list give tell get got please pls kindly can could currently now still ' +
    'kitne kitni kitna hain hai ho gaye gayi gai gya hue hui huye hua the thi tha ke ki ka ko me mein mai par pe se ' +
    'mere meri mera hamare hamari humare humari apne apni batao bataiye bata dikhao dikhaiye dikha kya koi wale wali waale waali abhi ab aur'
  ).split(' '),
);

function singular(word: string): string {
  if (word.length <= 3 || word.endsWith('ss')) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  return word.endsWith('s') ? word.slice(0, -1) : word;
}

/** Lowercase with punctuation gone, except the hyphen a named financial year needs. */
function clean(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/(?<![0-9])-|-(?![0-9])/g, ' ');
}

/** The words of a phrase that carry meaning, singular and in the order they came. */
export function contentWords(text: string): string[] {
  return clean(text)
    .replace(SCAFFOLD_PHRASES, ' ')
    .split(/\s+/)
    .filter((w) => w && !SCAFFOLD_WORDS.has(w))
    .map(singular);
}

const bagOf = (words: readonly string[]) => [...new Set(words)].sort().join(' ');

interface Alias {
  words: string[];
  bag: string;
}

const aliasCache = new WeakMap<MetricDefinition, Alias[]>();

function aliasesOf(metric: MetricDefinition): Alias[] {
  let aliases = aliasCache.get(metric);
  if (!aliases) {
    aliases = metric.aliases.map((phrase) => {
      const words = contentWords(phrase);
      return { words, bag: bagOf(words) };
    });
    aliasCache.set(metric, aliases);
  }
  return aliases;
}

export function metricsForRole(role: AppRole): MetricDefinition[] {
  return METRICS.filter((m) => m.roles.includes(role));
}

/** Law areas a filing question may name, in the words people use, to the stored area. */
const AREAS: Readonly<Record<string, string>> = {
  gst: 'GST',
  tds: 'Income Tax',
  'income tax': 'Income Tax',
  'income-tax': 'Income Tax',
  it: 'Income Tax',
  mca: 'Companies Act, 2013',
  roc: 'Companies Act, 2013',
  'companies act': 'Companies Act, 2013',
  fema: 'FEMA / RBI',
  rbi: 'FEMA / RBI',
  labour: 'Labour Laws',
  labor: 'Labour Laws',
  llp: 'LLP Act',
};

function periodFilters(metric: MetricDefinition, read: PeriodRead): MetricFilters | null {
  const { period, fyStartYear } = read.filters;
  if (period === 'all_time') return metric.filters.includes('period') ? { period } : {};
  if (period === undefined && fyStartYear === undefined) return metric.defaultPeriod ? { period: metric.defaultPeriod } : {};
  // A metric with no period cannot honour "this month", so the question is not this metric.
  return metric.filters.includes('period') ? read.filters : null;
}

/** A metric's status words, compared after the same clean-up as the question. */
function statusFor(metric: MetricDefinition, phrase: string): string | undefined {
  return Object.entries(metric.statuses ?? {}).find(([word]) => contentWords(word).join(' ') === phrase)?.[1];
}

export interface MetricCandidate {
  metric: MetricDefinition;
  filters: MetricFilters;
  /** Words left over that may name a company; the caller resolves them inside the caller's scope. */
  companyWords: string[];
}

/** The metric a question strictly asks, if any. `role` limits which metrics exist for this person. */
export function matchMetric(text: string, role: AppRole): MetricCandidate | null {
  const read = readPeriod(clean(text));
  const words = contentWords(read.rest);
  if (words.length === 0) return null;
  const bag = bagOf(words);
  const metrics = metricsForRole(role);

  for (const metric of metrics) {
    if (!aliasesOf(metric).some((a) => a.bag === bag)) continue;
    const filters = periodFilters(metric, read);
    return filters ? { metric, filters, companyWords: [] } : null;
  }

  // Not an exact alias: a metric's alias plus exactly a status, an area or a company name.
  let best: { metric: MetricDefinition; alias: Alias } | null = null;
  for (const metric of metrics) {
    for (const alias of aliasesOf(metric)) {
      if (alias.words.every((w) => words.includes(w)) && (!best || alias.words.length > best.alias.words.length)) {
        best = { metric, alias };
      }
    }
  }
  if (!best) return null;
  const { metric, alias } = best;
  const rest = words.filter((w) => !alias.words.includes(w));
  const phrase = rest.join(' ');
  const filters = periodFilters(metric, read);
  if (!filters) return null;
  const status = statusFor(metric, phrase);
  if (status) return { metric, filters: { ...filters, status }, companyWords: [] };
  if (AREAS[phrase] && metric.filters.includes('area')) return { metric, filters: { ...filters, area: AREAS[phrase] }, companyWords: [] };
  if (metric.filters.includes('client')) return { metric, filters, companyWords: rest };
  return null;
}

/**
 * Filters for a metric the router named. The model only picks the name; the period comes from code
 * reading the rewritten question, and a time this metric cannot honour means no metric answer.
 */
export function routerMetricFilters(metric: MetricDefinition, rewritten: string): MetricFilters | null {
  const read = readPeriod(clean(rewritten));
  const own = new Set(aliasesOf(metric).flatMap((a) => a.words));
  if (otherTimeWords(read.rest).some((w) => !own.has(w))) return null;
  const filters = periodFilters(metric, read);
  if (!filters) return null;
  // The router chose the metric, so the narrowing words are still read here, in code.
  const words = contentWords(read.rest);
  const text = ` ${words.join(' ')} `;
  const area = metric.filters.includes('area') ? Object.keys(AREAS).find((word) => text.includes(` ${word} `)) : undefined;
  const status = Object.keys(metric.statuses ?? {}).find((word) => text.includes(` ${contentWords(word).join(' ')} `));
  return {
    ...filters,
    ...(area ? { area: AREAS[area]! } : {}),
    ...(status ? { status: metric.statuses![status]! } : {}),
  };
}

/** Words every company name carries, which never tell two companies apart. */
const NAME_NOISE = new Set(['pvt', 'private', 'ltd', 'limited', 'llp', 'india', 'opc']);

/** The one company whose name starts with these words, or null when none or several do. */
export function matchCompany<C extends { companyName: string }>(words: readonly string[], companies: readonly C[]): C | null {
  const want = words.filter((w) => !NAME_NOISE.has(w));
  if (want.length === 0) return null;
  const found = companies.filter((c) => {
    const name = contentWords(c.companyName).filter((w) => !NAME_NOISE.has(w));
    return want.every((w, i) => name[i] === w);
  });
  return found.length === 1 ? found[0]! : null;
}
