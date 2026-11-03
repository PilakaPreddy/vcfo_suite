'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { lr } from './theme';
import { LrBanner, LrCard } from './primitives';

/**
 * What happened to this batch, said out loud.
 *
 * Who locked the period, when it was generated, how many registers exist and how many came
 * back from storage rather than being built again. That last number is the point of the whole
 * caching design, and until this bar existed it lived only inside an evidence manifest that
 * nobody opens. A saving nobody can see is a saving nobody believes.
 *
 * It also does a quieter job: it is the first thing an inspector-facing conversation needs.
 * "Marked ready on 3 November by Krishna, generated at 14:05, twenty registers across six
 * acts" answers most of what gets asked before anyone opens a file.
 *
 * The actions live in this card's footer rather than beside the page title, which is where they
 * were first put. Reopening and downloading are both statements about this batch, and the row
 * of facts above them is the thing a person checks before doing either.
 */

export interface ProvenanceBarProps {
  periodLabel: string;
  /** open · ready · generated · attested. */
  status: string;
  markedReadyAt?: string | null;
  markedReadyByName?: string | null;
  generatedAt?: string | null;
  employees?: number;
  registers?: number;
  acts?: number;
  fromStorage?: number;
  reopenCount?: number;
  reopenReason?: string;
  /** The buttons for this batch, in the footer. */
  actions?: ReactNode;
  className?: string;
}

/** "3 Nov 2026" and "3 Nov 2026, 14:05" — plain, as the content rules ask. */
function day(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function dayTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day(iso)}, ${time}`;
}

function Field({ label, value, tone }: { label: string; value: string; tone?: 'ok' }) {
  return (
    <div className="min-w-0">
      <div className={lr.fieldLabel}>{label}</div>
      <div className={cn(lr.fieldValue, 'mt-0.5 truncate', tone === 'ok' && 'text-[var(--lr-ok)]')}>{value}</div>
    </div>
  );
}

export function ProvenanceBar({
  periodLabel,
  status,
  markedReadyAt,
  markedReadyByName,
  generatedAt,
  employees,
  registers,
  acts,
  fromStorage,
  reopenCount = 0,
  reopenReason,
  actions,
  className,
}: ProvenanceBarProps) {
  const locked = Boolean(markedReadyAt);
  /* Every file answered from storage is the whole-cache case, and it is worth colouring. A
     partial figure is reported plainly: it is a fact, not an achievement. */
  const allCached = fromStorage !== undefined && registers !== undefined && registers > 0 && fromStorage === registers;

  return (
    <LrCard className={className}>
      <div className="flex flex-wrap gap-x-8 gap-y-4 p-5">
        <Field label="Register period" value={periodLabel} />
        <Field label="Inputs marked ready" value={locked ? day(markedReadyAt) : 'Not yet'} />
        <Field label="Generated on" value={dayTime(generatedAt)} />
        {employees !== undefined ? <Field label="Employees" value={String(employees)} /> : null}
        {registers !== undefined ? (
          <Field label="Registers" value={acts ? `${registers} across ${acts} acts` : String(registers)} />
        ) : null}
        {fromStorage !== undefined && registers ? (
          <Field
            label="Served from storage"
            value={`${fromStorage} of ${registers}`}
            tone={allCached ? 'ok' : undefined}
          />
        ) : null}
      </div>

      {locked ? (
        <LrBanner icon={CheckCircle2} tone="ok" inset>
          Inputs were marked ready on {day(markedReadyAt)}
          {markedReadyByName ? ` by ${markedReadyByName}` : ''}. Every register for this period has been generated
          and is ready for review.
        </LrBanner>
      ) : null}

      {reopenCount > 0 ? (
        <LrBanner icon={RotateCcw} tone="warn" inset>
          Reopened {reopenCount === 1 ? 'once' : `${reopenCount} times`}
          {reopenReason ? ` — ${reopenReason}` : ''}. Registers were regenerated from the inputs as they stood
          afterwards; the earlier files are kept.
        </LrBanner>
      ) : null}

      {status === 'open' && !locked ? (
        <div className={cn(lr.small, 'border-t border-[var(--lr-raised)] px-5 py-3')}>
          Nothing is generated until the inputs are marked ready.
        </div>
      ) : null}

      {actions ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--lr-raised)] px-5 py-3">
          <div className="flex-grow" />
          {actions}
        </div>
      ) : null}
    </LrCard>
  );
}
