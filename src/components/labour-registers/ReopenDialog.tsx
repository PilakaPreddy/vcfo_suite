'use client';

import { type CSSProperties, useId, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LR_TOKENS, lr } from './theme';

/**
 * Reopening a closed period.
 *
 * The reason is required, and that is the whole point of the dialog existing rather than the
 * button simply working. A register that changed after it was produced is a question somebody
 * will eventually ask — an inspector, a client, a partner reviewing the file — and "it was
 * reopened on the fourth, because HR sent a corrected attendance sheet" is an answer. An
 * unexplained reopen is not.
 *
 * It also says plainly what reopening does and does not do. The registers already produced are
 * kept: they keep their content address, so unchanged inputs mean the same files answer and
 * nothing is rebuilt for nothing. Only what actually changed is built again.
 */
export function ReopenDialog({
  open,
  periodLabel,
  registers,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  periodLabel: string;
  /** How many registers already exist for this period. */
  registers?: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const titleId = useId();
  const fieldId = useId();

  if (!open) return null;
  const tooShort = reason.trim().length < 3;

  return (
    <div
      className={cn('fixed inset-0 z-50 flex items-center justify-center p-4', lr.page)}
      style={{ ...LR_TOKENS, background: 'rgba(31, 39, 51, 0.42)' } as CSSProperties}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn('w-full max-w-[480px]', lr.card)}
        style={{ boxShadow: '0 32px 64px -16px rgba(31,39,51,0.32), 0 12px 24px -12px rgba(31,39,51,0.16)' }}
      >
        <div className="flex items-start gap-3 px-6 pb-3 pt-5">
          <RotateCcw className="mt-1 size-5 flex-none text-[var(--lr-warn)]" strokeWidth={1.8} aria-hidden="true" />
          <h2 id={titleId} className={cn(lr.heading, 'm-0 min-w-0 flex-1')}>
            Reopen {periodLabel}?
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
          The inputs start accepting changes again.
          {registers ? ` The ${registers} registers already produced are kept.` : ''} When the period is
          closed again, only the registers whose inputs actually changed are built; the rest answer
          from storage.
        </p>

        <div className="px-6 pb-2 pt-4">
          <label htmlFor={fieldId} className={cn(lr.headLabel, 'mb-1.5 block')}>
            Why is it being reopened?
          </label>
          <input
            id={fieldId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="HR sent a corrected attendance sheet"
            className="h-[var(--lr-h-control)] w-full rounded-[var(--lr-radius-control)] border border-[var(--lr-line-2)] bg-[var(--lr-surface)] px-3 text-[14px] text-[var(--lr-ink)]"
          />
          <p className={cn(lr.small, 'mt-1.5')}>
            Recorded against the batch and shown on the provenance bar. A register that changed after
            it was produced is a question somebody will eventually ask.
          </p>
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--lr-raised)] px-6 py-4">
          <div className="flex-grow" />
          <button type="button" onClick={onCancel} className={cn(lr.quiet, 'text-[14px]')}>
            Cancel
          </button>
          <button
            type="button"
            disabled={tooShort || busy}
            onClick={() => onConfirm(reason.trim())}
            className={cn(lr.primary, 'text-[14px] font-medium')}
          >
            {busy ? 'Reopening…' : 'Reopen the inputs'}
          </button>
        </div>
      </div>
    </div>
  );
}
