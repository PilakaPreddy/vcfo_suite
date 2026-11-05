import 'server-only';

import {
  listDocumentsPendingReview,
  listOpenRequestsForMetrics,
  listOpenTasksForMetrics,
  type OpenRequestRow,
  type OpenTaskRow,
} from '@/db/repositories/ask-metrics';
import { listAnnouncements } from '@/db/repositories/announcements';
import { listMeetings } from '@/db/repositories/board-meetings/meetings';
import { listBatches } from '@/db/repositories/labour-registers';
import { getPeopleMetrics } from '@/db/repositories/metrics';
import { formatFilingDate, todayIST } from '@/lib/compliance/filings';
import { ADMIN_AND_MANAGERS, counted, defineMetric, EVERYONE, isAre, openList, STAFF, tally } from '../define';
import type { MetricDefinition, MetricRow } from '../types';
import { oneEngagement } from './shared';

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;

const taskRow = (t: OpenTaskRow, today: string): MetricRow => {
  const due = t.deadline ? t.deadline.toISOString().slice(0, 10) : null;
  const row: MetricRow = {
    label: t.title,
    detail: t.companyName ?? undefined,
    value: due ? `Due ${formatFilingDate(due)}` : 'No date',
    tone: due && due < today ? 'late' : 'plain',
  };
  if (t.slug) row.engagementId = t.slug;
  return row;
};

const requestRow = (r: OpenRequestRow, today: string): MetricRow => ({
  label: r.companyName,
  detail: r.title,
  value: r.dueOn ? `Due ${formatFilingDate(r.dueOn)}` : 'No date',
  engagementId: r.slug,
  tone: r.dueOn && r.dueOn < today ? 'late' : 'waiting',
});

/** A client's request reads as the thing asked for; their own company goes without saying. */
const forClient = (row: MetricRow, shell: string): MetricRow =>
  shell === 'client' ? { label: row.detail ?? row.label, value: row.value } : row;

const IST_DAY = (d: Date | null) => (d ? todayIST(d) : null);

export const WORK_METRICS: MetricDefinition[] = [
  defineMetric({
    name: 'requests.open',
    label: 'Open document requests',
    aliases: ['requests', 'open requests', 'pending requests', 'requests pending', 'document requests', 'open document requests', 'pending document requests', 'documents requested', 'documents pending', 'pending documents', 'documents baki', 'baki documents'],
    roles: EVERYONE,
    filters: ['client'],
    async run(env, filters) {
      const today = todayIST(env.now);
      const rows = await listOpenRequestsForMetrics(env.ctx, oneEngagement(env, filters));
      return counted(rows.map((r) => forClient(requestRow(r, today), env.shell)));
    },
    say: (n, { where }) => `${tally(n, 'document request is', 'document requests are')} open ${where}.`,
    link: () => openList('Open requests', 'requests'),
  }),
  defineMetric({
    name: 'requests.overdue',
    label: 'Overdue document requests',
    aliases: ['overdue requests', 'requests overdue', 'late requests', 'overdue document requests', 'document requests overdue', 'overdue documents', 'documents overdue'],
    roles: EVERYONE,
    filters: ['client'],
    async run(env, filters) {
      const today = todayIST(env.now);
      const rows = (await listOpenRequestsForMetrics(env.ctx, oneEngagement(env, filters))).filter((r) => r.dueOn && r.dueOn < today);
      return counted(rows.map((r) => forClient(requestRow(r, today), env.shell)));
    },
    say: (n, { where }) => `${tally(n, 'document request is', 'document requests are')} overdue ${where}.`,
    link: () => openList('Open requests', 'requests'),
  }),
  defineMetric({
    name: 'tasks.open',
    label: 'Open tasks',
    aliases: ['tasks', 'open tasks', 'pending tasks', 'tasks pending', 'tasks open', 'tasks baki', 'baki tasks', 'task count'],
    roles: STAFF,
    filters: ['client'],
    async run(env, filters) {
      const today = todayIST(env.now);
      const rows = await listOpenTasksForMetrics(env.ctx, filters.client?.id);
      return counted(rows.map((t) => taskRow(t, today)));
    },
    say: (n, { where }) => `${tally(n, 'task is', 'tasks are')} open ${where}.`,
    link: () => openList('Open tasks', 'tasks'),
  }),
  defineMetric({
    name: 'tasks.overdue',
    label: 'Overdue tasks',
    aliases: ['overdue tasks', 'tasks overdue', 'late tasks', 'tasks late', 'missed tasks'],
    roles: STAFF,
    filters: ['client'],
    async run(env, filters) {
      const today = todayIST(env.now);
      const rows = (await listOpenTasksForMetrics(env.ctx, filters.client?.id)).filter((t) => {
        const day = IST_DAY(t.deadline);
        return day !== null && day < today;
      });
      return counted(rows.map((t) => taskRow(t, today)));
    },
    say: (n, { where }) => `${tally(n, 'task is', 'tasks are')} overdue ${where}.`,
    link: () => openList('Open tasks', 'tasks'),
  }),
  defineMetric({
    name: 'tasks.due_today',
    label: 'Tasks due today',
    aliases: ['tasks due today', 'tasks today', 'due today', 'today tasks', 'aaj ke tasks', 'tasks aaj', 'aaj tasks'],
    roles: STAFF,
    filters: ['client'],
    async run(env, filters) {
      const today = todayIST(env.now);
      const rows = (await listOpenTasksForMetrics(env.ctx, filters.client?.id)).filter((t) => IST_DAY(t.deadline) === today);
      return counted(rows.map((t) => taskRow(t, today)));
    },
    say: (n, { where }) => `${tally(n, 'task is', 'tasks are')} due today ${where}.`,
    link: () => openList('Open tasks', 'tasks'),
  }),
  defineMetric({
    name: 'documents.pending_review',
    label: 'Documents waiting for review',
    aliases: ['documents to review', 'documents pending review', 'documents waiting review', 'pending review', 'review pending', 'documents for review', 'documents awaiting review', 'files to review', 'files pending review'],
    roles: STAFF,
    filters: ['client'],
    async run(env, filters) {
      const rows = await listDocumentsPendingReview(env.ctx, filters.client?.id);
      return counted(rows.map((d) => ({ label: d.companyName, detail: d.fileName, value: 'To review', engagementId: d.slug, tone: 'waiting' as const })));
    },
    say: (n, { where }) => `${tally(n, 'document is', 'documents are')} waiting for review ${where}.`,
    link: () => openList('Open documents', 'documents'),
  }),
  defineMetric({
    name: 'board_meetings.upcoming',
    label: 'Upcoming board meetings',
    aliases: ['upcoming board meetings', 'board meetings upcoming', 'board meetings', 'upcoming meetings', 'meetings upcoming', 'next board meetings', 'aane wali board meetings'],
    roles: EVERYONE,
    filters: ['client'],
    async run(env, filters) {
      const today = todayIST(env.now);
      const rows = (await listMeetings(env.ctx, { engagementId: oneEngagement(env, filters) }))
        .filter((m) => m.meetingDate >= today && m.word !== 'Done')
        .sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));
      return counted(
        rows.map((m) => ({
          label: env.shell === 'client' ? m.meetingNo || 'Board meeting' : m.companyName,
          detail: env.shell === 'client' ? undefined : m.meetingNo || 'Board meeting',
          value: formatFilingDate(m.meetingDate),
          engagementId: m.engagementId,
        })),
      );
    },
    say: (n, { where }) => `${tally(n, 'board meeting is', 'board meetings are')} coming up ${where}.`,
    link: (filters) => openList('Open compliances', 'obligations', filters),
  }),
  defineMetric({
    name: 'labour_registers.pending',
    label: 'Labour registers pending',
    aliases: ['labour registers', 'labour registers pending', 'pending labour registers', 'labor registers', 'labor registers pending', 'pending labor registers', 'registers pending', 'pending registers', 'labour register baki'],
    roles: EVERYONE,
    filters: ['client'],
    async run(env, filters) {
      const rows = (await listBatches(env.ctx, { engagementId: oneEngagement(env, filters) })).filter((b) => ['open', 'mapping', 'ready'].includes(b.status));
      return counted(rows.map((b) => ({ label: `${b.stateCode} register`, value: `${formatFilingDate(b.periodFrom)} to ${formatFilingDate(b.periodTo)}` })));
    },
    say: (n, { where }) => `${tally(n, 'labour register batch is', 'labour register batches are')} still pending ${where}.`,
    link: (filters) => openList('Open labour registers', 'labour', filters),
  }),
  defineMetric({
    name: 'leads.workload',
    label: 'Project lead workload',
    aliases: ['lead workload', 'leads workload', 'workload of leads', 'project lead workload', 'project leads workload', 'workload', 'team workload', 'project leads', 'leads'],
    roles: ADMIN_AND_MANAGERS,
    async run(env) {
      const leads = (await getPeopleMetrics(env.ctx, env.now)).filter((p) => p.role === 'intern').sort((a, b) => b.openItems - a.openItems);
      return {
        count: leads.length,
        rows: leads.map((p) => ({ label: p.name, value: `${tally(p.clients, 'client', 'clients')}, ${tally(p.openItems, 'open item', 'open items').toLowerCase()}` })),
        bars: leads.slice(0, 12).map((p) => ({ label: p.name, count: p.openItems })),
      };
    },
    say: (n, { where }) => `${tally(n, 'project lead', 'project leads')} ${where}, busiest first.`,
    link: () => openList('Open people', 'people'),
  }),
  defineMetric({
    name: 'people.team',
    label: 'People on the team',
    aliases: ['people', 'team', 'team members', 'people on team', 'staff', 'staff count', 'team size', 'employees', 'managers and leads'],
    roles: ADMIN_AND_MANAGERS,
    async run(env) {
      const people = await getPeopleMetrics(env.ctx, env.now);
      return counted(people.map((p) => ({ label: p.name, detail: p.role === 'intern' ? 'Project lead' : 'Manager', value: tally(p.clients, 'client', 'clients') })));
    },
    say: (n, { where }) => `There ${isAre(n)} ${tally(n, 'person', 'people').toLowerCase()} on the team ${where}.`,
    link: () => openList('Open people', 'people'),
  }),
  defineMetric({
    name: 'updates.this_week',
    label: 'Updates this week',
    aliases: ['updates this week', 'this week updates', 'updates', 'new updates', 'latest updates', 'law updates this week', 'announcements this week', 'is hafte ke updates', 'is hafte updates', 'updates is hafte'],
    roles: EVERYONE,
    async run(env, _filters) {
      const since = env.now.getTime() - WEEK_DAYS * DAY_MS;
      const rows = (await listAnnouncements(env.ctx, 120)).filter((a) => Date.parse(a.publishedAt) >= since);
      return counted(rows.map((a) => ({ label: a.title.slice(0, 60), value: formatFilingDate(a.publishedAt.slice(0, 10)) })));
    },
    say: (n, _words, _value, _filters, env) =>
      // Only what has been posted here; never a claim that the law itself did not change.
      `${tally(n, 'update was', 'updates were')} posted here in the last ${WEEK_DAYS} days, as of ${formatFilingDate(todayIST(env.now))}.`,
    link: () => openList('Open updates', 'updates'),
  }),
];
