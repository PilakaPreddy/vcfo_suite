import 'server-only';

import { getFilings } from '@/db/repositories/filings';
import { DUE_SOON_DAYS, filingStatus, financialYearForDate, formatFilingDate, parseIsoDate, todayIST, type FilingRow } from '@/lib/compliance/filings';
import { barsByMonth, defineMetric, EVERYONE, isAre, openList, tally, wasWere } from '../define';
import { periodRange } from '../periods';
import type { MetricDefinition, MetricEnv, MetricFilters, MetricValue } from '../types';
import { barsByGroup, oneEngagement } from './shared';

/** Same rows and same status rule as the Filings page, so the number and the list always agree. */
async function filingsWith(env: MetricEnv, filters: MetricFilters, status: ReturnType<typeof filingStatus>): Promise<FilingRow[]> {
  const { rows } = await getFilings(env.ctx, { engagementId: oneEngagement(env, filters) });
  return rows.filter((r) => filingStatus(r, env.now) === status && (!filters.area || r.compliance === filters.area));
}

function valueOf(rows: FilingRow[], env: MetricEnv, shown: (r: FilingRow) => string, tone: 'late' | 'waiting' | 'plain', bars?: MetricValue['bars']): MetricValue {
  const rowsOut = rows.map((r) => ({
    // A client has one company, so the filing is the row; staff read the company first.
    label: env.shell === 'client' ? r.particular : r.companyName,
    detail: env.shell === 'client' ? undefined : r.particular,
    value: shown(r),
    engagementId: r.engagementId,
    tone,
  }));
  return { count: rows.length, rows: rowsOut, bars: bars ?? barsByGroup(rows.map((r) => r.compliance)) };
}

const noun = (filters: MetricFilters): [string, string] => (filters.area ? [`${filters.area} filing`, `${filters.area} filings`] : ['filing', 'filings']);

export const FILING_METRICS: MetricDefinition[] = [
  defineMetric({
    name: 'filings.overdue',
    label: 'Overdue filings',
    aliases: ['overdue filings', 'filings overdue', 'late filings', 'filings late', 'missed filings', 'overdue compliances', 'compliances overdue', 'overdue returns'],
    roles: EVERYONE,
    filters: ['area', 'client'],
    async run(env, filters) {
      const rows = (await filingsWith(env, filters, 'overdue')).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      // A filing missed last year is still overdue, but the Filings page shows one year at a time, so say so.
      const fyStart = `${financialYearForDate(parseIsoDate(todayIST(env.now))!).startYear}-04-01`;
      const earlier = rows.filter((r) => r.dueDate < fyStart).length;
      const remark = earlier === 0 ? undefined : `${earlier === rows.length ? 'all' : earlier} of them from an earlier financial year`;
      return { ...valueOf(rows, env, (r) => `Due ${formatFilingDate(r.dueDate)}`, 'late'), total: remark };
    },
    say(n, { where, total }, _value, filters) {
      const [one, many] = noun(filters);
      return `${tally(n, one, many)} ${isAre(n)} overdue ${where}${total ? `, ${total}` : ''}.`;
    },
    link: (filters) => openList('Open overdue filings', 'filings', filters, { status: 'overdue' }),
  }),
  defineMetric({
    name: 'filings.due_soon',
    label: 'Filings due soon',
    aliases: ['filings due soon', 'due soon filings', 'upcoming filings', 'filings upcoming', 'filings coming up', 'upcoming compliances', 'compliances due soon', 'upcoming returns', 'aane wali filings', 'aane wale filings'],
    roles: EVERYONE,
    filters: ['area', 'client'],
    async run(env, filters) {
      const rows = (await filingsWith(env, filters, 'due-soon')).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      return valueOf(rows, env, (r) => `Due ${formatFilingDate(r.dueDate)}`, 'waiting');
    },
    say(n, { where }, _value, filters) {
      const [one, many] = noun(filters);
      return `${tally(n, one, many)} ${isAre(n)} due in the next ${DUE_SOON_DAYS} days ${where}.`;
    },
    link: (filters) => openList('Open filings due soon', 'filings', filters, { status: 'due-soon' }),
  }),
  defineMetric({
    name: 'filings.filed',
    label: 'Filings filed',
    aliases: ['filings filed', 'filed filings', 'filings done', 'filings completed', 'returns filed', 'filings submitted'],
    roles: EVERYONE,
    filters: ['period', 'area', 'client'],
    defaultPeriod: 'this_fy',
    async run(env, filters) {
      const range = periodRange(filters, env.now);
      const rows = (await filingsWith(env, filters, 'filed'))
        .filter((r) => !range || (r.filedOn! >= range.from && r.filedOn! <= range.to))
        .sort((a, b) => b.filedOn!.localeCompare(a.filedOn!));
      return valueOf(rows, env, (r) => `Filed ${formatFilingDate(r.filedOn!)}`, 'plain', barsByMonth(rows.map((r) => r.filedOn), range));
    },
    say(n, { when, where }, _value, filters) {
      const [one, many] = noun(filters);
      return `${tally(n, one, many)} ${wasWere(n)} filed ${when} ${where}.`;
    },
    link: (filters) => openList('Open filed filings', 'filings', filters, { status: 'filed' }),
  }),
];
