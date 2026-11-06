import 'server-only';

import { formatFilingDate } from '@/lib/compliance/filings';
import { isIncorporated } from '@/lib/compliance/incorporation-state';
import { routeKey } from '@/lib/ask/tools/staff';
import { barsByMonth, counted, defineMetric, EVERYONE, isAre, openList, STAFF, tally, wasWere } from '../define';
import { periodRange } from '../periods';
import type { MetricDefinition } from '../types';
import { engagementsFor } from './shared';

const inRange = (day: string | null | undefined, range: { from: string; to: string } | null) =>
  Boolean(day) && (!range || (day! >= range.from && day! <= range.to));

export const COMPANY_METRICS: MetricDefinition[] = [
  defineMetric({
    name: 'companies.incorporated',
    label: 'Companies incorporated',
    aliases: [
      'companies incorporated',
      'incorporated companies',
      'incorporations',
      'incorporations done',
      'incorporations completed',
      'companies registered',
      'companies formed',
      'company incorporated',
      'companies incorporate',
      'incorporate companies',
      'companies incorporation done',
    ],
    roles: EVERYONE,
    filters: ['period', 'client'],
    defaultPeriod: 'this_fy',
    async run(env, filters) {
      if (env.shell === 'client') {
        // A client has one company, so the fair answer is its own date, whatever period was asked.
        const [own] = await engagementsFor(env, filters);
        const done = own ? isIncorporated(own.engagement, own.state) : false;
        const date = own?.engagement.incorporationDate;
        return { count: done ? 1 : 0, rows: own ? [{ label: own.engagement.companyName, value: date ? formatFilingDate(date) : undefined }] : [] };
      }
      const range = periodRange(filters, env.now);
      const rows = (await engagementsFor(env, filters)).filter(({ engagement, state }) =>
        range ? inRange(engagement.incorporationDate, range) : isIncorporated(engagement, state),
      );
      rows.sort((a, b) => (b.engagement.incorporationDate ?? '').localeCompare(a.engagement.incorporationDate ?? ''));
      return counted(
        rows.map((e) => ({
          label: e.engagement.companyName,
          detail: e.engagement.stage,
          value: e.engagement.incorporationDate ? formatFilingDate(e.engagement.incorporationDate) : 'Incorporated',
          engagementId: routeKey(e),
        })),
        { bars: barsByMonth(rows.map((e) => e.engagement.incorporationDate), range) },
      );
    },
    say(n, { when, where }, value, _filters, env) {
      if (env.shell === 'client') {
        const own = value.rows[0];
        if (!own) return 'No company is linked to this chat yet.';
        if (n === 0) return `Your company, ${own.label}, has not been incorporated yet.`;
        return `Your company, ${own.label}, was incorporated${own.value ? ` on ${own.value}` : ''}.`;
      }
      return `${tally(n, 'company', 'companies')} ${wasWere(n)} incorporated ${when} ${where}.`;
    },
    link: (filters) => openList('Open projects', 'projects', filters),
  }),
  defineMetric({
    name: 'companies.in_progress',
    label: 'Companies still being incorporated',
    aliases: [
      'companies in progress',
      'companies not incorporated',
      'companies yet to be incorporated',
      'incorporations in progress',
      'incorporations pending',
      'pending incorporations',
      'companies pending incorporation',
      'pre incorporation companies',
    ],
    roles: STAFF,
    filters: ['client'],
    async run(env, filters) {
      const rows = (await engagementsFor(env, filters)).filter((e) => !isIncorporated(e.engagement, e.state));
      return counted(rows.map((e) => ({ label: e.engagement.companyName, detail: e.engagement.stage, engagementId: routeKey(e) })));
    },
    say: (n, { where }) => `${tally(n, 'company is', 'companies are')} still being incorporated ${where}.`,
    link: (filters) => openList('Open projects', 'projects', filters),
  }),
  defineMetric({
    name: 'clients.total',
    label: 'Clients',
    aliases: ['clients', 'companies', 'client count', 'total clients', 'client companies', 'clients on board', 'company count'],
    roles: STAFF,
    async run(env) {
      const rows = await engagementsFor(env, {});
      return counted(rows.map((e) => ({ label: e.engagement.companyName, detail: e.engagement.stage, engagementId: routeKey(e) })));
    },
    say: (n, { where }) => `There ${isAre(n)} ${tally(n, 'client', 'clients').toLowerCase()} ${where}.`,
    link: () => openList('Open projects', 'projects'),
  }),
  defineMetric({
    name: 'clients.new',
    label: 'New clients',
    aliases: ['new clients', 'clients added', 'clients onboarded', 'clients joined', 'new companies', 'naye clients', 'nayi companies', 'naye client'],
    roles: STAFF,
    filters: ['period'],
    defaultPeriod: 'this_fy',
    async run(env, filters) {
      const range = periodRange(filters, env.now);
      const rows = (await engagementsFor(env, {})).filter((e) => inRange(e.engagement.createdAt?.slice(0, 10), range));
      rows.sort((a, b) => b.engagement.createdAt.localeCompare(a.engagement.createdAt));
      return counted(
        rows.map((e) => ({
          label: e.engagement.companyName,
          detail: e.engagement.stage,
          value: `Added ${formatFilingDate(e.engagement.createdAt.slice(0, 10))}`,
          engagementId: routeKey(e),
        })),
        { bars: barsByMonth(rows.map((e) => e.engagement.createdAt?.slice(0, 10)), range) },
      );
    },
    say: (n, { when, where }) => `${tally(n, 'client', 'clients')} ${wasWere(n)} added ${when} ${where}.`,
    link: () => openList('Open projects', 'projects'),
  }),
];
