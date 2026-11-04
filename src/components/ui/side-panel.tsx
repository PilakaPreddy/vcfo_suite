'use client';

import * as React from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DIALOG_CLOSE, DIALOG_OVERLAY } from '@/components/ui/dialog-classes';

/**
 * The right detail panel (VCFO Spectrum, prototype SidePanel and TaskDrawer frame): 440px wide by
 * default, a 1px edge and the dialog shadow, full width on phones. The head has an eyebrow, a
 * 15px title and a chips line; the body scrolls; the footer has a hairline above. Put titled
 * blocks in the body with `PanelSection`.
 */
export interface SidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  /** Chips under the title. */
  sub?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  /** Panel width in px (440 by default). */
  width?: number;
  /** Read by screen readers under the title. */
  description?: string;
}

export function SidePanel({ open, onOpenChange, title, eyebrow, sub, footer, children, width = 440, description }: SidePanelProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={DIALOG_OVERLAY} />
        <D.Content
          className="discrete-panel discrete-sheet-right fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface-raised text-ink shadow-dialog outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
          style={{ maxWidth: width }}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <header className="flex items-start gap-3 border-b border-line-soft px-5 py-4">
            <div className="min-w-0 flex-1">
              {eyebrow ? <div className="flex min-w-0 items-center gap-2 truncate text-[12.5px] text-ink-muted">{eyebrow}</div> : null}
              <D.Title className="mt-0.5 text-[15px] font-medium leading-snug">{title}</D.Title>
              {description ? <D.Description className="sr-only">{description}</D.Description> : null}
              {sub ? <div className="mt-2 flex flex-wrap items-center gap-2">{sub}</div> : null}
            </div>
            <D.Close className={cn(DIALOG_CLOSE, 'static flex-none')} aria-label="Close">
              <X size={16} strokeWidth={1.6} aria-hidden />
            </D.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer ? (
            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft px-5 py-3">{footer}</footer>
          ) : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** A titled block inside a SidePanel or Modal: 11.5px caps title, hairline under the block. */
export function PanelSection({
  title,
  children,
  className,
  flush,
}: {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** No padding around the body (lists and tables); the title keeps its own. */
  flush?: boolean;
}) {
  return (
    <div className={cn('border-b border-line-soft last:border-b-0', !flush && 'px-5 py-4', className)}>
      {title ? (
        <h3 className={cn('mb-2 text-[11.5px] font-medium uppercase tracking-[.07em] text-ink-muted', flush && 'px-5 pt-4')}>{title}</h3>
      ) : null}
      {children}
    </div>
  );
}
