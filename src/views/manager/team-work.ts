import type { ComplianceFiling } from '@/data/compliance';
import { regOf } from '@/lib/ui/regulator';
import type { DocRequest, Engagement, TaskInstance } from '@/data/engagements';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import {
  buildInternWorkItems,
  buildTaskWorkItem,
  internWorkKpis,
  stepOwnerLead,
  type InternWorkItem,
  type InternWorkKpis,
} from '@/lib/intern/intern-work';
import {
  TODAY_STATUS_ORDER,
  todayAreaOf,
  todayStatusOf,
  workItemChangedAt,
  type TeamTaskRow,
  type TodayStatus,
} from '@/components/staff/today/today-rows';
import { adminProjectPath, adminProjectStepPath } from '@/lib/projects/project-step-path';
import { shortDate, type RecordTimeline, type TimelineRow } from '@/components/timeline/timeline-model';

/**
 * TEAM WORK — the project leads' work items on a manager's (or an admin's) engagements, for the
 * manager Work page, the one-lead page and the admin Managers page (prototype `WorkScreen`
 * manager mode, `LeadsScreen`, `ManagersScreen`).
 *
 * The items are built with `buildInternWorkItems`, the same builder as each lead's own Work list
 * and the manager's Team tasks (`buildTeamTaskRows`), so every screen counts the same work:
 *   - every step, filing and request of an engagement belongs to its primary lead;
 *   - a co-lead lists only the steps reassigned to them (`stepOwnerLead`);
 *   - a task belongs to the lead it is assigned to (`tasks.assigned_to` = the lead's profile).
 * Each item keeps its owner, its status word and area, and a `row` in the `TeamTaskRow` shape
 * that the Reassign dialog takes. Links point at the staff project pages under `projectBase`,
 * not the lead's own `/app/intern` pages. Pure: no React, no `db`.
 */

export interface TeamLead {
  /** The `intern_id` key used on engagements. */
  id: string;
  name: string;
  /** The lead's profile id; tasks are assigned to it. */
  profileId?: string;
}

export interface TeamWorkItem extends InternWorkItem {
  leadId: string;
  leadName: string;
  status: TodayStatus;
  area: string;
  /** The same item as a Team tasks row, for `ReassignDialog`. */
  row: TeamTaskRow;
}

export function buildTeamWork(opts: {
  engagements: Engagement[];
  getState: (engagement: Engagement) => Record<string, ChecklistItemStateSlice>;
  filings: ComplianceFiling[];
  requests: DocRequest[];
  tasks?: TaskInstance[];
  leads: TeamLead[];
  projectBase: '/app/admin' | '/app/manager';
  now: Date;
}): TeamWorkItem[] {
  const byLead = new Map<string, Engagement[]>();
  const ownersOnly = new Map<string, Engagement[]>();
  const push = (map: Map<string, Engagement[]>, key: string, eng: Engagement) => {
    const list = map.get(key);
    if (list) list.push(eng);
    else map.set(key, [eng]);
  };
  for (const eng of opts.engagements) {
    if (!eng.internId || eng.stage === 'Operational Readiness') continue;
    push(byLead, eng.internId, eng);
    const owners = new Set<string>();
    for (const slice of Object.values(opts.getState(eng))) {
      const owner = stepOwnerLead(eng, slice);
      if (owner && owner !== eng.internId) owners.add(owner);
    }
    for (const owner of owners) push(ownersOnly, owner, eng);
  }
  const filingById = new Map(opts.filings.map((f) => [f.id, f]));
  const engById = new Map(opts.engagements.map((e) => [e.id, e]));
  const nameOf = (id: string) => opts.leads.find((l) => l.id === id)?.name ?? 'Project lead';
  const out: TeamWorkItem[] = [];
  const seen = new Set<string>();

  const add = (leadId: string, item: InternWorkItem, task?: TaskInstance) => {
    const eng = engById.get(item.engagementId);
    if (!eng || seen.has(item.id)) return;
    seen.add(item.id);
    const slice = item.catalogId ? opts.getState(eng)[item.catalogId] : undefined;
    const status = todayStatusOf(item, slice, opts.now);
    const href =
      item.source === 'filing'
        ? `${opts.projectBase}/compliances/calendar`
        : item.source === 'step' && item.catalogId
          ? adminProjectStepPath(eng, item.catalogId, opts.projectBase)
          : adminProjectPath(eng, opts.projectBase);
    const area = todayAreaOf(item, filingById);
    const leadName = nameOf(leadId);
    out.push({
      ...item,
      href,
      leadId,
      leadName,
      status,
      area,
      row: {
        id: `${leadId}:${item.id}`,
        itemId: item.id,
        source: item.source,
        engagementId: eng.id,
        companyName: eng.companyName,
        title: item.title,
        leadId,
        leadName,
        area,
        dueAt: item.dueAt,
        status,
        withClient: status === 'Waiting' && (item.kind === 'waiting-client' || item.kind === 'waiting-request'),
        href,
        catalogId: item.catalogId,
        requestId: item.requestId,
        taskId: item.taskId,
        taskStatus: task?.status,
        changedAt: workItemChangedAt(item, slice, task?.updatedAt),
      },
    });
  };

  for (const [leadId, engagements] of byLead) {
    const ids = new Set(engagements.map((e) => e.id));
    const items = buildInternWorkItems({
      engagements,
      getChecklistState: opts.getState,
      internId: leadId,
      filings: opts.filings.filter((f) => ids.has(f.engagementId)),
      requests: opts.requests.filter((r) => ids.has(r.engagementId)),
      now: opts.now,
    });
    for (const item of items) add(leadId, item);
  }
  for (const [leadId, engagements] of ownersOnly) {
    const items = buildInternWorkItems({
      engagements,
      getChecklistState: opts.getState,
      internId: leadId,
      ownedStepsOnly: true,
      now: opts.now,
    });
    for (const item of items) add(leadId, item);
  }
  const leadKeyByProfile = new Map(opts.leads.filter((l) => l.profileId).map((l) => [l.profileId as string, l.id]));
  for (const task of opts.tasks ?? []) {
    const eng = engById.get(task.engagementId);
    const leadId = task.assigneeId ? leadKeyByProfile.get(task.assigneeId) : undefined;
    if (!eng || !leadId || eng.stage === 'Operational Readiness') continue;
    const item = buildTaskWorkItem(task, eng, opts.now);
    if (item) add(leadId, item, task);
  }
  return out;
}

/** The Work head counts ("N open · N companies") for a set of team items. */
export function teamWorkKpis(items: TeamWorkItem[], now: Date): InternWorkKpis {
  return internWorkKpis(items, now);
}

/** One segment per status word, in chart order (the Status card). Empty words are kept. */
export function statusCounts(items: Array<{ status: TodayStatus }>): Array<{ status: TodayStatus; n: number; bar: string; stroke: string }> {
  return TODAY_STATUS_ORDER.map((s) => ({
    status: s.status,
    n: items.filter((i) => i.status === s.status).length,
    bar: s.bar,
    stroke: s.stroke,
  }));
}

export interface AreaSplit {
  area: string;
  done: number;
  /** Open and not late. */
  pending: number;
  late: number;
  total: number;
}

/** The By area card: done, pending and late per area, in the order the areas first appear. */
export function areaSplit(items: Array<{ area: string; status: TodayStatus }>): AreaSplit[] {
  const out = new Map<string, AreaSplit>();
  for (const i of items) {
    // Group by the regulator the area pill shows, so "MCA" and "Corporate Compliance" are one MCA row.
    const key = regOf(i.area) ?? i.area;
    const row = out.get(key) ?? { area: i.area, done: 0, pending: 0, late: 0, total: 0 };
    row.total += 1;
    if (i.status === 'Done') row.done += 1;
    else if (i.status === 'Overdue') row.late += 1;
    else row.pending += 1;
    out.set(key, row);
  }
  return [...out.values()];
}

const DAY_MS = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * A Gantt (shared `GanttTimeline`) of open dated items: each bar runs from the item's start
 * (or four days before the due date when it has none) to the due date. A late item is one red
 * bar; an item already open shows solid up to today and hatch after it; a later one is planned.
 * At most `limit` rows, the nearest due date first. Null when nothing has a due date.
 */
export function workTimeline(items: InternWorkItem[], today: string, limit = 12): RecordTimeline | null {
  const dated = items
    .filter((i) => i.kind !== 'done' && i.dueAt)
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
    .slice(0, limit);
  if (dated.length === 0) return null;
  const todayT = Date.parse(`${today}T00:00:00Z`);
  const rows: TimelineRow[] = dated.map((i) => {
    const due = i.dueAt!.slice(0, 10);
    const dueT = Date.parse(`${due}T00:00:00Z`);
    const started = i.startedAt ? i.startedAt.slice(0, 10) : null;
    const from = started && Date.parse(`${started}T00:00:00Z`) <= dueT ? started : isoDay(dueT - 4 * DAY_MS);
    const fromT = Date.parse(`${from}T00:00:00Z`);
    const late = i.isOverdue || dueT < todayT;
    const bars: TimelineRow['bars'] = late
      ? [{ from, to: due, kind: 'late' }]
      : fromT <= todayT
        ? [
            { from, to: today, kind: 'cur' },
            { from: today, to: due, kind: 'rest' },
          ]
        : [{ from, to: due, kind: 'plan' }];
    return {
      id: i.id,
      name: i.title,
      status: late || fromT <= todayT ? 'current' : 'planned',
      bars,
      count: shortDate(due),
      note: late ? { text: 'Overdue', bad: true } : undefined,
    };
  });
  let start = Math.min(todayT, ...rows.map((r) => Date.parse(`${r.bars[0]!.from}T00:00:00Z`))) - DAY_MS;
  let end = Math.max(todayT, ...rows.map((r) => Date.parse(`${r.bars[r.bars.length - 1]!.to}T00:00:00Z`))) + DAY_MS;
  if (end - start < 14 * DAY_MS) end = start + 14 * DAY_MS;
  start = Math.floor(start / DAY_MS) * DAY_MS;
  const span = end - start;
  const ticks = [1, 2, 3, 4].map((k) => isoDay(start + Math.round((span * k) / 5 / DAY_MS) * DAY_MS));
  return { start: isoDay(start), end: isoDay(end), ticks, rows, incorporating: false, coi: null };
}
