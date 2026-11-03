'use client';

import { CheckCircle2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

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
 */

export interface ProvenanceBarProps {
  periodLabel: string;
  /** open · ready · generated · attested. */
  status: string;
  markedReadyAt?: string | null;
  markedReadyByName?: string | null;
  generatedAt?: string | null;
  registers?: number;
  acts?: number;
  fromStorage?: number;
  reopenCount?: number;
  reopenReason?: string;
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] font-medium text-ink-faint">{label}</div>
      <div className="mt-0.5 truncate text-[14px] font-medium tabular-nums text-ink">{value}</div>
    </div>
  );
}

export function ProvenanceBar({
  periodLabel,
  status,
  markedReadyAt,
  markedReadyByName,
  generatedAt,
  registers,
  acts,
  fromStorage,
  reopenCount = 0,
  reopenReason,
  className,
}: ProvenanceBarProps) {
  const locked = Boolean(markedReadyAt);

  return (
    <section className={cn('rounded-md border-2 border-line bg-surface', className)}>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 p-5">
        <Field label="Register period" value={periodLabel} />
        <Field label="Inputs marked ready" value={locked ? day(markedReadyAt) : 'Not yet'} />
        <Field label="Generated on" value={dayTime(generatedAt)} />
        {registers !== undefined ? (
          <Field label="Registers" value={acts ? `${registers} across ${acts} acts` : String(registers)} />
        ) : null}
        {fromStorage !== undefined && registers ? (
          <Field label="Served from storage" value={`${fromStorage} of ${registers}`} />
        ) : null}
      </div>

      {locked ? (
        <div className="flex items-start gap-2.5 border-t border-line-soft bg-positive-soft px-5 py-3">
          <CheckCircle2 className="mt-px size-4 flex-none text-positive" strokeWidth={1.6} aria-hidden="true" />
          <p className="text-[13px] leading-relaxed text-positive">
            Inputs were marked ready on {day(markedReadyAt)}
            {markedReadyByName ? ` by ${markedReadyByName}` : ''}. Every register for this period has been generated
            and is ready for review.
          </p>
        </div>
      ) : null}

      {reopenCount > 0 ? (
        <div className="flex items-start gap-2.5 border-t border-line-soft bg-warning-soft px-5 py-3">
          <RotateCcw className="mt-px size-4 flex-none text-warning" strokeWidth={1.6} aria-hidden="true" />
          <p className="text-[13px] leading-relaxed text-warning">
            Reopened {reopenCount === 1 ? 'once' : `${reopenCount} times`}
            {reopenReason ? ` — ${reopenReason}` : ''}. Registers were regenerated from the inputs as they stood
            afterwards; the earlier files are kept.
          </p>
        </div>
      ) : null}

      {status === 'open' && !locked ? (
        <div className="border-t border-line-soft px-5 py-3 text-[13px] text-ink-muted">
          Nothing is generated until the inputs are marked ready.
        </div>
      ) : null}
    </section>
  );
}
