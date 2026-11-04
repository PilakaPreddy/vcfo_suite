import { addDays, D, daysBetween, fmtDM, todayIso } from '@/lib/client-portal/compliances';

/**
 * WEEKLY DIGEST — the pure half of the Monday summary (`notification_prefs.email.weeklyDigest`).
 *
 * No db and no React. `collect-weekly-digest.ts` reads one person's week through the scoped
 * repositories and hands the rows to the section builders here; `weekly-digest-email.ts` turns
 * the sections into the email. A digest whose every section is empty is not sent.
 *
 * Dates are India time, the same as the rest of the app: "today" is the IST calendar day and a
 * week runs from Monday 00:00 IST to the next Monday 00:00 IST.
 */

export type DigestAudience = 'client' | 'intern' | 'manager' | 'admin' | 'super_admin';

export interface DigestItem {
  /** Stable id inside its section (for tests and de-duplication). */
  id: string;
  title: string;
  /** Second part of the line, usually the company. */
  detail?: string;
  /** `YYYY-MM-DD`; printed as "14 Oct". */
  date?: string;
  /** How to read the date: "due 14 Oct", "since 14 Oct", "14 Oct". */
  dateLabel?: 'due' | 'since' | 'on';
  /** App path (made absolute by the email builder). */
  href?: string;
}

export type DigestSectionKey = 'overdue' | 'due' | 'needs' | 'changes' | 'waiting' | 'stuck';

export interface DigestSection {
  key: DigestSectionKey;
  title: string;
  /** Short count for the subject line ("2 overdue"). */
  countLabel: (n: number) => string;
  items: DigestItem[];
  /** Where the section's link goes. */
  href: string;
  linkLabel: string;
}

export interface WeeklyDigest {
  audience: DigestAudience;
  recipientName: string;
  week: DigestWeek;
  sections: DigestSection[];
  /** The person's own Settings page, for the "switch it off" line. */
  settingsHref: string;
}

/* ------------------------------------------------------------------ week */

export interface DigestWeek {
  /** ISO week, e.g. `2026-W45`: the idempotency key for one person's digest. */
  key: string;
  /** Monday of the week, `YYYY-MM-DD` (IST). */
  mondayIso: string;
  /** Monday 00:00 IST. */
  startsAt: Date;
  /** The next Monday 00:00 IST (exclusive). */
  endsAt: Date;
}

const WEEK_MS = 7 * 86_400_000;

/** The IST week `now` falls in, keyed by ISO week. */
export function digestWeek(now: Date): DigestWeek {
  const today = todayIso(now);
  const mondayIso = addDays(today, -((D(today).getUTCDay() + 6) % 7));
  // ISO 8601: the week belongs to the year of its Thursday.
  const thursday = addDays(mondayIso, 3);
  const year = Number(thursday.slice(0, 4));
  const week = Math.floor(daysBetween(`${year}-01-01`, thursday) / 7) + 1;
  const startsAt = new Date(`${mondayIso}T00:00:00+05:30`);
  return {
    key: `${year}-W${String(week).padStart(2, '0')}`,
    mondayIso,
    startsAt,
    endsAt: new Date(startsAt.getTime() + WEEK_MS),
  };
}

/** The IST calendar day of an ISO timestamp, or `null` when it does not parse. */
function istDayOf(at: string | null | undefined): string | null {
  if (!at) return null;
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) return null;
  return todayIso(new Date(ms));
}

/** "14 Oct" for a `YYYY-MM-DD` day. */
export function digestDate(iso: string): string {
  return fmtDM(iso);
}

/* -------------------------------------------------------------- inputs */

/** A filing, as `getPortalFilings` returns it (only the fields the digest prints). */
export interface DigestFilingInput {
  id: string;
  name: string;
  period?: string | null;
  companyName: string;
  dueDate: string;
  filedOn?: string | null;
}

function filingTitle(f: DigestFilingInput): string {
  const period = f.period?.trim();
  return period && period !== '—' ? `${f.name} · ${period}` : f.name;
}

function isOpenFiling(f: DigestFilingInput): boolean {
  return !f.filedOn && Boolean(f.dueDate);
}

const byDate = (a: DigestItem, b: DigestItem) =>
  (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.title.localeCompare(b.title);
const byDateDesc = (a: DigestItem, b: DigestItem) => (b.date ?? '').localeCompare(a.date ?? '');

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/* -------------------------------------------------------------- client */

export interface ClientDigestInput {
  today: string;
  filings: DigestFilingInput[];
  /** Open document requests (Home "needs"). */
  needs: Array<{ id: string; title: string; companyName: string; dueDate?: string | null }>;
  /** Client-safe activity rows (Home "activity"). */
  activity: Array<{ id: string; label: string; at: string; actorName: string; companyName: string; action?: string }>;
}

/** How far ahead a client's digest looks for filings. */
const CLIENT_DUE_DAYS = 14;

export const CLIENT_PATHS = {
  home: '/app/client',
  filings: '/app/client/compliances/filings',
  documents: '/app/client/documents',
  settings: '/app/client/settings',
} as const;

export function clientDigestSections(input: ClientDigestInput): DigestSection[] {
  const { today } = input;
  const horizon = addDays(today, CLIENT_DUE_DAYS);
  const weekAgo = addDays(today, -7);
  const open = input.filings.filter(isOpenFiling);

  const toItem = (f: DigestFilingInput): DigestItem => ({
    id: f.id,
    title: filingTitle(f),
    detail: f.companyName,
    date: f.dueDate,
    dateLabel: 'due',
    href: CLIENT_PATHS.filings,
  });

  return [
    {
      key: 'overdue',
      title: 'Overdue filings',
      countLabel: (n) => `${n} overdue`,
      items: open.filter((f) => f.dueDate < today).map(toItem).sort(byDate),
      href: CLIENT_PATHS.filings,
      linkLabel: 'Open filings',
    },
    {
      key: 'due',
      title: `Due in the next ${CLIENT_DUE_DAYS} days`,
      countLabel: (n) => `${n} due soon`,
      items: open.filter((f) => f.dueDate >= today && f.dueDate <= horizon).map(toItem).sort(byDate),
      href: CLIENT_PATHS.filings,
      linkLabel: 'Open filings',
    },
    {
      key: 'needs',
      title: 'Documents we need from you',
      countLabel: (n) => plural(n, 'document needed', 'documents needed'),
      items: input.needs
        .map((n) => ({
          id: n.id,
          title: n.title,
          detail: n.companyName,
          date: n.dueDate ?? undefined,
          dateLabel: 'due' as const,
          href: CLIENT_PATHS.documents,
        }))
        .sort(byDate),
      href: CLIENT_PATHS.documents,
      linkLabel: 'Open documents',
    },
    {
      key: 'changes',
      title: 'What changed last week',
      countLabel: (n) => plural(n, 'change'),
      items: input.activity
        // The overdue rows are derived on Home; the digest already lists them above.
        .filter((a) => a.action !== 'system.compliance_overdue')
        .map((a) => ({ a, day: istDayOf(a.at) }))
        .filter(({ day }) => day !== null && day >= weekAgo && day < today)
        .map(({ a, day }) => ({
          id: a.id,
          title: a.label,
          detail: a.actorName ? `${a.actorName} · ${a.companyName}` : a.companyName,
          date: day!,
          dateLabel: 'on' as const,
          href: CLIENT_PATHS.home,
        }))
        .sort(byDateDesc),
      href: CLIENT_PATHS.home,
      linkLabel: 'Open your home page',
    },
  ];
}

/* ------------------------------------------------------- lead / manager */

export interface StaffDigestInput {
  today: string;
  filings: DigestFilingInput[];
  /** Checklist steps in scope with the status the viewer may see. */
  steps: Array<{ id: string; title: string; companyName: string; status: string; href: string }>;
  /** Assigned tasks (no checklist key) in scope. */
  tasks: Array<{ id: string; title: string; companyName: string; status: string; dueAt?: string | null }>;
  /** Document requests in scope. */
  requests: Array<{ id: string; label: string; companyName: string; status: string }>;
}

export function staffPaths(role: 'intern' | 'manager') {
  if (role === 'intern') {
    return {
      work: '/app/intern/today',
      filings: '/app/intern/compliances/filings',
      waiting: '/app/intern/requests',
      settings: '/app/intern/settings',
    };
  }
  return {
    work: '/app/manager/dashboard',
    filings: '/app/manager/compliances/filings',
    waiting: '/app/manager/projects',
    settings: '/app/manager/settings',
  };
}

const CLOSED_TASK = new Set(['completed', 'not-applicable']);

export function staffDigestSections(role: 'intern' | 'manager', input: StaffDigestInput): DigestSection[] {
  const { today } = input;
  const weekEnd = addDays(today, 6);
  const paths = staffPaths(role);
  const open = input.filings.filter(isOpenFiling);
  const openTasks = input.tasks
    .map((t) => ({ ...t, due: t.dueAt ? istDayOf(t.dueAt.length === 10 ? `${t.dueAt}T12:00:00+05:30` : t.dueAt) : null }))
    .filter((t) => !CLOSED_TASK.has(t.status) && t.due);

  const filingItem = (f: DigestFilingInput): DigestItem => ({
    id: `filing:${f.id}`,
    title: filingTitle(f),
    detail: f.companyName,
    date: f.dueDate,
    dateLabel: 'due',
    href: paths.filings,
  });
  const taskItem = (t: (typeof openTasks)[number]): DigestItem => ({
    id: `task:${t.id}`,
    title: t.title,
    detail: t.companyName,
    date: t.due!,
    dateLabel: 'due',
    href: paths.work,
  });

  const overdue: DigestItem[] = [
    ...open.filter((f) => f.dueDate < today).map(filingItem),
    ...input.steps
      .filter((s) => s.status === 'overdue')
      .map((s) => ({ id: `step:${s.id}`, title: s.title, detail: s.companyName, href: s.href })),
    ...openTasks.filter((t) => t.due! < today).map(taskItem),
  ].sort(byDate);

  const due: DigestItem[] = [
    ...open.filter((f) => f.dueDate >= today && f.dueDate <= weekEnd).map(filingItem),
    ...openTasks.filter((t) => t.due! >= today && t.due! <= weekEnd).map(taskItem),
  ].sort(byDate);

  const waiting: DigestItem[] = [
    ...input.steps
      .filter((s) => s.status === 'awaiting-client')
      .map((s) => ({ id: `step:${s.id}`, title: s.title, detail: s.companyName, href: s.href })),
    ...input.requests
      .filter((r) => r.status === 'pending')
      .map((r) => ({ id: `request:${r.id}`, title: r.label, detail: r.companyName, href: paths.waiting })),
  ].sort((a, b) => (a.detail ?? '').localeCompare(b.detail ?? '') || a.title.localeCompare(b.title));

  return [
    { key: 'overdue', title: 'Overdue', countLabel: (n) => `${n} overdue`, items: overdue, href: paths.work, linkLabel: 'Open your work' },
    { key: 'due', title: 'Due this week', countLabel: (n) => `${n} due this week`, items: due, href: paths.work, linkLabel: 'Open your work' },
    {
      key: 'waiting',
      title: 'Waiting on clients',
      countLabel: (n) => `${n} waiting on clients`,
      items: waiting,
      href: paths.waiting,
      linkLabel: role === 'intern' ? 'Open requests' : 'Open projects',
    },
  ];
}

/* ------------------------------------------------- admin / super admin */

/** A firm-wide risk, as `buildRisks` (super insights) returns it. */
export interface DigestRiskInput {
  id: string;
  kind: string;
  title: string;
  engagementId: string;
  companyName: string;
  href: string;
  ageDays: number | null;
}

export function adminPaths(role: 'admin' | 'super_admin') {
  if (role === 'super_admin') {
    return { filings: '/app/super/risks', stuck: '/app/super/risks', settings: '/app/super/settings' };
  }
  return { filings: '/app/admin/compliances/filings', stuck: '/app/admin/projects', settings: '/app/admin/settings' };
}

export function adminDigestSections(
  role: 'admin' | 'super_admin',
  input: { today: string; risks: DigestRiskInput[] },
): DigestSection[] {
  const paths = adminPaths(role);
  const oldestFirst = (a: DigestRiskInput, b: DigestRiskInput) =>
    (b.ageDays ?? -1) - (a.ageDays ?? -1) || a.companyName.localeCompare(b.companyName);

  const filings = input.risks
    .filter((r) => r.kind === 'filing')
    .sort(oldestFirst)
    .map((r) => ({
      id: r.id,
      title: r.title,
      detail: r.companyName,
      date: r.ageDays !== null ? addDays(input.today, -r.ageDays) : undefined,
      dateLabel: 'due' as const,
      href: r.href,
    }));

  const stuck = input.risks
    .filter((r) => r.kind === 'stuck')
    .sort(oldestFirst)
    .map((r) => ({
      id: r.id,
      title: r.companyName,
      detail: r.title,
      date: r.ageDays !== null ? addDays(input.today, -r.ageDays) : undefined,
      dateLabel: 'since' as const,
      href: r.href,
    }));

  return [
    {
      key: 'overdue',
      title: 'Overdue filings across the firm',
      countLabel: (n) => plural(n, 'overdue filing'),
      items: filings,
      href: paths.filings,
      linkLabel: role === 'super_admin' ? 'Open risks' : 'Open filings',
    },
    {
      key: 'stuck',
      title: 'Stuck clients',
      countLabel: (n) => plural(n, 'stuck client'),
      items: stuck,
      href: paths.stuck,
      linkLabel: role === 'super_admin' ? 'Open risks' : 'Open projects',
    },
  ];
}

/** True when no section has anything to say: the job skips the person. */
export function isEmptyDigest(digest: Pick<WeeklyDigest, 'sections'>): boolean {
  return digest.sections.every((s) => s.items.length === 0);
}
