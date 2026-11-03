/**
 * The statutory and non-statutory compliance model (prototype docs/COMPLIANCE-MODEL.md sections 3.3
 * and 3.4; docs/ui-port/COMPLIANCE-API.md). PURE: no db, no env, no clock except the `today`
 * argument. Dates are 'YYYY-MM-DD' strings in India time, compared as UTC midnights.
 */

const STAGES = [
  'not-started',
  'ready',
  'in-progress',
  'waiting',
  'review',
  'rework',
  'completed',
  'not-applicable',
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  'not-started': 'Not started',
  ready: 'Ready to start',
  'in-progress': 'In progress',
  waiting: 'Waiting for client',
  review: 'Submitted for review',
  rework: 'Rework required',
  completed: 'Completed',
  'not-applicable': 'Not applicable',
};

export function isStage(value: unknown): value is Stage {
  return typeof value === 'string' && (STAGES as readonly string[]).includes(value);
}

/** The six status words of R-13. */
export type StatusWord = 'Not started' | 'In progress' | 'Waiting' | 'Due soon' | 'Overdue' | 'Done';

const STAGE_WORD: Record<Stage, StatusWord> = {
  'not-started': 'Not started',
  ready: 'Not started',
  'in-progress': 'In progress',
  review: 'In progress',
  rework: 'In progress',
  waiting: 'Waiting',
  completed: 'Done',
  'not-applicable': 'Not started',
};

const URGENCIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export type Urgency = (typeof URGENCIES)[number];
export const URGENCY_BARS: Record<Urgency, 1 | 2 | 3 | 4> = { Low: 1, Medium: 2, High: 3, Critical: 4 };

const VISIBILITIES = ['firm', 'client', 'both'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const REPEATS = ['one-time', 'weekly', 'bi-weekly', 'monthly', 'quarterly', 'yearly'] as const;
export type Repeats = (typeof REPEATS)[number];

export type WeekGroup = 'This week' | 'Next week' | 'Later' | 'Done';

const DAY = 86_400_000;

function D(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}
function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDaysIso(iso: string, n: number): string {
  return isoOf(new Date(D(iso).getTime() + n * DAY));
}
export function daysBetweenIso(fromIso: string, toIso: string): number {
  return Math.round((D(toIso).getTime() - D(fromIso).getTime()) / DAY);
}
/** Add whole months, keeping the day but clamping to the month's last day (31 Jan + 1 = 28 Feb). */
export function addMonthsIso(iso: string, n: number): string {
  const d = D(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return isoOf(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last))));
}

/** The chip word: Overdue and Due soon come from the due date; the rest from the stage. */
export function statusWord(stage: Stage, dueDate: string, notifyDays: number, today: string): StatusWord {
  if (stage === 'completed') return 'Done';
  const n = daysBetweenIso(today, dueDate);
  if (n < 0) return 'Overdue';
  if (n <= notifyDays && (stage === 'not-started' || stage === 'ready')) return 'Due soon';
  return STAGE_WORD[stage];
}

/** S-3: the end-date week a row sits in. Weeks start on Monday. */
export function weekGroup(stage: Stage, dueDate: string, today: string): WeekGroup {
  if (stage === 'completed') return 'Done';
  const dow = (D(today).getUTCDay() + 6) % 7;
  const monday = addDaysIso(today, -dow);
  const n = daysBetweenIso(monday, dueDate);
  return n < 7 ? 'This week' : n < 14 ? 'Next week' : 'Later';
}

/** The repeat a new task gets from its activity's frequency. */
export function repeatsOfFrequency(frequency: string | null | undefined): Repeats {
  switch ((frequency ?? '').toLowerCase()) {
    case 'weekly':
      return 'weekly';
    case 'bi-weekly':
      return 'bi-weekly';
    case 'monthly':
      return 'monthly';
    case 'quarterly':
      return 'quarterly';
    case 'yearly':
      return 'yearly';
    default:
      return 'one-time';
  }
}

/** DR-04: the dates of the next occurrence, or null for a one-time task. */
export function nextOccurrence(
  t: { startDate: string; dueDate: string; repeats: Repeats },
): { startDate: string; dueDate: string } | null {
  switch (t.repeats) {
    case 'weekly':
      return { startDate: addDaysIso(t.startDate, 7), dueDate: addDaysIso(t.dueDate, 7) };
    case 'bi-weekly':
      return { startDate: addDaysIso(t.startDate, 14), dueDate: addDaysIso(t.dueDate, 14) };
    case 'monthly':
      return { startDate: addMonthsIso(t.startDate, 1), dueDate: addMonthsIso(t.dueDate, 1) };
    case 'quarterly':
      return { startDate: addMonthsIso(t.startDate, 3), dueDate: addMonthsIso(t.dueDate, 3) };
    case 'yearly':
      return { startDate: addMonthsIso(t.startDate, 12), dueDate: addMonthsIso(t.dueDate, 12) };
    default:
      return null;
  }
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The period a repeating task covers, from its start date; null for a one-time task. */
export function periodLabelFor(repeats: Repeats, startDate: string): string | null {
  const d = D(startDate);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (repeats) {
    case 'weekly':
    case 'bi-weekly':
      return `Week of ${d.getUTCDate()} ${MON[m]}`;
    case 'monthly':
      return `${MON[m]} ${y}`;
    case 'quarterly': {
      const fy = m >= 3 ? y : y - 1;
      const q = Math.floor(((m + 9) % 12) / 3) + 1;
      return `Q${q} ${fy}-${String(fy + 1).slice(2)}`;
    }
    case 'yearly': {
      const fy = m >= 3 ? y : y - 1;
      return `FY ${fy}-${String(fy + 1).slice(2)}`;
    }
    default:
      return null;
  }
}

/** The Indian financial year that contains `today`: 1 Apr to 31 Mar. */
export function currentFyRange(today: string): { from: string; to: string } {
  const d = D(today);
  const fy = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return { from: `${fy}-04-01`, to: `${fy + 1}-03-31` };
}

/* ---------------------------------------------------------------- reminders (3.4) */

const REMINDER_KEYS = ['initial', 'due-soon', 'due-date', 'overdue', 'escalate-reviewer', 'escalate-admin'] as const;
export type ReminderKey = (typeof REMINDER_KEYS)[number];

export type ReminderAudience = 'owner' | 'owner-reviewer' | 'reviewer' | 'admin';

export interface ReminderRule {
  key: ReminderKey;
  label: string;
  to: string;
  audience: ReminderAudience;
  internal: boolean;
  defaultOffset: (notifyDays: number) => number;
}

export const REMINDER_RULES: ReminderRule[] = [
  { key: 'initial', label: 'First reminder', to: 'Owner', audience: 'owner', internal: false, defaultOffset: (n) => -n },
  {
    key: 'due-soon',
    label: 'Due soon',
    to: 'Owner and reviewer',
    audience: 'owner-reviewer',
    internal: false,
    defaultOffset: (n) => -Math.max(1, Math.round(n / 3)),
  },
  { key: 'due-date', label: 'Due today', to: 'Owner and reviewer', audience: 'owner-reviewer', internal: false, defaultOffset: () => 0 },
  { key: 'overdue', label: 'Overdue, daily', to: 'Owner', audience: 'owner', internal: false, defaultOffset: () => 1 },
  { key: 'escalate-reviewer', label: 'Escalation', to: 'Reviewer or manager', audience: 'reviewer', internal: true, defaultOffset: () => 2 },
  { key: 'escalate-admin', label: 'Escalation', to: 'Compliance admin', audience: 'admin', internal: true, defaultOffset: () => 5 },
];

export function isReminderKey(value: unknown): value is ReminderKey {
  return typeof value === 'string' && (REMINDER_KEYS as readonly string[]).includes(value);
}

/** The daily overdue reminder stops this many days after the due date, so old rows never flood the bell. */
export const OVERDUE_DAILY_LIMIT = 30;

export interface ReminderOverride {
  key: ReminderKey;
  offsetDays: number | null;
  enabled: boolean;
}

export interface ReminderSend {
  key: ReminderKey;
  sentAt: string;
  read: boolean;
}

export interface ReminderRowOut {
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

/** The six rows of one item, with what was sent. Sends are newest first. */
export function reminderSchedule(input: {
  dueDate: string;
  notifyDays: number;
  overrides: ReminderOverride[];
  sends: ReminderSend[];
  done: boolean;
  blocked: boolean;
}): ReminderRowOut[] {
  const byKey = new Map(input.overrides.map((o) => [o.key, o]));
  return REMINDER_RULES.map((rule) => {
    const o = byKey.get(rule.key);
    const offsetDays = o?.offsetDays ?? rule.defaultOffset(input.notifyDays);
    const enabled = o ? o.enabled : true;
    const sends = input.sends.filter((s) => s.key === rule.key);
    const last = sends[0] ?? null;
    let state: ReminderRowOut['state'];
    if (last) state = sends.some((s) => s.read) ? 'acknowledged' : 'sent';
    else if (input.done && offsetDays > 0) state = 'skipped';
    else if (input.blocked) state = 'blocked';
    else state = 'scheduled';
    return {
      key: rule.key,
      label: rule.label,
      to: rule.to,
      offsetDays,
      date: addDaysIso(input.dueDate, offsetDays),
      enabled,
      overridden: Boolean(o),
      state,
      sentAt: last?.sentAt ?? null,
      internal: rule.internal,
    };
  });
}

/**
 * The reminders that go out today for one open item. Each fires on its own date; the overdue
 * reminder fires on every day from its date until OVERDUE_DAILY_LIMIT days after the due date.
 */
export function remindersDueToday(rows: Array<Pick<ReminderRowOut, 'key' | 'date' | 'enabled'>>, dueDate: string, today: string): ReminderKey[] {
  const out: ReminderKey[] = [];
  for (const r of rows) {
    if (!r.enabled) continue;
    if (r.key === 'overdue') {
      if (today >= r.date && daysBetweenIso(dueDate, today) <= OVERDUE_DAILY_LIMIT && today > dueDate) out.push(r.key);
    } else if (r.date === today) {
      out.push(r.key);
    }
  }
  return out;
}

/** DR-22: what is missing before reminders may go out. Empty means live. */
export function reminderBlockers(input: {
  engagementId: string | null;
  stage: Stage;
  ownerId: string | null;
  prepDate: string | null;
  dueDate: string | null;
  confirmPending: boolean;
}): string[] {
  const out: string[] = [];
  if (!input.engagementId) out.push('entity');
  if (input.stage === 'not-applicable') out.push('not applicable');
  if (!input.ownerId) out.push('owner');
  if (!input.prepDate) out.push('preparation date');
  if (!input.dueDate) out.push('due date');
  if (input.confirmPending) out.push('activity not confirmed');
  return out;
}

/** The stage of a statutory instance with no workflow row, from the register status. */
export function stageFromRegister(status: string | null | undefined, filedOn: string | null | undefined): Stage {
  if (filedOn || status === 'filed') return 'completed';
  if (status === 'in-progress') return 'in-progress';
  return 'not-started';
}

/* ---------------------------------------------------------------- progress steps */

export interface StepOut {
  key: string;
  label: string;
  state: 'done' | 'now' | 'next';
  who: string | null;
  when: string | null;
  evidence: string | null;
}

/** Mark the first not-done step "now" (unless every step is done). */
function withNow(steps: Array<Omit<StepOut, 'state'> & { done: boolean }>): StepOut[] {
  let nowSet = false;
  return steps.map(({ done, ...s }) => {
    if (done) return { ...s, state: 'done' };
    if (!nowSet) {
      nowSet = true;
      return { ...s, state: 'now' };
    }
    return { ...s, state: 'next' };
  });
}

/** 4.3: Created → Inputs ready → Work done → Submitted for review → Approved. */
export function taskSteps(t: {
  stage: Stage;
  createdBy: string | null;
  createdAt: string;
  owner: string | null;
  reviewer: string | null;
  checklistDone: number;
  checklistTotal: number;
  submittedAt: string | null;
  completedAt: string | null;
  approvedBy: string | null;
  firstAttachment: string | null;
}): StepOut[] {
  const s = t.stage;
  const past = (list: Stage[]) => list.includes(s);
  const inputsReady = past(['in-progress', 'review', 'rework', 'completed']);
  const workDone = past(['review', 'completed']) || (t.checklistTotal > 0 && t.checklistDone === t.checklistTotal && s !== 'waiting');
  return withNow([
    { key: 'created', label: 'Created', done: true, who: t.createdBy, when: t.createdAt, evidence: null },
    { key: 'inputs', label: 'Inputs ready', done: inputsReady, who: t.owner, when: null, evidence: null },
    {
      key: 'work',
      label: 'Work done',
      done: workDone,
      who: t.owner,
      when: null,
      evidence: t.checklistTotal > 0 ? `${t.checklistDone} of ${t.checklistTotal} checklist items` : t.firstAttachment,
    },
    { key: 'submitted', label: 'Submitted for review', done: past(['review', 'completed']), who: t.owner, when: t.submittedAt, evidence: null },
    { key: 'approved', label: 'Approved', done: s === 'completed', who: t.approvedBy ?? t.reviewer, when: t.completedAt, evidence: null },
  ]);
}

/** D-3: Data from client → Prepared → Submitted for review → Approved → Filed or paid → Acknowledged. */
export function statutorySteps(x: {
  stage: Stage;
  clientShort: string | null;
  owner: string | null;
  reviewer: string | null;
  authority: string | null;
  docsAsked: number;
  docsAccepted: number;
  dataReceivedOn: string | null;
  preparingSince: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  approvedOn: string | null;
  filedOn: string | null;
  filedBy: string | null;
  challan: string | null;
  acknowledgementNo: string | null;
  ackProof: string | null;
}): StepOut[] {
  const filed = Boolean(x.filedOn);
  const dataDone = Boolean(x.dataReceivedOn) || (x.docsAsked > 0 && x.docsAccepted === x.docsAsked) || filed;
  const prepared = Boolean(x.preparingSince) && (['review', 'completed'].includes(x.stage) || Boolean(x.approvedOn) || filed);
  const submitted = Boolean(x.submittedAt) || Boolean(x.approvedOn) || filed;
  return withNow([
    {
      key: 'data',
      label: 'Data from client',
      done: dataDone,
      who: x.clientShort,
      when: x.dataReceivedOn,
      evidence: x.docsAsked > 0 ? `${x.docsAccepted} of ${x.docsAsked} accepted` : null,
    },
    {
      key: 'prepared',
      label: 'Prepared',
      done: prepared || submitted,
      who: x.owner,
      when: x.preparingSince,
      evidence: null,
    },
    { key: 'submitted', label: 'Submitted for review', done: submitted, who: x.submittedBy ?? x.owner, when: x.submittedAt, evidence: null },
    { key: 'approved', label: 'Approved', done: Boolean(x.approvedOn) || filed, who: x.reviewer, when: x.approvedOn, evidence: null },
    { key: 'filed', label: 'Filed or paid', done: filed, who: x.filedBy ?? x.owner, when: x.filedOn, evidence: x.challan },
    {
      key: 'acknowledged',
      label: 'Acknowledged',
      done: filed && Boolean(x.acknowledgementNo || x.ackProof),
      who: x.authority,
      when: filed ? x.filedOn : null,
      evidence: x.acknowledgementNo ?? x.ackProof,
    },
  ]);
}
