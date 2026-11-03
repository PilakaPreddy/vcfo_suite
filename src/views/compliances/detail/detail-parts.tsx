'use client';

import { useState, type ReactNode } from 'react';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { StepLink, StepMark, type StepState } from '@/components/ui/step-track';
import { cn } from '@/lib/utils';
import { ClientTile } from '@/views/compliances/identity';
import { DateTile, WordChip } from '@/views/compliances/spectrum-parts';
import { daysUntil, isIdentifier, plainDate, type SixWord } from '@/views/compliances/spectrum-status';

/**
 * Shared parts of the statutory (COMPLIANCE-MODEL.md 4.2) and non-statutory (4.3) detail pages
 * on the staff portals (prototype src/screens/shared/detail-parts.tsx): one header card, then
 * two columns. Every part draws what it is given; the pages fetch.
 */

/** 24 px initials circle of a person (R-44). */
export function PersonDot({ name, className }: { name: string; className?: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.length === 0 ? '?' : ((parts[0]![0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : (parts[0]![1] ?? ''))).toUpperCase();
  return (
    <span
      className={cn('inline-grid h-6 w-6 flex-none place-items-center rounded-full bg-surface-sunken text-[10px] font-medium text-ink-2', className)}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** D-1 and 4.3 header card: date tile, name, client, marks, the due line and the one main button. */
export function DetailHeader({
  dateIso,
  done,
  now,
  title,
  clientId,
  clientName,
  marks,
  word,
  due,
  action,
  aside,
}: {
  dateIso: string;
  done: boolean;
  now: Date;
  title: ReactNode;
  clientId: string;
  clientName: string;
  marks: ReactNode;
  word: SixWord;
  due: ReactNode;
  /** The role's one main button (R-12). */
  action?: ReactNode;
  /** Secondary links after the action (Calendar, Filings). */
  aside?: ReactNode;
}) {
  const n = daysUntil(dateIso, now);
  const status = done ? 'upcoming' : n !== null && n < 0 ? 'overdue' : n !== null && n <= 15 ? 'due-soon' : 'upcoming';
  return (
    <section aria-label="Header" className="surface px-4 py-4 md:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <DateTile iso={dateIso} status={status} accent={!done} />
        <div className="min-w-0 flex-[1_1_300px]">
          <h1 className="text-[24px] font-medium leading-8 tracking-[-0.01em] text-ink">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <span className="inline-flex min-w-0 items-center gap-2 text-[14px] font-medium text-ink">
              <ClientTile id={clientId} name={clientName} />
              <span className="truncate">{clientName}</span>
            </span>
            {marks}
            <WordChip word={word} />
            <span className={cn('whitespace-nowrap text-[13px]', word === 'Overdue' ? 'font-medium text-danger' : 'text-ink-muted')}>{due}</span>
          </div>
        </div>
        {action || aside ? (
          <div className="flex flex-none flex-wrap items-center gap-2">
            {aside}
            {action}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Two-column body: the main column and a 360 px rail; stacks below 1024 px. */
export function DetailCols({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid min-w-0 grid-cols-1 gap-5">{left}</div>
      <div className="grid min-w-0 grid-cols-1 gap-5">{right}</div>
    </div>
  );
}

/** Label and value row inside a flush card. */
export function KV({ k, children, sub }: { k: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-t border-line-soft px-4 py-2.5 first:border-t-0 sm:grid-cols-[170px_minmax(0,1fr)_auto] sm:items-center sm:gap-3 md:px-5">
      <span className="text-[13px] text-ink-muted">{k}</span>
      <div className="min-w-0 text-[14px] text-ink">{children}</div>
      {sub ? <span className="text-[12.5px] text-ink-muted">{sub}</span> : <span className="hidden sm:block" />}
    </div>
  );
}

/** A value in a KV row: mono only for identifiers (R-28), faint for a blank. */
function KvValue({ value }: { value: string | null | undefined }) {
  const v = value?.trim();
  if (!v) return <span className="text-ink-faint">—</span>;
  return <b className={cn('font-medium', isIdentifier(v) && 'font-mono text-[13.5px]')}>{v}</b>;
}

export type ReminderState = 'sent' | 'acknowledged' | 'scheduled' | 'skipped' | 'blocked';

export interface ReminderView {
  key: string;
  label: string;
  to: string;
  dateIso: string;
  state: ReminderState;
  /** Escalations are internal; the client view hides them (D-4). */
  internal: boolean;
  /** Off rows show only while the schedule is being edited. */
  enabled?: boolean;
  /** Days from the due date (negative = before). */
  offsetDays?: number;
  /** This row differs from the default schedule. */
  overridden?: boolean;
}

export interface ReminderRowPatch {
  offsetDays?: number;
  enabled?: boolean;
}

const REMINDER_WORD: Record<ReminderState, string> = { sent: 'Sent', acknowledged: 'Acknowledged', scheduled: 'Scheduled', skipped: 'Skipped', blocked: 'On hold' };
const DAY_CHOICES = [1, 2, 3, 5, 7, 10, 15, 20, 30];

/**
 * D-2.3 Reminders (section 3.4). Admin and manager change the days of the first reminder; the
 * others follow from it. `blocked` names what is missing when no reminder can go out (DR-22).
 */
export function RemindersCard({
  rows,
  days,
  onDays,
  canEdit,
  saving = false,
  blocked,
  now,
  onRow,
  onReset,
}: {
  rows: ReminderView[];
  days: number;
  onDays?: (n: number) => void;
  /** Per-row override: move one reminder or turn it off. */
  onRow?: (key: string, patch: ReminderRowPatch) => void;
  /** Drop every override of this item. */
  onReset?: () => void;
  canEdit: boolean;
  saving?: boolean;
  blocked?: string | null;
  now: Date;
}) {
  const [editing, setEditing] = useState(false);
  const rowEdit = editing && onRow ? onRow : null;
  const shown = rowEdit ? rows : rows.filter((r) => r.enabled !== false);
  const choices = DAY_CHOICES.includes(days) ? DAY_CHOICES : [...DAY_CHOICES, days].sort((a, b) => a - b);
  const options = choices.map((n) => ({ value: String(n), label: `${n} day${n === 1 ? '' : 's'} before` }));
  return (
    <DashSection
      title="Reminders"
      meta={`First ${days} day${days === 1 ? '' : 's'} before`}
      flush
      right={
        canEdit && onDays ? (
          editing ? (
            <>
              <FilterSelect aria-label="First reminder" value={String(days)} options={options} disabled={saving} onChange={(e) => onDays(Number(e.target.value))} />
              {onReset && rows.some((r) => r.overridden) ? (
                <Button size="sm" variant="secondary" disabled={saving} onClick={onReset}>
                  Reset
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Done
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Edit schedule
            </Button>
          )
        ) : undefined
      }
    >
      {blocked ? <p className="border-b border-line-soft px-4 py-2.5 text-[13px] text-ink-muted md:px-5">{blocked}</p> : null}
      {shown.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-ink-faint md:px-5">None</p>
      ) : (
        <ul>
          {shown.map((r) => (
            <li
              key={r.key}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-line-soft px-4 py-2.5 first:border-t-0 md:px-5',
                r.enabled === false && 'text-ink-muted',
              )}
            >
              {rowEdit ? (
                <Checkbox
                  checked={r.enabled !== false}
                  disabled={saving}
                  aria-label={`Send ${r.label.toLowerCase()} to ${r.to.toLowerCase()}`}
                  onCheckedChange={(v) => rowEdit(r.key, { enabled: v === true })}
                />
              ) : null}
              <span className="min-w-0 flex-[1_1_200px]">
                <b className={cn('block truncate text-[14px] font-medium', r.enabled === false ? 'text-ink-muted' : 'text-ink')}>{r.label}</b>
                <span className="block truncate text-[12.5px] text-ink-muted">To {r.to.toLowerCase()}</span>
              </span>
              {rowEdit && r.offsetDays !== undefined ? (
                <OffsetInput
                  key={`${r.key}-${r.offsetDays}`}
                  label={`${r.label} to ${r.to.toLowerCase()}, days from the due date`}
                  value={r.offsetDays}
                  disabled={saving || r.enabled === false}
                  onCommit={(n) => rowEdit(r.key, { offsetDays: n })}
                />
              ) : null}
              <span className="w-[64px] flex-none text-[13px] tabular-nums">{plainDate(r.dateIso, now)}</span>
              <span className={cn('w-[104px] flex-none text-[13px]', r.state === 'sent' || r.state === 'acknowledged' ? 'text-ink-2' : 'text-ink-muted')}>
                {REMINDER_WORD[r.state] ?? r.state}
              </span>
            </li>
          ))}
        </ul>
      )}
    </DashSection>
  );
}

/** Days from the due date for one reminder: -120 to 60, saved on Enter or when the field is left. */
function OffsetInput({ label, value, disabled, onCommit }: { label: string; value: number; disabled?: boolean; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  const commit = () => {
    const n = Number(text);
    if (text.trim() === '' || !Number.isInteger(n) || n < -120 || n > 60) {
      setText(String(value));
      return;
    }
    if (n !== value) onCommit(n);
  };
  return (
    <span className="inline-flex flex-none items-center gap-1.5 text-[12.5px] text-ink-muted">
      <Input
        aria-label={label}
        type="number"
        min={-120}
        max={60}
        inputMode="numeric"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="h-8 w-[72px] px-2 text-[13px] tabular-nums"
      />
      days
    </span>
  );
}

export interface ActivityEntry {
  key: string;
  who: string;
  what: string;
  /** ISO date or timestamp. */
  at: string;
}

/** D-2.5 Activity: the audit trail, newest first (DR-16). */
export function ActivityCard({ rows, now, loading }: { rows: ActivityEntry[]; now: Date; loading?: boolean }) {
  return (
    <DashSection title="Activity" flush loading={loading}>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-ink-faint md:px-5">None</p>
      ) : (
        <ul>
          {rows.map((h) => (
            <li key={h.key} className="flex items-start gap-3 border-t border-line-soft px-4 py-2.5 first:border-t-0 md:px-5">
              <PersonDot name={h.who} />
              <span className="min-w-0 flex-1 text-[14px]">
                <b className="font-medium text-ink">{h.who}</b> <span className="text-ink-2">{h.what}</span>
              </span>
              <span className="flex-none whitespace-nowrap text-[12.5px] text-ink-muted">{plainDate(h.at.slice(0, 10), now)}</span>
            </li>
          ))}
        </ul>
      )}
    </DashSection>
  );
}

export interface StepView {
  label: string;
  state: StepState;
  who?: string | null;
  /** ISO date. */
  when?: string | null;
  evidence?: string | null;
}

/** D-3 Progress: ST5 steps with who, when and evidence, then the stage, the owner and the reviewer. */
export function ProgressCard({
  steps,
  stage,
  owner,
  reviewer,
  note,
  now,
  children,
}: {
  steps: StepView[];
  stage: string;
  owner?: string | null;
  reviewer?: string | null;
  note?: string | null;
  now: Date;
  children?: ReactNode;
}) {
  return (
    <DashSection title="Progress" meta={`${steps.filter((s) => s.state === 'done').length} of ${steps.length}`} flush>
      <ol className="px-4 py-3 md:px-5" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s.label} className="relative flex gap-3 pb-3.5 last:pb-0">
            <StepLink x={11} y={11} up={i > 0 && (steps[i - 1].state === 'done' ? 'done' : 'todo')} down={i < steps.length - 1 && (s.state === 'done' ? 'done' : 'todo')} />
            <StepMark state={s.state} label={s.state === 'done' ? 'Done' : s.state === 'now' ? 'Current step' : 'Next'} />
            <span className="min-w-0 flex-1 pt-px">
              <b className={cn('block text-[14px]', s.state === 'next' ? 'font-normal text-ink-2' : 'font-medium text-ink')}>{s.label}</b>
              {s.who || s.when || s.state === 'now' ? (
                <span className="block text-[12.5px] text-ink-muted">
                  {[s.who, s.when ? plainDate(s.when.slice(0, 10), now) : s.state === 'now' ? 'Now' : null].filter(Boolean).join(' · ')}
                </span>
              ) : null}
              {s.evidence ? (
                <span className={cn('mt-0.5 block truncate text-[12.5px] text-ink-2', isIdentifier(s.evidence) && 'font-mono')}>{s.evidence}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
      <div className="grid gap-2.5 border-t border-line-soft px-4 py-3 md:px-5">
        <div className="flex items-center justify-between gap-3 text-[14px]">
          <span className="text-[13px] text-ink-muted">Stage</span>
          <b className="font-medium text-ink">{stage}</b>
        </div>
        {(
          [
            ['Owner', owner],
            ['Reviewer', reviewer],
          ] as const
        ).map(([k, who]) => (
          <div key={k} className="flex items-center justify-between gap-3 text-[14px]">
            <span className="text-[13px] text-ink-muted">{k}</span>
            {who ? (
              <span className="inline-flex min-w-0 items-center gap-2">
                <PersonDot name={who} />
                <span className="truncate font-medium text-ink">{who}</span>
              </span>
            ) : (
              <span className="text-ink-faint">—</span>
            )}
          </div>
        ))}
        {note ? <p className="rounded-md bg-surface-sunken px-3 py-2 text-[13px] leading-relaxed text-ink-2">{note}</p> : null}
        {children}
      </div>
    </DashSection>
  );
}
