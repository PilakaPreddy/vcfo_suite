'use client';

/**
 * Staff data for the statutory and non-statutory split: TanStack Query over the routes in
 * docs/ui-port/COMPLIANCE-API.md, and only those. Every route scopes by the caller's
 * `AuthContext` in its repository; an item out of scope reads as 404.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SubjectInputsDto } from '@/components/compliances/use-compliance-records';
import type { FilingProof } from '@/db/repositories/client-compliances';
import type { SixWord } from '@/lib/compliance/spectrum-status';
import type {
  TaskRepeats,
  TaskUrgency,
  TaskVisibility,
  WeekGroup,
  WorkflowStage,
} from '@/views/compliances/tasks/task-model';

export type Person = { id: string; name: string } | null;
export type ReminderKey = 'initial' | 'due-soon' | 'due-date' | 'overdue' | 'escalate-reviewer' | 'escalate-admin';

export interface ActivityDto {
  id: string;
  name: string;
  kind: 'Statutory' | 'Non-statutory' | 'Policy-based' | 'Configurable';
  group: 'statutory' | 'non-statutory';
  frequency: string;
  module: string;
  area: string;
  dueRule: string;
  penalty: string;
  applies: string;
  ownerRole: string;
  reviewerRole: string;
  notifyDays: number;
  visibility: TaskVisibility;
  note: string;
  confirm: string | null;
  confirmedAt: string | null;
  from: 'master' | 'manual';
}

export interface ReminderRowDto {
  key: ReminderKey;
  label: string;
  to: string;
  offsetDays: number;
  date: string;
  enabled: boolean;
  overridden: boolean;
  state: 'scheduled' | 'sent' | 'acknowledged' | 'skipped' | 'blocked';
  sentAt: string | null;
  internal: boolean;
}

export interface StepDto {
  key: string;
  label: string;
  state: 'done' | 'now' | 'next';
  who: string | null;
  when: string | null;
  evidence: string | null;
}

export interface HistoryDto {
  at: string;
  who: string | null;
  what: string;
  side?: 'client' | 'sbc';
}

export interface TaskRowDto {
  id: string;
  engagementId: string;
  companyName: string;
  activityId: string | null;
  activityName: string | null;
  name: string;
  periodLabel: string | null;
  title: string;
  startDate: string;
  dueDate: string;
  urgency: TaskUrgency;
  urgencyBars: 1 | 2 | 3 | 4;
  visibility: TaskVisibility;
  stage: WorkflowStage;
  stageLabel: string;
  word: SixWord;
  hidden: boolean;
  /** Set when the task stands for a board meeting. */
  boardMeetingId?: string | null;
  week: WeekGroup;
  daysToStart: number;
  daysToDue: number;
  owner: Person;
  reviewer: Person;
  repeats: TaskRepeats;
  remindBefore: number;
  checklist: { done: number; total: number };
  attachmentCount: number;
  deliverable: { id: string; fileName: string } | null;
  completedAt: string | null;
  createdBy: Person;
  createdAt: string;
}

export interface TaskDetailDto extends TaskRowDto {
  activity: ActivityDto | null;
  checklistItems: Array<{ id: string; label: string; done: boolean; doneBy: Person; doneAt: string | null }>;
  attachments: Array<{
    id: string;
    fileName: string;
    mime: string | null;
    sizeBytes: number | null;
    uploadedBy: Person;
    uploadedAt: string;
    deliverable: boolean;
    byClient: boolean;
  }>;
  comments: Array<{ id: string; author: Person; authorRole: string; body: string; internal: boolean; at: string }>;
  reminders: ReminderRowDto[];
  /** DR-22 gaps that hold the reminders back; [] when they are live. */
  remindersBlockedBy?: string[];
  history: HistoryDto[];
  steps: StepDto[];
  reviewNote: string | null;
  can: { edit: boolean; changeStage: boolean; submit: boolean; review: boolean; tick: boolean; comment: boolean; upload: boolean };
}

export interface StatutoryDetailDto {
  id: string;
  engagementId: string;
  companyName: string;
  obligationId: string;
  name: string;
  periodLabel: string | null;
  fyLabel: string | null;
  title: string;
  area: string;
  authority: string;
  frequency: string;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string;
  filedOn: string | null;
  window: { from: string; to: string } | null;
  visibility: 'both';
  stage: WorkflowStage;
  stageLabel: string;
  word: SixWord;
  daysToDue: number;
  owner: Person;
  reviewer: Person;
  primaryAction: 'submit' | 'approve' | 'upload' | null;
  activity: ActivityDto | null;
  clientInputs: SubjectInputsDto | null;
  filledBySbc: {
    fields: Array<{ key: string; label: string; value: string | null }>;
    acknowledgementNo: string | null;
    amountPaid: string | null;
    filedBy: string | null;
    dataReceivedOn: string | null;
    preparingSince: string | null;
    approvedOn: string | null;
    locked: boolean;
  };
  proofs: FilingProof[];
  reminders: ReminderRowDto[];
  remindersBlockedBy: string[];
  rule: { dueRule: string; applies: string; penalty: string; note: string | null; confirm: string | null };
  history: HistoryDto[];
  steps: StepDto[];
  checklist: Array<{ itemKey: string; checkedBy: string | null; checkedAt: string }>;
  assistRuns: Array<{ id: string; form: string | null; state: string; reference: string | null; startedAt: string; finishedAt: string | null }>;
  previous: Array<{ id: string; periodLabel: string | null; dueDate: string; filedOn: string | null; late: boolean | null }>;
  reviewNote: string | null;
  can: { submit: boolean; approve: boolean; sendBack: boolean; assign: boolean; editReminders: boolean; upload: boolean };
}

export interface TaskDefaultsDto {
  owner: Person;
  reviewer: Person;
  owners: Array<{ id: string; name: string }>;
  reviewers: Array<{ id: string; name: string }>;
  activities: Array<{ id: string; name: string; notifyDays: number; repeats: TaskRepeats; visibility: TaskVisibility }>;
}

export interface CreateTaskBody {
  engagementId: string;
  activityId: string | null;
  name?: string;
  startDate: string;
  dueDate: string;
  urgency: TaskUrgency;
  visibility: TaskVisibility;
  ownerId?: string | null;
  reviewerId?: string | null;
  repeats: TaskRepeats;
  remindBefore?: number;
  checklist?: string[];
}

export interface RemindersDto {
  notifyDays: number;
  rows: ReminderRowDto[];
  blockedBy: string[];
  editable: boolean;
}

/** Plain messages for the error codes the routes return. */
const ERROR_TEXT: Record<string, string> = {
  invalid_body: 'Check the fields and try again',
  end_before_start: 'End on or after the start',
  name_required: 'Give the task a name',
  unknown_activity: 'Pick an activity from the list',
  statutory_is_both: 'A statutory activity is visible to both',
  owner_not_staff: 'Pick an owner from the team',
  not_in_review: 'This item is not in review',
  filed: 'This filing is already filed',
  forbidden: 'You cannot make this change',
  not_found: 'Not found',
  invalid_stage: 'That stage is not allowed here',
  invalid_date: 'Use a real date',
  note_required: 'Say what should change',
  invalid_days: 'Use a number of days the schedule allows',
  file_required: 'Choose a file',
  file_size: 'The file is larger than 15 MB',
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function readJson<T>(res: Response, what: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const code = body.error;
    throw new ApiError((code && ERROR_TEXT[code]) || `Could not load ${what}`, res.status, code);
  }
  return body;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const TASKS_KEY = ['compliance-tasks'] as const;
const STAT_KEY = ['compliance-statutory'] as const;

/* ------------------------------------------------------------------ activities */

export function useActivities(group?: 'statutory' | 'non-statutory') {
  return useQuery({
    queryKey: ['compliance-activities', group ?? 'all'],
    queryFn: async () =>
      (await readJson<{ activities: ActivityDto[] }>(await fetch(`/api/compliances/activities${group ? `?group=${group}` : ''}`), 'the activities')).activities,
    staleTime: 5 * 60_000,
  });
}

export interface ActivityPatchBody {
  notifyDays?: number;
  ownerRole?: string;
  reviewerRole?: string;
  visibility?: TaskVisibility;
  confirmed?: boolean;
}

/** X-23: admin and super admin edit one activity (`PATCH /api/compliances/activities/:id`). */
export function useUpdateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: ActivityPatchBody }) =>
      (
        await readJson<{ activity: ActivityDto }>(
          await fetch(`/api/compliances/activities/${encodeURIComponent(id)}`, json('PATCH', body)),
          'the activity',
        )
      ).activity,
    onSettled: () => qc.invalidateQueries({ queryKey: ['compliance-activities'] }),
  });
}

/* ------------------------------------------------------------------ tasks */

export interface TaskQuery {
  engagementId?: string;
  from?: string;
  to?: string;
  done?: boolean;
  includeNa?: boolean;
}

function taskQueryString(q: TaskQuery): string {
  const p = new URLSearchParams();
  if (q.engagementId) p.set('engagementId', q.engagementId);
  if (q.from) p.set('from', q.from);
  if (q.to) p.set('to', q.to);
  if (q.done !== undefined) p.set('done', q.done ? '1' : '0');
  if (q.includeNa) p.set('includeNa', '1');
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function useTasks(q: TaskQuery = {}, enabled = true) {
  return useQuery({
    queryKey: [...TASKS_KEY, 'list', q.engagementId ?? 'scope', q.from ?? '', q.to ?? '', q.done ?? 'any', q.includeNa ? 'na' : ''],
    enabled,
    queryFn: async () => readJson<{ tasks: TaskRowDto[]; today: string }>(await fetch(`/api/compliances/tasks${taskQueryString(q)}`), 'the tasks'),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useTaskDefaults(engagementId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: [...TASKS_KEY, 'defaults', engagementId ?? ''],
    enabled: enabled && Boolean(engagementId),
    queryFn: async () =>
      readJson<TaskDefaultsDto>(await fetch(`/api/compliances/tasks/defaults?engagementId=${encodeURIComponent(engagementId ?? '')}`), 'the task defaults'),
    staleTime: 60_000,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateTaskBody) =>
      (await readJson<{ task: TaskDetailDto }>(await fetch('/api/compliances/tasks', json('POST', body)), 'the task')).task,
    onSettled: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: [...TASKS_KEY, 'one', id],
    queryFn: async () => (await readJson<{ task: TaskDetailDto }>(await fetch(`/api/compliances/tasks/${encodeURIComponent(id)}`), 'the task')).task,
    retry: (n, e) => !(e instanceof ApiError && (e.status === 404 || e.status === 403)) && n < 2,
  });
}

/** Every write on one task. Each returns the fresh task and puts it in the cache. */
export function useTaskActions(id: string) {
  const qc = useQueryClient();
  const base = `/api/compliances/tasks/${encodeURIComponent(id)}`;
  const put = (task: TaskDetailDto) => qc.setQueryData([...TASKS_KEY, 'one', id], task);
  const refresh = () => qc.invalidateQueries({ queryKey: TASKS_KEY });
  const settled = { onSettled: refresh };

  const stage = useMutation({
    mutationFn: async (s: WorkflowStage) => (await readJson<{ task: TaskDetailDto }>(await fetch(base, json('PATCH', { action: 'stage', stage: s })), 'the task')).task,
    onSuccess: put,
    ...settled,
  });
  const review = useMutation({
    mutationFn: async (b: { decision: 'approve' | 'send-back'; note?: string }) =>
      (await readJson<{ task: TaskDetailDto }>(await fetch(`${base}/review`, json('POST', b)), 'the review')).task,
    onSuccess: put,
    ...settled,
  });
  const tick = useMutation({
    mutationFn: async (b: { itemId: string; done: boolean }) =>
      readJson<{ item: unknown }>(await fetch(`${base}/checklist/${encodeURIComponent(b.itemId)}`, json('PATCH', { done: b.done })), 'the checklist'),
    ...settled,
  });
  const addItem = useMutation({
    mutationFn: async (label: string) => readJson<{ item: unknown }>(await fetch(`${base}/checklist`, json('POST', { label })), 'the checklist'),
    ...settled,
  });
  const comment = useMutation({
    mutationFn: async (b: { body: string; internal: boolean }) => readJson<{ comment: unknown }>(await fetch(`${base}/comments`, json('POST', b)), 'the comment'),
    ...settled,
  });
  const upload = useMutation({
    mutationFn: async (b: { file: File; deliverable?: boolean }) => {
      const form = new FormData();
      form.set('file', b.file);
      if (b.deliverable) form.set('deliverable', '1');
      return readJson<{ attachment: unknown }>(await fetch(`${base}/attachments`, { method: 'POST', body: form }), 'the file');
    },
    ...settled,
  });
  const edit = useMutation({
    mutationFn: async (b: TaskEditBody) => (await readJson<{ task: TaskDetailDto }>(await fetch(base, json('PATCH', { action: 'edit', ...b })), 'the task')).task,
    onSuccess: put,
    ...settled,
  });
  const removeItem = useMutation({
    mutationFn: async (itemId: string) =>
      readJson<{ ok: true }>(await fetch(`${base}/checklist/${encodeURIComponent(itemId)}`, { method: 'DELETE' }), 'the checklist'),
    ...settled,
  });
  const removeFile = useMutation({
    mutationFn: async (attachmentId: string) =>
      readJson<{ ok: true }>(await fetch(`${base}/attachments/${encodeURIComponent(attachmentId)}`, { method: 'DELETE' }), 'the file'),
    ...settled,
  });
  return { stage, review, tick, addItem, comment, upload, edit, removeItem, removeFile };
}

/**
 * A calendar drag on a non-statutory task (M6 G2): the new start and end dates through the
 * same edit route the task page uses (`PATCH /api/compliances/tasks/:id`, action "edit").
 */
export function useMoveTaskDates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (b: { id: string; startDate: string; dueDate: string }) =>
      (
        await readJson<{ task: TaskDetailDto }>(
          await fetch(`/api/compliances/tasks/${encodeURIComponent(b.id)}`, json('PATCH', { action: 'edit', startDate: b.startDate, dueDate: b.dueDate })),
          'the task',
        )
      ).task,
    onSettled: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

/** The fields an admin, super admin or manager may change after creation. */
export interface TaskEditBody {
  name?: string;
  startDate?: string;
  dueDate?: string;
  urgency?: TaskUrgency;
  visibility?: TaskVisibility;
  ownerId?: string | null;
  reviewerId?: string | null;
  repeats?: TaskRepeats;
  remindBefore?: number;
}

/** Open an attachment through its short-lived signed link. */
export async function openTaskAttachment(taskId: string, attachmentId: string): Promise<void> {
  const r = await readJson<{ url: string }>(
    await fetch(`/api/compliances/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}`),
    'the file',
  );
  window.open(r.url, '_blank', 'noopener');
}

/* ------------------------------------------------------------------ statutory */

export function useStatutory(instanceId: string) {
  return useQuery({
    queryKey: [...STAT_KEY, instanceId],
    queryFn: async () =>
      (await readJson<{ detail: StatutoryDetailDto }>(await fetch(`/api/compliances/statutory/${encodeURIComponent(instanceId)}`), 'the filing')).detail,
    retry: (n, e) => !(e instanceof ApiError && (e.status === 404 || e.status === 403)) && n < 2,
  });
}

export type StatutoryAction =
  | { action: 'submit' }
  | { action: 'approve' }
  | { action: 'send-back'; note: string }
  | { action: 'stage'; stage: WorkflowStage }
  | { action: 'assign'; ownerId?: string | null; reviewerId?: string | null };

export function useStatutoryAction(instanceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: StatutoryAction) =>
      (
        await readJson<{ detail: StatutoryDetailDto }>(
          await fetch(`/api/compliances/statutory/${encodeURIComponent(instanceId)}`, json('PATCH', body)),
          'the filing',
        )
      ).detail,
    onSuccess: (d) => qc.setQueryData([...STAT_KEY, instanceId], d),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: STAT_KEY });
      void qc.invalidateQueries({ queryKey: ['filings'] });
      void qc.invalidateQueries({ queryKey: ['filing-events'] });
    },
  });
}

/* ------------------------------------------------------------------ reminders */

export interface ReminderRowOverride {
  key: ReminderKey;
  /** Days from the due date (negative = before); null drops the override of the offset. */
  offsetDays?: number | null;
  enabled?: boolean;
}

/** `PUT /api/compliances/reminders`: the first-reminder days, per-row overrides, or a reset. */
export function useSetReminderDays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (b: { kind: 'statutory' | 'task'; id: string; notifyDays?: number; rows?: ReminderRowOverride[]; reset?: boolean }) =>
      readJson<RemindersDto>(await fetch('/api/compliances/reminders', json('PUT', b)), 'the reminders'),
    onSettled: (_d, _e, b) => qc.invalidateQueries({ queryKey: b.kind === 'task' ? TASKS_KEY : STAT_KEY }),
  });
}
