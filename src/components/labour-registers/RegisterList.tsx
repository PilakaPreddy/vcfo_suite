'use client';

import type { ComponentType } from 'react';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type LrTone, lr } from './theme';
import { LrCard, LrCardHead, LrChip } from './primitives';

/**
 * One act's registers, each with a download beside it.
 *
 * This is the client's view of a batch and the staff view of an act, and it is the same card in
 * both because the question is the same: what exists for this act, and can I have it. A
 * register that is not ready carries its status word instead of the download — never a disabled
 * button, which tells the person nothing about why.
 */

type Icon = ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>;

export interface RegisterRow {
  id: string;
  /** "Form XXII — Register of Employment". */
  name: string;
  /** "Prepared 2 Oct · 422 employees", or what is still awaited. */
  note?: string;
  /** A download link. Left out, the row shows `status` instead. */
  href?: string;
  /** One of the six status words, shown when there is nothing to download. */
  status?: string;
}

export function RegisterList({
  act,
  icon,
  tone = 'reg',
  status,
  registers,
  className,
}: {
  act: string;
  icon?: Icon;
  tone?: LrTone;
  /** The act's own status chip, in the header. */
  status?: string;
  registers: RegisterRow[];
  className?: string;
}) {
  return (
    <LrCard className={className}>
      <LrCardHead
        icon={icon}
        tone={tone}
        label={act}
        right={status ? <LrChip>{status}</LrChip> : undefined}
      />
      <ul className="m-0 list-none p-0">
        {registers.map((reg, i) => (
          <li
            key={reg.id}
            className={cn(
              'flex items-center gap-2.5 px-4 py-2.5',
              i < registers.length - 1 && 'border-b border-[var(--lr-raised)]',
            )}
          >
            <div className="min-w-0 flex-grow">
              <div
                className={cn(
                  'text-[13px] font-semibold',
                  reg.href ? 'text-[var(--lr-ink)]' : 'text-[var(--lr-muted)]',
                )}
              >
                {reg.name}
              </div>
              {reg.note ? <div className="text-[12px] text-[var(--lr-muted)]">{reg.note}</div> : null}
            </div>
            {reg.href ? (
              <a
                href={reg.href}
                aria-label={`Download ${reg.name}`}
                className="flex size-[30px] flex-none items-center justify-center rounded-[var(--lr-radius-chip)] border border-[var(--lr-line)] text-[var(--lr-primary)]"
              >
                <Download className="size-[15px]" strokeWidth={2} aria-hidden="true" />
              </a>
            ) : reg.status && reg.status !== status ? (
              /* The act's own chip is in the header; repeating it on every row below says
                 nothing and crowds out the register's name. Only a row that differs from the
                 act carries one. */
              <LrChip>{reg.status}</LrChip>
            ) : null}
          </li>
        ))}
      </ul>
      {registers.length === 0 ? (
        <p className={cn(lr.small, 'px-4 py-4')}>Nothing prepared for this act yet.</p>
      ) : null}
    </LrCard>
  );
}
