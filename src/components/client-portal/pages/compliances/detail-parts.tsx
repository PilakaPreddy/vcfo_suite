'use client';

/**
 * Client portal · shared parts of the statutory (4.2) and non-statutory (4.3) detail pages in
 * COMPLIANCE-MODEL.md, client view only (D-4): the header card, the two-column body, the
 * Reminders card without escalations and without the edit control, the Activity card and the
 * Progress card with the owner and no reviewer.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Chip, toneFor } from '@/components/ui/spectrum-chip';
import { StepLink, StepMark } from '@/components/ui/step-track';
import { daysBetween, fmtDM } from '@/lib/client-portal/compliances';
import { Avatar } from '../incorporation/spectrum';
import { DateTile, Empty, SCard, urgencyTint } from './spectrum';
import type { DetailHistory, DetailReminder, DetailStep } from './task-api';

/** R-28: mono only for identifiers (ARN, CPIN, SRN): runs of capitals and digits. */
const isId = (v: string) => /^[A-Z0-9][A-Z0-9 ·/-]{5,}$/.test(v.trim()) && /[A-Z0-9]{6,}/.test(v);

/** "14 Oct" from a date or a timestamp; "-" when there is none. */
export function whenText(v: string | null | undefined): string {
  if (!v) return '-';
  return fmtDM(v.slice(0, 10));
}

/** Days to due, or days overdue: "Due in 4 days", "3 days overdue", "Done". */
export function dueText(due: string, today: string, done: boolean, doneWord = 'Done'): string {
  if (done) return doneWord;
  const n = daysBetween(today, due);
  return n < 0 ? `${-n} day${n === -1 ? '' : 's'} overdue` : n === 0 ? 'Due today' : `Due in ${n} day${n === 1 ? '' : 's'}`;
}

/** D-1 and 4.3 header card: the date tile, the name, the marks, the status chip, the due line and the one main button. */
export function DetailHeader({
  date,
  today,
  done,
  title,
  company,
  marks,
  word,
  due,
  late,
  action,
}: {
  date: string;
  today: string;
  done: boolean;
  title: string;
  company?: string | null;
  marks?: ReactNode;
  word: string;
  due: ReactNode;
  late: boolean;
  action?: ReactNode;
}) {
  return (
    <section aria-label="Header" className="rounded-md border-1.5 border-line bg-surface-raised px-4 py-4 md:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <DateTile iso={date} s={done ? 'none' : urgencyTint(today, date)} />
        <div className="min-w-0 flex-[1_1_300px]">
          <h1 className="text-[24px] font-medium leading-8 tracking-[-0.01em] text-ink">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-2">
            {company ? <span className="truncate text-[14px] font-medium text-ink">{company}</span> : null}
            {marks}
            <Chip tone={toneFor(word)} fixed>
              {word}
            </Chip>
            <span className={cn('whitespace-nowrap text-[13px]', late ? 'font-medium text-danger' : 'text-ink-muted')}>{due}</span>
          </div>
        </div>
        {action ? <div className="flex flex-none flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </section>
  );
}

/** Two-column body: the main column and a 360px rail; stacks below 1024px. */
export function DetailCols({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid min-w-0 grid-cols-1 gap-5">{left}</div>
      <div className="grid min-w-0 grid-cols-1 gap-5">{right}</div>
    </div>
  );
}

const REMINDER_STATE: Record<DetailReminder['state'], string> = {
  sent: 'Sent',
  acknowledged: 'Read',
  scheduled: 'Scheduled',
  skipped: 'Skipped',
  blocked: 'Not set up',
};

/** D-2.3 Reminders, client view (D-4): no escalations and no edit control. */
export function RemindersCard({ rows }: { rows: DetailReminder[] }) {
  const shown = rows.filter((r) => !r.internal);
  return (
    <SCard title="Reminders" meta={shown.length || undefined} flush>
      {shown.length ? (
        <ul>
          {shown.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-line-soft px-4 py-2.5 first:border-t-0 md:px-5">
              <span className="min-w-0 flex-[1_1_200px]">
                <b className="block truncate text-[14px] font-medium text-ink">{r.label}</b>
                {r.to ? <span className="block truncate text-[12.5px] text-ink-muted">To {r.to.toLowerCase()}</span> : null}
              </span>
              <span className="w-[64px] flex-none text-[13px] tabular-nums text-ink-2">{r.date ? fmtDM(r.date) : '-'}</span>
              <span className={cn('w-[88px] flex-none text-[13px]', r.state === 'sent' || r.state === 'acknowledged' ? 'text-ink-2' : 'text-ink-muted')}>{REMINDER_STATE[r.state]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty />
      )}
    </SCard>
  );
}

/** D-2.5 Activity: the audit trail, newest first. */
export function ActivityCard({ rows }: { rows: DetailHistory[] }) {
  return (
    <SCard title="Activity" meta={rows.length || undefined} flush>
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <ul>
          {rows.map((h, i) => (
            <li key={`${h.at}-${i}`} className="flex items-start gap-3 border-t border-line-soft px-4 py-2.5 first:border-t-0 md:px-5">
              <Avatar name={h.who} size={24} />
              <span className="min-w-0 flex-1 text-[14px]">
                <b className="font-medium text-ink">{h.who}</b> <span className="text-ink-2">{h.what}</span>
              </span>
              <span className="flex-none whitespace-nowrap text-[12.5px] text-ink-muted">{whenText(h.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </SCard>
  );
}

/** D-3 Progress, client view: ST5 steps with who, when and evidence, then the stage and the owner (no reviewer, K-2). */
export function ProgressCard({
  steps,
  stage,
  owner,
  period,
  right,
}: {
  steps: DetailStep[];
  stage: string | null;
  owner: string | null;
  /** The period the steps belong to ("1–30 Sep 2026"), before the count. */
  period?: string;
  right?: ReactNode;
}) {
  const count = steps.length ? `${steps.filter((s) => s.state === 'done').length} of ${steps.length}` : undefined;
  return (
    <SCard title="Progress" meta={[period, count].filter(Boolean).join(' · ') || undefined} right={right} flush>
      {steps.length ? (
        <ol className="px-4 py-3 md:px-5">
          {steps.map((s, i) => (
            <li key={`${s.label}-${i}`} className="relative flex gap-3 pb-3.5 last:pb-0">
              <StepLink x={11} y={11} up={i > 0 && (steps[i - 1].state === 'done' ? 'done' : 'todo')} down={i < steps.length - 1 && (s.state === 'done' ? 'done' : 'todo')} />
              <StepMark state={s.state} label={s.state === 'done' ? 'Done' : s.state === 'now' ? 'Current step' : 'Next'} />
              <span className="min-w-0 flex-1 pt-px">
                <b className={cn('block text-[14px]', s.state === 'next' ? 'font-normal text-ink-2' : 'font-medium text-ink')}>{s.label}</b>
                {s.who || s.when || s.state === 'now' ? (
                  <span className="block text-[12.5px] text-ink-muted">
                    {[s.who, s.when ? whenText(s.when) : s.state === 'now' ? 'Now' : null].filter(Boolean).join(' · ')}
                  </span>
                ) : null}
                {s.evidence ? <span className={cn('mt-0.5 block truncate text-[12.5px] text-ink-2', isId(s.evidence) && 'font-mono')}>{s.evidence}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <Empty />
      )}
      <div className="grid gap-2.5 border-t border-line-soft px-4 py-3 md:px-5">
        <div className="flex items-center justify-between gap-3 text-[14px]">
          <span className="text-[13px] text-ink-muted">Stage</span>
          <b className="font-medium text-ink">{stage ?? '-'}</b>
        </div>
        <div className="flex items-center justify-between gap-3 text-[14px]">
          <span className="text-[13px] text-ink-muted">With SBC</span>
          {owner ? (
            <span className="inline-flex min-w-0 items-center gap-2">
              <Avatar name={owner} size={24} />
              <span className="truncate font-medium text-ink">{owner}</span>
            </span>
          ) : (
            <span className="text-ink-faint">-</span>
          )}
        </div>
      </div>
    </SCard>
  );
}
