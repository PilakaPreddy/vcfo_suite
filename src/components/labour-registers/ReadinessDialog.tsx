'use client';

import { useId, useState } from 'react';
import { AlertCircle, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReadinessLine, ReadinessSummary } from '@/lib/labour-registers/readiness';

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
    line.kind === 'ok' ? 'text-positive' : line.kind === 'short' ? 'text-warning' : 'text-danger';
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      {line.kind === 'ok' ? (
        <Check className={cn('mt-px size-4 flex-none', tone)} strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <AlertCircle className={cn('mt-px size-4 flex-none', tone)} strokeWidth={1.6} aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink">{line.text}</span>
      {line.fix && onFix ? (
        <button
          type="button"
          onClick={() => onFix(line.fix!.to)}
          className="flex-none text-[13px] font-medium text-brand hover:underline"
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10, 37, 64, 0.42)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[520px] rounded-md border-2 border-line bg-surface"
        style={{ boxShadow: '0 32px 64px -16px rgba(10,37,64,0.4), 0 12px 24px -12px rgba(10,37,64,0.18)' }}
      >
        <div className="flex items-start gap-3 px-6 pb-3 pt-5">
          <h2 id={titleId} className="min-w-0 flex-1 text-[20px] font-medium leading-tight text-ink">
            Mark register inputs as ready?
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex size-7 flex-none items-center justify-center rounded-md border-[1.5px] border-line-strong text-ink-muted"
          >
            <X className="size-3.5" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <p className="px-6 text-[14px] leading-relaxed text-ink-muted">{sentence}</p>

        <ul className="mx-6 my-4 list-none rounded-md bg-surface-raised px-4 py-2">
          {summary.lines.map((line, i) => (
            <Line key={i} line={line} onFix={onFix} />
          ))}
        </ul>

        {blocked ? (
          <p className="mx-6 mb-4 rounded-md bg-danger-soft px-4 py-3 text-[13px] leading-relaxed text-danger">
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
              className="mt-0.5 size-4 flex-none rounded-bar border-[1.5px] border-line-strong accent-brand"
            />
            <label htmlFor={tickId} className="text-[13px] leading-relaxed text-ink">
              I confirm the employee, attendance and wage data is accurate for this period.
            </label>
          </div>
        )}

        <p className="px-6 pb-4 text-[12px] leading-relaxed text-ink-faint">
          Need changes later? Reopen the inputs from this page. Reopening asks for a reason, and the registers are
          generated again from the inputs as they stand afterwards.
        </p>

        <div className="flex items-center gap-2 border-t border-line-soft px-6 py-4">
          <div className="flex-grow" />
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-md border-[1.5px] border-line-strong bg-surface px-4 text-[14px] font-medium text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={blocked || !confirmed || busy}
            onClick={() => onConfirm(summary)}
            className="h-9 rounded-md bg-brand px-4 text-[14px] font-medium text-white disabled:opacity-40"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)' }}
          >
            {busy ? 'Generating…' : 'Mark as ready & generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
