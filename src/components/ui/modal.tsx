'use client';

import * as React from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DIALOG_CLOSE, DIALOG_OVERLAY, DIALOG_WIDTHS, type DialogSize } from '@/components/ui/dialog-classes';

/**
 * The prototype `Modal` built from props (VCFO Spectrum): navy scrim, a 52px head (eyebrow, 15px
 * title, chips line, tabs on the right, 32px close square) with a hairline under it, the body,
 * and a footer with a hairline above. Widths 420 / 560 / 760 / 1000px. On a phone it is a
 * bottom sheet up to 92 % of the screen. Escape and the scrim close it.
 */
export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** Small muted line above the title. */
  eyebrow?: React.ReactNode;
  /** Chips or short text under the title. */
  sub?: React.ReactNode;
  /** One main button and the secondary buttons (R-12). */
  footer?: React.ReactNode;
  /** The right side of the head, before the close square: tabs. */
  right?: React.ReactNode;
  size?: DialogSize;
  /** No body padding, for lists and grids. */
  flush?: boolean;
  /** Read by screen readers under the title. */
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function Modal({
  open,
  onOpenChange,
  title,
  eyebrow,
  sub,
  footer,
  right,
  size = 'md',
  flush,
  description,
  children,
  className,
}: ModalProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={DIALOG_OVERLAY} />
        <D.Content
          className={cn(
            'discrete-panel discrete-panel-dialog fixed inset-x-0 bottom-0 top-auto z-50 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-md border border-line bg-surface-raised text-ink shadow-dialog outline-none max-sm:!max-w-none',
            'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[86vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-md',
            DIALOG_WIDTHS[size],
            className,
          )}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <header className="relative flex min-h-head shrink-0 items-start gap-3 border-b border-line-soft px-4 py-3 md:px-5">
            <div className="min-w-0 flex-1">
              {eyebrow ? <div className="truncate text-[12.5px] text-ink-muted">{eyebrow}</div> : null}
              <D.Title className="text-[15px] font-medium leading-snug">{title}</D.Title>
              {description ? <D.Description className="sr-only">{description}</D.Description> : null}
              {sub ? <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted">{sub}</div> : null}
            </div>
            {right ? <div className="flex flex-none items-center gap-2 self-center">{right}</div> : null}
            <D.Close className={cn(DIALOG_CLOSE, 'static flex-none')} aria-label="Close">
              <X size={16} strokeWidth={1.6} aria-hidden />
            </D.Close>
          </header>
          <div className={cn('min-h-0 flex-1 overflow-y-auto', !flush && 'p-4 md:px-5')}>{children}</div>
          {footer ? (
            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft px-4 py-3 md:px-5">{footer}</footer>
          ) : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
