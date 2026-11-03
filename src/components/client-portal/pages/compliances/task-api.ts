'use client';

/**
 * Data for the client's non-statutory tasks and the statutory detail extras (COMPLIANCE-MODEL.md
 * 4.2, 4.3, K-1, K-2): TanStack Query over the routes in docs/ui-port/COMPLIANCE-API.md
 * (`/api/compliances/tasks*` and `/api/compliances/statutory/:instanceId`). For a client the
 * routes keep to its own engagement and to tasks with visibility "client" or "both"; a firm-only
 * task answers 404. They drop internal comments, internal history, escalation reminders, the
 * reviewer and the review note; this module drops them again so the page never shows one.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { todayIso } from '@/lib/client-portal/compliances';
import { portalHref } from '../../routes';
import { COMP_KEY } from './api';
import { useMemo } from 'react';
import { normStage, taskAsRow, type CalRow, type ClientTask } from './tasks';

const TASK_KEY = [...COMP_KEY, 'tasks'] as const;

/**
 * The client task page: /app/client/compliances/obligations/tasks/<id>. A board meeting task
 * opens its meeting page: /app/client/compliances/obligations/meetings/<meetingId>.
 */
export const taskHref = (id: string, boardMeetingId?: string | null) =>
  boardMeetingId ? meetingHref(boardMeetingId) : `${portalHref('obligations')}/tasks/${encodeURIComponent(id)}`;

/** The client board meeting page. */
export const meetingHref = (meetingId: string) => `${portalHref('obligations')}/meetings/${encodeURIComponent(meetingId)}`;

/* ------------------------------------------------------------------ shapes */

export interface DetailStep {
  label: string;
  state: 'done' | 'now' | 'next';
  who: string | null;
  /** yyyy-mm-dd. */
  when: string | null;
  evidence: string | null;
}

export interface DetailReminder {
  key: string;
  label: string;
  to: string;
  /** yyyy-mm-dd. */
  date: string;
  state: 'sent' | 'acknowledged' | 'scheduled' | 'skipped' | 'blocked';
  /** Escalations; the client routes leave them out (D-4), and the screen drops any that come. */
  internal?: boolean;
}

export interface DetailHistory {
  /** ISO time or yyyy-mm-dd. */
  at: string;
  who: string;
  what: string;
}

export interface TaskComment {
  id: string;
  by: string;
  at: string;
  text: string;
  internal?: boolean;
}

export interface TaskFile {
  id: string;
  fileName: string;
  by: string | null;
  at: string;
}

export interface TaskDetail {
  task: ClientTask;
  stageLabel: string | null;
  word: string | null;
  checklist: Array<{ id: string; label: string; done: boolean; at: string | null; by: string | null }>;
  attachments: TaskFile[];
  comments: TaskComment[];
  reminders: DetailReminder[];
  history: DetailHistory[];
  steps: DetailStep[];
  can: { comment: boolean; upload: boolean };
}

/** The statutory detail of one period for the client (D-1 to D-4, client part only). */
export interface StatExtras {
  stage: string | null;
  stageLabel: string | null;
  word: string | null;
  daysToDue: number | null;
  owner: string | null;
  rule: { dueRule: string | null; applies: string | null; penalty: string | null; note: string | null } | null;
  reminders: DetailReminder[];
  remindersBlockedBy: string[];
  history: DetailHistory[];
  steps: DetailStep[];
  previous: Array<{ id: string; periodLabel: string | null; dueDate: string; filedOn: string | null; late: boolean | null }>;
  canUpload: boolean;
}

/* ---------------------------------------------------------------- parsing */

type Raw = Record<string, unknown>;
const s = (v: unknown): string | null => (v == null || v === '' ? null : String(v));
const day = (v: unknown): string | null => (s(v) ? String(v).slice(0, 10) : null);
/** A `Person` ({ id, name }) or a plain name. */
const person = (v: unknown): string | null => (v && typeof v === 'object' ? s((v as Raw).name) : s(v));

/** One task from the route, read loosely so a renamed optional field never breaks the page. */
function parseTask(r: Raw): ClientTask {
  const del = (r.deliverable ?? null) as Raw | null;
  return {
    id: String(r.id),
    name: String(r.title ?? r.name ?? 'Task'),
    activityName: s(r.activityName ?? (r.activity as Raw | undefined)?.module ?? (r.activity as Raw | undefined)?.name),
    startDate: day(r.startDate ?? r.start) ?? day(r.endDate ?? r.end ?? r.dueDate) ?? todayIso(),
    endDate: day(r.endDate ?? r.end ?? r.dueDate) ?? todayIso(),
    urgency: String(r.urgency ?? 'low'),
    visibility: String(r.visibility ?? 'both'),
    stage: normStage(s(r.stage ?? r.status)),
    completedOn: day(r.completedAt ?? r.completedOn),
    ownerName: person(r.owner) ?? s(r.ownerName),
    notifyDays: Number(r.remindBefore ?? r.notifyDays ?? 5) || 5,
    deliverable: del && (del.id || del.fileName) ? { id: String(del.id ?? ''), fileName: String(del.fileName ?? del.name ?? 'Deliverable') } : null,
    boardMeetingId: s(r.boardMeetingId),
  };
}

const arr = <T,>(v: unknown, f: (x: Raw) => T): T[] => (Array.isArray(v) ? (v as Raw[]).map(f) : []);

const parseStep = (x: Raw): DetailStep => ({
  label: String(x.label ?? x.title ?? ''),
  state: x.state === 'done' || x.state === 'now' ? x.state : 'next',
  who: person(x.who ?? x.by),
  when: day(x.when ?? x.at ?? x.date),
  evidence: s(x.evidence),
});
const parseReminder = (x: Raw): DetailReminder => ({
  key: String(x.key ?? x.kind ?? x.label),
  label: String(x.label ?? x.key ?? ''),
  to: String(x.to ?? x.recipients ?? ''),
  date: day(x.date ?? x.on ?? x.at) ?? '',
  state: (['sent', 'acknowledged', 'scheduled', 'skipped', 'blocked'].includes(String(x.state)) ? x.state : 'scheduled') as DetailReminder['state'],
  internal: Boolean(x.internal) || /^escalat/i.test(String(x.key ?? x.kind ?? '')),
});
const parseHistory = (x: Raw): DetailHistory => ({ at: String(x.at ?? x.when ?? ''), who: person(x.who ?? x.by) ?? 'SBC', what: String(x.what ?? x.action ?? '') });

async function getJson(url: string, fail: string): Promise<Raw> {
  const res = await fetch(url, { cache: 'no-store' });
  const data = (await res.json().catch(() => ({}))) as Raw;
  if (res.status === 404) throw Object.assign(new Error('not_found'), { status: 404 });
  if (!res.ok) throw new Error(String(data.error ?? fail));
  return data;
}

/* ------------------------------------------------------------------ hooks */

/** K-1: the tasks shared with the client. */
export function useClientTasks(enabled = true) {
  return useQuery({
    queryKey: TASK_KEY,
    enabled,
    queryFn: async (): Promise<ClientTask[]> => {
      const data = await getJson('/api/compliances/tasks', 'Could not load the tasks');
      // Not-applicable rows only come with includeNa=1; drop any that carry `hidden`.
      return arr(data.tasks, (x) => x)
        .filter((x) => !x.hidden)
        .map(parseTask);
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useClientTask(id: string, enabled = true) {
  return useQuery({
    queryKey: [...TASK_KEY, id],
    enabled: enabled && Boolean(id),
    retry: (n, e) => (e as { status?: number }).status !== 404 && n < 2,
    queryFn: async (): Promise<TaskDetail> => {
      const data = await getJson(`/api/compliances/tasks/${encodeURIComponent(id)}`, 'Could not load the task');
      const t = (data.task ?? data) as Raw;
      const can = (t.can ?? {}) as Raw;
      return {
        task: parseTask(t),
        stageLabel: s(t.stageLabel),
        word: s(t.word),
        checklist: arr(t.checklistItems, (x) => ({ id: String(x.id ?? x.label), label: String(x.label ?? ''), done: Boolean(x.done), at: day(x.doneAt), by: person(x.doneBy) })),
        attachments: arr(t.attachments, (x) => ({ id: String(x.id), fileName: String(x.fileName ?? 'File'), by: person(x.uploadedBy), at: String(x.uploadedAt ?? '') })),
        // D-4 and K-2: internal comments never show on the client page, even if one is sent.
        comments: arr(t.comments, (x) => ({ id: String(x.id ?? x.at), by: person(x.author) ?? 'SBC', at: String(x.at ?? ''), text: String(x.body ?? ''), internal: Boolean(x.internal) })).filter((c) => !c.internal),
        reminders: arr(t.reminders, parseReminder).filter((r) => !r.internal),
        history: arr(t.history, parseHistory),
        steps: arr(t.steps, parseStep),
        can: { comment: can.comment !== false, upload: can.upload !== false },
      };
    },
    staleTime: 30_000,
  });
}

/** C-3: the tasks shared with the client as calendar rows, on their end date. */
export function useTaskRows(enabled: boolean): CalRow[] {
  const tq = useClientTasks(enabled);
  return useMemo(() => (enabled ? (tq.data ?? []).map(taskAsRow) : []), [enabled, tq.data]);
}

/** D-2.3 to D-3 for one statutory period on the client page. */
export function useStatExtras(instanceId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...COMP_KEY, 'detail', instanceId],
    enabled: enabled && Boolean(instanceId),
    queryFn: async (): Promise<StatExtras> => {
      const data = await getJson(`/api/compliances/statutory/${encodeURIComponent(instanceId!)}`, 'Could not load the details');
      const d = (data.detail ?? data) as Raw;
      const rule = (d.rule ?? null) as Raw | null;
      const can = (d.can ?? {}) as Raw;
      return {
        stage: s(d.stage),
        stageLabel: s(d.stageLabel),
        word: s(d.word),
        daysToDue: d.daysToDue == null ? null : Number(d.daysToDue),
        owner: person(d.owner),
        // D-4: the confirm note is never read here, even if one is sent.
        rule: rule ? { dueRule: s(rule.dueRule), applies: s(rule.applies), penalty: s(rule.penalty), note: s(rule.note) } : null,
        reminders: arr(d.reminders, parseReminder).filter((r) => !r.internal),
        remindersBlockedBy: Array.isArray(d.remindersBlockedBy) ? (d.remindersBlockedBy as unknown[]).map(String) : [],
        history: arr(d.history, parseHistory),
        steps: arr(d.steps, parseStep),
        previous: arr(d.previous, (x) => ({ id: String(x.id), periodLabel: s(x.periodLabel), dueDate: day(x.dueDate) ?? '', filedOn: day(x.filedOn), late: x.late == null ? null : Boolean(x.late) })),
        canUpload: can.upload !== false,
      };
    },
    staleTime: 60_000,
  });
}

/** K-2: the client comments on a shared task. */
export function useTaskComment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch(`/api/compliances/tasks/${encodeURIComponent(id)}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      const data = (await res.json().catch(() => ({}))) as Raw;
      if (!res.ok) throw new Error(String(data.error ?? 'Could not add the comment'));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [...TASK_KEY, id] }),
  });
}

/** K-2: the client uploads files to a shared task, one POST per file. */
export function useTaskUpload(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]) => {
      const failed: string[] = [];
      for (const f of files) {
        const body = new FormData();
        body.append('file', f);
        const res = await fetch(`/api/compliances/tasks/${encodeURIComponent(id)}/attachments`, { method: 'POST', body }).catch(() => null);
        if (!res?.ok) failed.push(f.name);
      }
      return { done: files.length - failed.length, failed };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: TASK_KEY }),
  });
}

/** GET answers `{ url, fileName }`: a short-lived signed URL. */
export async function attachmentUrl(taskId: string, fileId: string): Promise<string> {
  const res = await fetch(`/api/compliances/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(fileId)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not open the file');
  return ((await res.json()) as { url: string }).url;
}
