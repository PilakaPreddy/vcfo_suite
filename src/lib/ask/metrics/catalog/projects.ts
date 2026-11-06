import 'server-only';

import { getItem } from '@/data/checklist';
import { deriveStuckReason } from '@/lib/projects/project-stuck';
import { buildProgress } from '@/lib/client/client-overview';
import { registrationCells } from '@/db/repositories/metrics';
import { pendingApprovals, routeKey, waitingOnClient, type StaffEngagement } from '@/lib/ask/tools/staff';
import { counted, defineMetric, EVERYONE, isAre, openList, STAFF, tally } from '../define';
import type { MetricDefinition, MetricEnv, MetricFilters, MetricRow } from '../types';
import { barsByGroup, engagementsFor } from './shared';

const active = (e: StaffEngagement) => e.engagement.stage !== 'Operational Readiness';

const HEALTH_WORDS: Readonly<Record<string, string>> = { 'at risk': 'at-risk', 'on track': 'on-track' };
const HEALTH_TEXT: Readonly<Record<string, string>> = { 'at-risk': 'at risk', 'on-track': 'on track' };

const overdueProject = (e: StaffEngagement) =>
  e.engagement.health === 'overdue' || deriveStuckReason(e.engagement, e.state as Parameters<typeof deriveStuckReason>[1]) === 'blocked';

function registrationRows(rows: StaffEngagement[], wanted: (cell: string) => boolean): MetricRow[] {
  return rows.flatMap((e) => {
    const cells = Object.entries(registrationCells(e.state, e.engagement.slug ?? e.engagement.id)).filter(([, cell]) => wanted(cell));
    return cells.map(([stepId, cell]) => ({
      label: e.engagement.companyName,
      detail: stepTitle(stepId),
      value: cell === 'done' ? 'Done' : cell === 'waiting' ? 'Waiting' : cell === 'overdue' ? 'Overdue' : 'In progress',
      engagementId: routeKey(e),
      tone: cell === 'overdue' ? ('late' as const) : cell === 'waiting' ? ('waiting' as const) : ('plain' as const),
    }));
  });
}

const stepTitle = (id: string) => getItem(id)?.title ?? id;

async function dataFor(env: MetricEnv, filters: MetricFilters) {
  return { engagements: await engagementsFor(env, filters), filings: [], now: env.now };
}

export const PROJECT_METRICS: MetricDefinition[] = [
  defineMetric({
    name: 'projects.active',
    label: 'Active projects',
    aliases: ['projects', 'active projects', 'live projects', 'running projects', 'open projects', 'projects in progress', 'ongoing projects', 'chal rahe projects', 'projects chal rahe'],
    roles: STAFF,
    statuses: HEALTH_WORDS,
    async run(env, filters) {
      const rows = (await engagementsFor(env, {})).filter(active).filter((e) => !filters.status || e.engagement.health === filters.status);
      return counted(
        rows.map((e) => ({
          label: e.engagement.companyName,
          detail: e.engagement.stage,
          engagementId: routeKey(e),
          tone: e.engagement.health === 'on-track' ? ('plain' as const) : ('late' as const),
        })),
        { bars: barsByGroup(rows.map((e) => e.engagement.stage)) },
      );
    },
    say(n, { where }, _value, filters) {
      return filters.status
        ? `${tally(n, 'project is', 'projects are')} ${HEALTH_TEXT[filters.status]} ${where}.`
        : `There ${isAre(n)} ${tally(n, 'active project', 'active projects').toLowerCase()} ${where}.`;
    },
    link: () => openList('Open projects', 'projects'),
  }),
  defineMetric({
    name: 'projects.by_status',
    label: 'Projects by status',
    aliases: ['projects by status', 'project status', 'status of projects', 'projects by stage', 'projects stage wise', 'projects status wise', 'status wise projects'],
    roles: STAFF,
    async run(env) {
      const rows = await engagementsFor(env, {});
      const bars = barsByGroup(rows.map((e) => e.engagement.stage));
      return { count: rows.length, rows: bars.map((b) => ({ label: b.label, value: String(b.count) })), bars };
    },
    say: (n, { where }) => `${tally(n, 'project', 'projects')} ${where}, by stage.`,
    link: () => openList('Open projects', 'projects'),
  }),
  defineMetric({
    name: 'projects.waiting_client',
    label: 'Projects waiting on the client',
    aliases: [
      'projects waiting',
      'projects waiting on client',
      'projects waiting on clients',
      'waiting on client',
      'waiting clients',
      'clients waiting',
      'clients pending',
      'client pending',
      'pending from client',
      'pending from clients',
      'waiting on clients',
      'client ka pending',
      'clients ka wait',
    ],
    roles: STAFF,
    async run(env) {
      const waiting = waitingOnClient(await dataFor(env, {}));
      return counted(
        waiting.map((w) => ({
          label: w.company,
          detail: w.stepTitle,
          value: w.daysWaiting === null ? 'Waiting' : `${w.daysWaiting}d waiting`,
          engagementId: w.engagementId,
          tone: 'waiting' as const,
        })),
      );
    },
    say: (n, { where }) => `${tally(n, 'project is', 'projects are')} waiting on the client ${where}.`,
    link: () => openList('Open waiting projects', 'projects', {}, { view: 'waiting' }),
  }),
  defineMetric({
    name: 'projects.overdue',
    label: 'Overdue projects',
    aliases: ['overdue projects', 'projects overdue', 'late projects', 'projects late', 'delayed projects', 'projects delayed'],
    roles: STAFF,
    async run(env) {
      const rows = (await engagementsFor(env, {})).filter(active).filter(overdueProject);
      return counted(rows.map((e) => ({ label: e.engagement.companyName, detail: e.engagement.stage, value: 'Overdue', engagementId: routeKey(e), tone: 'late' as const })));
    },
    say: (n, { where }) => `${tally(n, 'project is', 'projects are')} overdue ${where}.`,
    link: () => openList('Open overdue projects', 'projects', {}, { view: 'overdue' }),
  }),
  defineMetric({
    name: 'steps.remaining',
    label: 'Checklist steps remaining',
    aliases: ['steps remaining', 'remaining steps', 'steps left', 'steps pending', 'pending steps', 'steps baki', 'baki steps', 'steps bache'],
    roles: EVERYONE,
    filters: ['client'],
    async run(env, filters) {
      const rows = (await engagementsFor(env, filters)).map((e) => {
        const progress = buildProgress(e.state);
        return { e, done: progress.done, total: progress.total };
      });
      return {
        count: rows.reduce((sum, r) => sum + (r.total - r.done), 0),
        rows: rows
          .filter((r) => r.done < r.total)
          .sort((a, b) => b.total - b.done - (a.total - a.done))
          .map((r) => ({
            label: r.e.engagement.companyName,
            detail: r.e.engagement.stage,
            value: `${r.done} of ${r.total} done`,
            engagementId: routeKey(r.e),
          })),
      };
    },
    say: (n, { where }) => `${tally(n, 'checklist step remains', 'checklist steps remain')} ${where}.`,
    link: (filters, env) => (env.shell === 'client' ? { dest: { to: 'incorporation' }, label: 'Open Incorporation' } : openList('Open projects', 'projects', filters)),
  }),
  defineMetric({
    name: 'approvals.pending',
    label: 'Approvals pending',
    aliases: ['approvals', 'approvals pending', 'pending approvals', 'approvals waiting', 'approvals baki', 'baki approvals', 'pending approvals list', 'items awaiting approval', 'awaiting approval'],
    roles: STAFF,
    async run(env) {
      const pending = pendingApprovals(await dataFor(env, {}));
      return counted(
        pending.map((p) => ({
          label: p.company,
          detail: p.stepTitle,
          value: p.daysWaiting === null ? 'Waiting' : `${p.daysWaiting}d waiting`,
          engagementId: p.engagementId,
          tone: 'waiting' as const,
        })),
      );
    },
    say: (n, { where }) => `${tally(n, 'approval is', 'approvals are')} pending ${where}.`,
    link: () => openList('Open approvals', 'approvals'),
  }),
  defineMetric({
    name: 'registrations.in_progress',
    label: 'Registrations in progress',
    aliases: ['registrations', 'registrations in progress', 'registrations pending', 'pending registrations', 'open registrations', 'registrations baki'],
    roles: EVERYONE,
    filters: ['client'],
    async run(env, filters) {
      const rows = registrationRows(await engagementsFor(env, filters), (cell) => cell === 'progress' || cell === 'waiting' || cell === 'overdue');
      return counted(rows, { bars: barsByGroup(rows.map((r) => r.detail!)) });
    },
    say: (n, { where }) => `${tally(n, 'registration is', 'registrations are')} in progress ${where}.`,
    link: (filters) => openList('Open registrations', 'registrations', filters),
  }),
  defineMetric({
    name: 'registrations.done',
    label: 'Registrations done',
    aliases: ['registrations done', 'registrations completed', 'completed registrations', 'finished registrations'],
    roles: EVERYONE,
    filters: ['client'],
    async run(env, filters) {
      const rows = registrationRows(await engagementsFor(env, filters), (cell) => cell === 'done');
      return counted(rows, { bars: barsByGroup(rows.map((r) => r.detail!)) });
    },
    say: (n, { where }) => `${tally(n, 'registration is', 'registrations are')} done ${where}.`,
    link: (filters) => openList('Open registrations', 'registrations', filters),
  }),
];
