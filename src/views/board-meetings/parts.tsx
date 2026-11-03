'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { cn } from '@/lib/utils';
import { splitPlaceholders } from '@/lib/board-meetings/rules';
import type { MeetingDto } from '@/hooks/use-board-meetings';
import type { TrackStep } from './view-model';


/** The status chip of a meeting in the six-word scale. */
export function MeetingStatusChip({ meeting }: { meeting: Pick<MeetingDto, 'status' | 'documents' | 'dates'> }) {
  const mom = meeting.documents.find((d) => d.kind === 'mom');
  let word = 'In progress';
  let tone: ChipTone = 'prog';
  if (meeting.status === 'pending_approval') {
    word = 'Waiting';
    tone = 'teal';
  } else if (meeting.status === 'cancelled') {
    word = 'Cancelled';
    tone = 'idle';
  } else if (meeting.status === 'held' && mom?.status === 'locked') {
    word = 'Done';
    tone = 'ok';
  } else if (meeting.status === 'held' && meeting.dates.today > meeting.dates.momDue) {
    word = 'Overdue';
    tone = 'bad';
  } else if ((meeting.status === 'draft' && meeting.dates.today >= meeting.dates.prepare) || (meeting.status === 'held' && meeting.dates.today >= meeting.dates.momDue)) {
    word = meeting.dates.today > meeting.dates.noticeSend && meeting.status === 'draft' ? 'Overdue' : 'Due soon';
    tone = word === 'Overdue' ? 'bad' : 'warn';
  } else if (meeting.status === 'sent' || meeting.status === 'approved') {
    word = 'Waiting';
    tone = 'teal';
  }
  return (
    <Chip tone={tone} fixed raw>
      {word}
    </Chip>
  );
}

/** Text with the [placeholder] parts highlighted. */
export function WithBlanks({ text }: { text: string }) {
  return (
    <>
      {splitPlaceholders(text).map((p, i) =>
        p.blank ? (
          <mark key={i} className="rounded-[3px] bg-warning-soft px-0.5 text-warning">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

export function StepStrip({ steps }: { steps: TrackStep[] }) {
  return (
    <ol className="grid grid-cols-5 gap-0" aria-label="Meeting progress">
      {steps.map((s, i) => (
        <li key={s.label} className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center">
            <span
              className={cn(
                'grid h-[22px] w-[22px] flex-none place-items-center rounded-[4px] text-[12px] font-medium',
                s.state === 'done' ? 'bg-positive-mid text-white' : s.state === 'now' ? 'bg-brand text-white' : 'border-1.5 border-line-strong text-ink-muted',
              )}
            >
              {s.state === 'done' ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </span>
            {i < steps.length - 1 ? <span className={cn('h-0.5 flex-1', s.state === 'done' ? 'bg-positive-mid' : 'bg-line-strong')} /> : null}
          </div>
          <span className={cn('truncate text-[13px] font-medium', s.state === 'done' ? 'text-ink-muted' : 'text-ink')}>{s.label}</span>
          <span className="truncate text-[12px] text-ink-muted">{s.sub}</span>
        </li>
      ))}
    </ol>
  );
}

export function Banner({ tone, children, action }: { tone: 'ok' | 'warn' | 'bad' | 'info' | 'teal'; children: ReactNode; action?: ReactNode }) {
  const cls = {
    ok: 'bg-positive-soft text-positive',
    warn: 'bg-warning-soft text-warning',
    bad: 'bg-danger-soft text-danger',
    info: 'bg-brand-soft text-brand-text',
    teal: 'bg-waiting-soft text-waiting',
  }[tone];
  return (
    <div role="status" className={cn('flex flex-wrap items-start gap-3 rounded-md px-4 py-3 text-[13.5px]', cls)}>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function Card({ title, right, children, className, id }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id} className={cn('min-w-0 rounded-md border-2 border-line bg-surface', className)}>
      <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-2">
        <h2 id={id} className="m-0 text-[15px] font-medium">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5 text-[12px] font-medium text-ink-muted', className)}>
      {label}
      {children}
    </label>
  );
}

