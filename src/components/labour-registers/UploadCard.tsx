'use client';

import { useId, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { maxUploadSizeLabel } from '@/lib/upload-limits';
import { lr } from './theme';
import { LrCard, LrCardHead, LrChip } from './primitives';

/**
 * The four inputs a batch takes, each a slot you can drop a file on.
 *
 * There is no shared dropzone in this codebase — every one of the seven existing upload
 * dialogs rolls its own — so this is a new one, written on the feature's own tokens. It is
 * deliberately plainer than the client-portal dialog: a register input is one file per slot,
 * replaced rather than accumulated, so there is no queue, no tray and no partial-batch case.
 *
 * What it shows after an upload is the thing that matters: which sheet the reader chose, which
 * row it took the headings from, and how many rows it found. A payroll workbook routinely has
 * thirteen sheets and a title row above the headings, so "it uploaded" is not the useful
 * signal — "it read the right sheet" is.
 */

export type SlotKey = 'paysheet' | 'attendance' | 'overtime' | 'employees';

export interface SlotState {
  fileName: string;
  rowCount: number;
  sheetName?: string;
  headerRow?: number;
  /** How many day columns the reader found, where it found a grid. */
  gridDays?: number;
}

export interface SlotSpec {
  key: SlotKey;
  label: string;
  /** What it is for, in one line. */
  blurb: string;
  /** True when a form in this period cannot be produced without it. */
  required?: boolean;
}

export const REGISTER_SLOTS: SlotSpec[] = [
  {
    key: 'paysheet',
    label: 'Paysheet',
    blurb: 'One row per employee: earnings, deductions, days worked. Every wage register needs it.',
    required: true,
  },
  {
    key: 'attendance',
    label: 'Attendance',
    blurb: 'The daily sheet. Muster rolls carry one column per day and cannot be built without it.',
  },
  {
    key: 'overtime',
    label: 'Overtime',
    blurb: 'Hours and dates, where overtime was worked. Not needed if nobody worked any.',
  },
  {
    key: 'employees',
    label: 'Employee details',
    blurb: 'Addresses, guardian names, shift timings and minimum wage coverage — the columns no paysheet carries.',
  },
];

function describe(state: SlotState): string {
  const parts = [`${state.rowCount} rows`];
  if (state.sheetName) parts.push(`sheet "${state.sheetName}"`);
  if (state.headerRow && state.headerRow > 1) parts.push(`headings on row ${state.headerRow}`);
  if (state.gridDays) parts.push(`${state.gridDays} day columns`);
  return parts.join(' · ');
}

function Slot({
  spec,
  state,
  busy,
  error,
  disabled,
  onPick,
}: {
  spec: SlotSpec;
  state?: SlotState;
  busy: boolean;
  error?: string;
  disabled: boolean;
  onPick: (file: File) => void;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function take(files: FileList | null) {
    const file = files?.[0];
    if (file && !disabled) onPick(file);
  }

  return (
    <li
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
      className={cn(
        'flex flex-wrap items-center gap-3 border-t border-[var(--lr-raised)] px-4 py-3 first:border-t-0',
        over && 'bg-[var(--lr-primary-soft)]',
        disabled && 'opacity-60',
      )}
    >
      <FileSpreadsheet
        className={cn('size-4 flex-none', state ? 'text-[var(--lr-ok)]' : 'text-[var(--lr-faint)]')}
        strokeWidth={1.7}
        aria-hidden="true"
      />

      <div className="min-w-[200px] flex-[999_1_240px]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--lr-ink)]">{spec.label}</span>
          {spec.required ? <LrChip tone="bad">Required</LrChip> : null}
        </div>
        {state ? (
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--lr-muted)]">
            <CheckCircle2 className="size-3 flex-none text-[var(--lr-ok)]" strokeWidth={2} aria-hidden="true" />
            <span className={lr.code}>{state.fileName}</span>
            <span>· {describe(state)}</span>
          </div>
        ) : (
          <p className="m-0 mt-0.5 text-[12px] leading-relaxed text-[var(--lr-faint)]">{spec.blurb}</p>
        )}
        {error ? (
          <div className="mt-1 flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--lr-bad)]" role="alert">
            <AlertCircle className="mt-px size-3 flex-none" strokeWidth={2} aria-hidden="true" />
            {error}
          </div>
        ) : null}
      </div>

      <input
        id={inputId}
        ref={input}
        type="file"
        accept=".xlsx,.xlsm,.csv"
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => {
          take(e.target.files);
          /* Cleared so picking the same file twice still fires a change. */
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
        className={cn(lr.quiet, 'h-9 flex-none text-[13px]')}
      >
        <Upload className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
        {busy ? 'Reading…' : state ? 'Replace' : 'Choose file'}
      </button>
    </li>
  );
}

export function UploadCard({
  uploads,
  busySlot,
  errors,
  locked = false,
  onPick,
  className,
}: {
  uploads: Partial<Record<SlotKey, SlotState>>;
  /** The slot currently uploading, if any. */
  busySlot?: SlotKey | null;
  errors?: Partial<Record<SlotKey, string>>;
  /** True once the period is closed: inputs stop accepting changes. */
  locked?: boolean;
  onPick: (slot: SlotKey, file: File) => void;
  className?: string;
}) {
  const done = REGISTER_SLOTS.filter((s) => uploads[s.key]).length;

  return (
    <LrCard className={className}>
      <LrCardHead
        icon={Upload}
        tone="blue"
        label="Inputs"
        right={
          <LrChip tone={done === 0 ? 'bad' : 'neutral'}>
            {done} of {REGISTER_SLOTS.length}
          </LrChip>
        }
      />
      <ul className="m-0 list-none p-0">
        {REGISTER_SLOTS.map((spec) => (
          <Slot
            key={spec.key}
            spec={spec}
            state={uploads[spec.key]}
            busy={busySlot === spec.key}
            error={errors?.[spec.key]}
            disabled={locked}
            onPick={(file) => onPick(spec.key, file)}
          />
        ))}
      </ul>
      <p className={cn(lr.small, 'border-t border-[var(--lr-raised)] px-4 py-2.5')}>
        {locked
          ? 'The period is closed. Reopen the inputs to change them.'
          : `Spreadsheets up to ${maxUploadSizeLabel()}: .xlsx, .xlsm or .csv. Each file is read as it uploads, so a sheet whose headings cannot be found is refused here rather than at the close.`}
      </p>
    </LrCard>
  );
}
