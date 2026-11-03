'use client';

import { type CSSProperties, useId, useState } from 'react';
import { CalendarCheck, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LR_TOKENS, lr } from './theme';

/**
 * No attendance sheet: assume the month, or go and get one.
 *
 * Seven of the eight muster rolls in the catalogue carry a column per day, and none of them
 * can be produced without knowing who was present. A client who does not keep a daily sheet —
 * and plenty do not, for a salaried office roll — would otherwise be unable to produce a
 * muster roll at all.
 *
 * So the firm may state the month was fully present. That is a statement about the client's
 * records, not a default, which is why it is a dialog rather than a checkbox and why the
 * wording says who is saying it.
 *
 * **The assumption is keyed.** `fullAttendanceAssumed` is part of every document's content
 * address, so an assumed month and an uploaded one are different documents: uploading a sheet
 * afterwards rebuilds the muster rolls rather than leaving a stale file that looks the same.
 * Every register produced under it also prints a line saying so, so a reader of the printed
 * sheet knows without having to come back here.
 */
export function AttendanceChoiceDialog({
  open,
  periodLabel,
  blockedForms,
  busy = false,
  onCancel,
  onConfirmAssume,
  onUpload,
}: {
  open: boolean;
  periodLabel: string;
  /** The forms that cannot be produced without a day grid, named so the choice is informed. */
  blockedForms: string[];
  busy?: boolean;
  onCancel: () => void;
  onConfirmAssume: (weekOff: string) => void;
  /** Take me to the upload instead. */
  onUpload: () => void;
}) {
  const [weekOff, setWeekOff] = useState('sun');
  const titleId = useId();
  const fieldId = useId();

  if (!open) return null;

  return (
    <div
      className={cn('fixed inset-0 z-50 flex items-center justify-center p-4', lr.page)}
      style={{ ...LR_TOKENS, background: 'rgba(31, 39, 51, 0.42)' } as CSSProperties}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn('w-full max-w-[540px]', lr.card)}
        style={{ boxShadow: '0 32px 64px -16px rgba(31,39,51,0.32), 0 12px 24px -12px rgba(31,39,51,0.16)' }}
      >
        <div className="flex items-start gap-3 px-6 pb-3 pt-5">
          <CalendarCheck className="mt-1 size-5 flex-none text-[var(--lr-warn)]" strokeWidth={1.8} aria-hidden="true" />
          <h2 id={titleId} className={cn(lr.heading, 'm-0 min-w-0 flex-1')}>
            No attendance sheet for {periodLabel}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex size-7 flex-none items-center justify-center rounded-[var(--lr-radius-chip)] border border-[var(--lr-line-2)] text-[var(--lr-muted)]"
          >
            <X className="size-3.5" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <p className="m-0 px-6 text-[14px] leading-relaxed text-[var(--lr-muted)]">
          {blockedForms.length > 0 ? (
            <>
              {blockedForms.length} {blockedForms.length === 1 ? 'register carries' : 'registers carry'} a column per
              day and cannot be produced without one — {blockedForms.slice(0, 3).join(', ')}
              {blockedForms.length > 3 ? ` and ${blockedForms.length - 3} more` : ''}.
            </>
          ) : (
            'Some registers carry a column per day and cannot be produced without one.'
          )}
        </p>

        <div className="mx-6 my-4 rounded-[var(--lr-radius-control)] border border-[var(--lr-line)] bg-[var(--lr-canvas)] p-4">
          <div className={cn(lr.headLabel, 'mb-1')}>If the client keeps no daily sheet</div>
          <p className="m-0 text-[13px] leading-relaxed text-[var(--lr-muted)]">
            The firm may state that everybody was present throughout, which is the ordinary position
            for a salaried office roll. Every register produced this way prints a line saying so, and
            the batch records it — so uploading a sheet later rebuilds the muster rolls rather than
            leaving a file that looks the same but is not.
          </p>

          <label htmlFor={fieldId} className={cn(lr.headLabel, 'mb-1.5 mt-3.5 block')}>
            Which days are the weekly off?
          </label>
          <select
            id={fieldId}
            value={weekOff}
            onChange={(e) => setWeekOff(e.target.value)}
            className={cn(lr.select, 'w-full')}
          >
            <option value="sun">Sunday</option>
            <option value="sat-sun">Saturday and Sunday</option>
            <option value="alt-sat-sun">Sunday, and alternate Saturdays</option>
            <option value="none">None — a seven-day week</option>
          </select>
          <p className={cn(lr.small, 'mt-1.5')}>
            Printed as a week off on the muster roll rather than as a day worked, so the days-worked
            total is not overstated.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--lr-raised)] px-6 py-4">
          <button type="button" onClick={onUpload} className={cn(lr.quiet, 'text-[14px]')}>
            <Upload className="size-4" strokeWidth={1.8} aria-hidden="true" />
            Upload a sheet instead
          </button>
          <div className="flex-grow" />
          <button type="button" onClick={onCancel} className={cn(lr.quiet, 'text-[14px]')}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirmAssume(weekOff)}
            className={cn(lr.primary, 'text-[14px] font-medium')}
          >
            {busy ? 'Recording…' : 'Record full attendance'}
          </button>
        </div>
      </div>
    </div>
  );
}
