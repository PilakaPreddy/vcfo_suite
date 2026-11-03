'use client';

import { type CSSProperties, useId, useState } from 'react';
import { AlertCircle, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReadinessLine, ReadinessSummary } from '@/lib/labour-registers/readiness';
import { LR_TOKENS, lr } from './theme';

/**
 * The monthly close, as one decision.
 *
 * This is a dialog rather than a popover, and that is the design system's own distinction:
 * the scrim and `shadow-dialog` are for decisions, and locking a period is the decision this
 * feature is built around. Everything before it is gathering.
 *
 * Three things it must do, in this order:
 *
 *  1. Say exactly what the tick commits to — the period, how many registers, how many acts,
 *     how many employees — before asking for it.
 *  2. Show what is complete and what is short, with somewhere to go and fix each shortfall.
 *     A blocker disables the action; a shortfall does not, because it is a judgement call and
 *     the preparer is the one making it.
 *  3. Take the confirmation as a statement by a person. The tick is required, it is never
 *     pre-ticked, and the summary on screen is stored with it.
 */

export interface ReadinessDialogProps {
  open: boolean;
  summary: ReadinessSummary;
  /** The sentence from `closeSentence()`. */
  sentence: string;
  onCancel: () => void;
  /** Called with the summary that was on screen, so it is stored with the confirmation. */
  onConfirm: (summary: ReadinessSummary) => void;
  /** Where a "Review" link should take the preparer. */
  onFix?: (to: NonNullable<ReadinessLine['fix']>['to']) => void;
  busy?: boolean;
}

function Line({ line, onFix }: { line: ReadinessLine; onFix?: ReadinessDialogProps['onFix'] }) {
  const tone =
    line.kind === 'ok'
      ? 'text-[var(--lr-ok)]'
      : line.kind === 'short'
        ? 'text-[var(--lr-warn)]'
        : 'text-[var(--lr-bad)]';
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      {line.kind === 'ok' ? (
        <Check className={cn('mt-px size-4 flex-none', tone)} strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <AlertCircle className={cn('mt-px size-4 flex-none', tone)} strokeWidth={1.6} aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-[var(--lr-ink)]">{line.text}</span>
      {line.fix && onFix ? (
        <button
          type="button"
          onClick={() => onFix(line.fix!.to)}
          className={cn(lr.link, 'flex-none')}
        >
          {line.fix.label}
        </button>
      ) : null}
    </li>
  );
}

export function ReadinessDialog({
  open,
  summary,
  sentence,
  onCancel,
  onConfirm,
  onFix,
  busy = false,
}: ReadinessDialogProps) {
  const [confirmed, setConfirmed] = useState(false);
  const titleId = useId();
  const tickId = useId();

  if (!open) return null;

  const blocked = !summary.canClose;

  return (
    <div
      /* The dialog is fixed to the viewport, so it renders outside `LabourRegistersTheme` and
         carries the feature's tokens itself. */
      className={cn('fixed inset-0 z-50 flex items-center justify-center p-4', lr.page)}
      style={{ ...LR_TOKENS, background: 'rgba(31, 39, 51, 0.42)' } as CSSProperties}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn('w-full max-w-[520px]', lr.card)}
        style={{ boxShadow: '0 32px 64px -16px rgba(31,39,51,0.32), 0 12px 24px -12px rgba(31,39,51,0.16)' }}
      >
        <div className="flex items-start gap-3 px-6 pb-3 pt-5">
          <h2 id={titleId} className={cn(lr.heading, 'm-0 min-w-0 flex-1')}>
            Mark register inputs as ready?
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

        <p className="px-6 text-[14px] leading-relaxed text-[var(--lr-muted)]">{sentence}</p>

        <ul className="mx-6 my-4 list-none rounded-[var(--lr-radius-control)] bg-[var(--lr-canvas)] px-4 py-2">
          {summary.lines.map((line, i) => (
            <Line key={i} line={line} onFix={onFix} />
          ))}
        </ul>

        {blocked ? (
          <p className="mx-6 mb-4 rounded-[var(--lr-radius-control)] bg-[var(--lr-bad-soft)] px-4 py-3 text-[13px] leading-relaxed text-[var(--lr-bad)]">
            The period cannot be closed until the items above are resolved. Each would put a figure in a statutory
            register that cannot be stood behind.
          </p>
        ) : (
          <div className="mx-6 mb-2 flex items-start gap-2.5">
            <input
              id={tickId}
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 size-4 flex-none rounded-[3px] border border-[var(--lr-line-2)] accent-[var(--lr-primary)]"
            />
            <label htmlFor={tickId} className="text-[13px] leading-relaxed text-[var(--lr-ink)]">
              I confirm the employee, attendance and wage data is accurate for this period.
            </label>
          </div>
        )}

        <p className="px-6 pb-4 text-[12px] leading-relaxed text-[var(--lr-faint)]">
          Need changes later? Reopen the inputs from this page. Reopening asks for a reason, and the registers are
          generated again from the inputs as they stand afterwards.
        </p>

        <div className="flex items-center gap-2 border-t border-[var(--lr-raised)] px-6 py-4">
          <div className="flex-grow" />
          <button type="button" onClick={onCancel} className={cn(lr.quiet, 'text-[14px]')}>
            Cancel
          </button>
          <button
            type="button"
            disabled={blocked || !confirmed || busy}
            onClick={() => onConfirm(summary)}
            className={cn(lr.primary, 'text-[14px] font-medium')}
          >
            {busy ? 'Generating…' : 'Mark as ready & generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
