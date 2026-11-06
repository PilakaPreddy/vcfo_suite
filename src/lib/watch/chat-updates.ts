import 'server-only';

import type { AuthContext } from '@/auth/guards';
import type { AnswerEnvelope, AskShell } from '@/data/ask/schema';
import { listUpdatesForChat, type ChatUpdateRow } from '@/db/repositories/reg-updates';
import { listPublicSourceStatus, listWatchSources } from '@/db/repositories/reg-sources';
import { EVERYONE, openList } from '@/lib/ask/metrics/define';
import type { MetricDefinition, MetricFilters, MetricValue } from '@/lib/ask/metrics/types';
import { todayIST } from '@/lib/compliance/filings';
import { formatSourceDate, sourceCoverage, type SourceCoverage } from './source-status';
import type { RegArea } from './types';

/**
 * "What changed in GST this week?" is a list, so code answers it from `reg_updates` with no model.
 * A question about what a change means goes to search, so this matches only when a person clearly
 * asks for the latest changes. An empty list says what was checked and never that the law is quiet.
 */
const AREA_WORDS: ReadonlyArray<readonly [RegArea, RegExp]> = [
  ['gst', /\b(gst|cgst|igst|sgst|cbic)\b/i],
  ['tax', /\b(income[- ]?tax|tds|cbdt|direct tax)\b/i],
  ['mca', /\b(mca|companies act|roc|llp)\b/i],
  ['fema', /\b(rbi|fema|forex)\b/i],
  ['securities', /\b(sebi|securities)\b/i],
  ['labour', /\b(labour|labor|epf|epfo|esi|esic|pf)\b/i],
  ['audit', /\b(nfra|icai|audit)\b/i],
  ['insolvency', /\b(ibbi|insolvency|ibc)\b/i],
];

const ASKS_FOR_CHANGES = /\b(what('?s| has| have)? (changed|new)|what changed|(latest|recent|new) (\w+ )?(updates?|changes?|circulars?|notifications?)|updates?|changes?|kya (badla|naya))\b/i;
/** "Any changes to my task this week" is about the firm's own work, not the law. */
const ABOUT_OWN_WORK = /\b(my|our|mera|hamara|tasks?|projects?|requests?|clients?|compan(y|ies)|filings?|documents?|invoices?|meetings?|registrations?)\b/i;
const NAMES_A_PERIOD = /\b(this week|today|this month|last week|past week|recent(ly)?|latest|is hafte)\b/i;

export interface UpdatesQuestion {
  area?: RegArea;
  days: number;
  label: string;
}

export function matchUpdatesQuestion(message: string): UpdatesQuestion | null {
  if (!ASKS_FOR_CHANGES.test(message) || !NAMES_A_PERIOD.test(message) || ABOUT_OWN_WORK.test(message)) return null;
  const area = AREA_WORDS.find(([, words]) => words.test(message))?.[0];
  if (/\btoday\b/i.test(message)) return { area, days: 1, label: 'today' };
  if (/\b(this|last|past) month\b/i.test(message)) return { area, days: 30, label: 'in the last 30 days' };
  return { area, days: 7, label: 'in the last 7 days' };
}

const AREA_LABEL: Record<RegArea, string> = {
  gst: 'GST',
  tax: 'income tax',
  mca: 'company law',
  fema: 'RBI and FEMA',
  securities: 'securities',
  labour: 'labour',
  audit: 'audit',
  insolvency: 'insolvency',
  general: 'general',
};

export function buildUpdatesAnswer(input: {
  question: UpdatesQuestion;
  total: number;
  rows: ChatUpdateRow[];
  coverage: SourceCoverage;
  now: Date;
}): AnswerEnvelope {
  const { question, total, rows, coverage } = input;
  const asOf = formatSourceDate(input.now);
  const scope = question.area ? ` for ${AREA_LABEL[question.area]}` : '';
  const base: Pick<AnswerEnvelope, 'citations' | 'actions' | 'links' | 'origin' | 'depth'> = {
    citations: [],
    actions: [],
    links: [openList('Open updates', 'updates')],
    origin: 'deterministic',
    depth: 'normal',
  };
  if (total === 0) {
    return {
      ...base,
      line: `No updates found from these sources${scope} ${question.label}, as of this date (${asOf}).`,
      why: `${coverage.line} This does not mean the law has not changed.`.slice(0, 600),
    };
  }
  const notReviewed = rows.filter((row) => !row.reviewed).length;
  return {
    ...base,
    line: `${total} ${total === 1 ? 'update' : 'updates'}${scope} ${question.label}, as of ${asOf}.${notReviewed > 0 ? ` ${notReviewed} shown ${notReviewed === 1 ? 'is' : 'are'} not yet reviewed.` : ''}${rows.length === 1 ? ` ${rows[0]!.title.slice(0, 300)}` : ''}`,
    why: coverage.line.slice(0, 600),
    visual:
      rows.length >= 2
        ? {
            type: 'keyFacts',
            facts: rows.map((row) => ({
              k: `${formatSourceDate(new Date(`${row.day}T00:00:00Z`))}${row.reviewed ? '' : ' · Not yet reviewed'}`.slice(0, 60),
              v: row.title.slice(0, 200),
            })),
          }
        : undefined,
    citations: rows.flatMap((row) => (row.sourceUrl ? [{ id: row.id, label: row.title.slice(0, 200), url: row.sourceUrl }] : [])),
  };
}

async function coverageFor(ctx: AuthContext, clientView: boolean, now: Date): Promise<SourceCoverage> {
  return sourceCoverage(clientView ? await listPublicSourceStatus(ctx) : await listWatchSources(ctx), now);
}

async function readUpdates(ctx: AuthContext, shell: AskShell, question: UpdatesQuestion, now: Date) {
  const clientView = shell === 'client';
  const since = todayIST(new Date(now.getTime() - (question.days - 1) * 86_400_000));
  const { total, rows } = await listUpdatesForChat(ctx, { clientView, area: question.area, since });
  return { total, rows, coverage: await coverageFor(ctx, clientView, now) };
}

export async function answerUpdatesQuestion(ctx: AuthContext, shell: AskShell, question: UpdatesQuestion, now: Date): Promise<AnswerEnvelope> {
  return buildUpdatesAnswer({ question, ...(await readUpdates(ctx, shell, question, now)), now });
}

/** The metric catalog reads a law area as filings store it; Watch files the same laws under its own keys. */
const WATCH_AREA: Readonly<Record<string, RegArea>> = {
  GST: 'gst',
  'Income Tax': 'tax',
  'Companies Act, 2013': 'mca',
  'LLP Act': 'mca',
  'FEMA / RBI': 'fema',
  'Labour Laws': 'labour',
};

interface UpdatesValue extends MetricValue {
  updates?: ChatUpdateRow[];
  coverage?: SourceCoverage;
}

const weekQuestion = (filters: MetricFilters): UpdatesQuestion => ({
  area: filters.area ? WATCH_AREA[filters.area] : undefined,
  days: 7,
  label: 'in the last 7 days',
});

/** The same answer in the metric catalog's shape, so the strict match and the router can name it. */
export const updatesThisWeekMetric: MetricDefinition = {
  name: 'updates.this_week',
  label: 'Official updates this week',
  aliases: [
    'updates this week',
    'this week updates',
    'updates',
    'new updates',
    'latest updates',
    'law updates this week',
    'announcements this week',
    'what changed this week',
    'new circulars this week',
    'is hafte kya badla',
    'is hafte ke updates',
    'is hafte updates',
    'updates is hafte',
  ],
  roles: EVERYONE,
  filters: ['area'],
  async run(env, filters): Promise<UpdatesValue> {
    const { total, rows, coverage } = await readUpdates(env.ctx, env.shell, weekQuestion(filters), env.now);
    return { count: total, rows: rows.map((row) => ({ label: row.title, value: row.day })), updates: rows, coverage };
  },
  answer: (value: UpdatesValue, filters, env) =>
    buildUpdatesAnswer({
      question: weekQuestion(filters),
      total: value.count,
      rows: value.updates ?? [],
      coverage: value.coverage ?? sourceCoverage([], env.now),
      now: env.now,
    }),
};
