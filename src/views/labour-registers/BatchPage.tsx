'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Info, Lock, RotateCcw } from 'lucide-react';

import { ActDirectory, type DirectoryFolder } from '@/components/labour-registers/ActDirectory';
import { LabourRegistersTheme } from '@/components/labour-registers/LabourRegistersTheme';
import { ProvenanceBar } from '@/components/labour-registers/ProvenanceBar';
import { ReadinessDialog } from '@/components/labour-registers/ReadinessDialog';
import { LrBanner, LrCard, LrCardHead, LrChip, LrHero, type LrStat } from '@/components/labour-registers/primitives';
import { lr } from '@/components/labour-registers/theme';
import type { ReadinessSummary } from '@/lib/labour-registers/readiness';
import { stateByCode } from '@/data/labour-registers/states';

/**
 * One batch: one client, one state, one period.
 *
 * The screen is ordered the way the work is. The provenance bar first, because the question
 * anyone opens this page with is "what happened to this month", and the actions sit in its
 * footer for the same reason — reopening or downloading both follow from those facts. Then
 * what the batch cost, which is where the caching design finally becomes visible. Then the
 * registers, laid out as the folders they download as.
 *
 * A client component, and it must be: it hands Lucide icons to other client components, and a
 * function cannot cross the server-to-client boundary. The route assembles the data and passes
 * plain values. `src/views/labour-registers/load-batch.ts` does that assembly.
 */

export interface BatchView {
  batchId: string;
  stateCode: string;
  period: { from: string; to: string };
  status: string;
  locked: boolean;
  provenance: {
    periodFrom: string;
    periodTo: string;
    status: string;
    markedReadyAt: string | null;
    markedReadyByName: string | null;
    generatedAt: string | null;
    registers: number;
    fromStorage: number;
    reopenCount: number;
    reopenReason: string;
  } | null;
  acts: number;
  formsByAct: Array<{ act: string; forms: Array<{ id: string; formNumber: string; title: string; rule: string }> }>;
  uploads: Partial<Record<'paysheet' | 'attendance' | 'overtime' | 'employees', { rowCount: number; fileName: string }>>;
  readiness: ReadinessSummary;
  sentence: string;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function periodLabel(from: string, to: string): string {
  const a = new Date(from);
  const b = new Date(to);
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) {
    return `${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
  }
  return `${from} to ${to}`;
}

/** "Sep-2026", as the file names inside the zip are stamped. */
function fileStamp(from: string): string {
  const d = new Date(from);
  return `${SHORT[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

/**
 * The zip's layout, from the catalogue.
 *
 * Only a locked batch has files; before that the folders are known and empty, which is the
 * honest state and the one the screen shows. Everything builds as XLSX — the print bundle is a
 * separate artefact and is not claimed here until the generator reports it.
 */
function foldersFor(view: BatchView): DirectoryFolder[] {
  const stamp = fileStamp(view.period.from);
  const tones = ['reg', 'ok', 'blue', 'warn', 'info', 'bad'] as const;
  return view.formsByAct.map(({ act, forms }, i) => ({
    act,
    tone: tones[i % tones.length],
    expected: forms.length,
    files: view.locked
      ? forms.map((form) => ({
          name: `Form ${form.formNumber} - ${form.title} - ${stamp}.xlsx`,
          format: 'XLSX',
        }))
      : [],
  }));
}

export function BatchPage({ view, shellBase }: { view: BatchView; shellBase: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const state = stateByCode(view.stateCode);
  const label = periodLabel(view.period.from, view.period.to);
  const registers = view.provenance?.registers;
  const fromStorage = view.provenance?.fromStorage;
  const employees = view.uploads.paysheet?.rowCount;

  const stats: LrStat[] = view.locked
    ? [
        {
          label: 'Done, from storage',
          value:
            registers && fromStorage !== undefined
              ? `${fromStorage} of ${registers}`
              : (registers ?? '—'),
          tone: 'ok',
        },
        { label: 'Acts', value: view.acts },
        { label: 'Employees', value: employees ?? '—' },
        { label: 'Reopened', value: view.provenance?.reopenCount ?? 0 },
      ]
    : [
        { label: 'Forms due', value: view.formsByAct.reduce((n, a) => n + a.forms.length, 0) },
        { label: 'Acts', value: view.acts },
        { label: 'Employees on the paysheet', value: employees ?? '—' },
        {
          label: 'Blockers',
          value: view.readiness.lines.filter((l) => l.kind === 'blocked').length,
          tone: view.readiness.canClose ? 'neutral' : 'bad',
        },
      ];

  return (
    <LabourRegistersTheme className="flex flex-col gap-3">
      {/* Breadcrumb. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Link href={`${shellBase}/labour-registers`} className={lr.link}>
          <ArrowLeft className="size-3.5" strokeWidth={2} aria-hidden="true" />
          Labour registers
        </Link>
        <span className="text-[12px] text-[var(--lr-faint)]">/</span>
        <span className="text-[12px] font-semibold text-[var(--lr-ink)]">
          {state?.name ?? view.stateCode} · {label}
        </span>
        <div className="flex-grow" />
        <span className={`${lr.code} text-[12px] text-[var(--lr-muted)]`}>batch {view.batchId.slice(0, 8)}</span>
      </div>

      <ProvenanceBar
        periodLabel={label}
        status={view.status}
        markedReadyAt={view.provenance?.markedReadyAt}
        markedReadyByName={view.provenance?.markedReadyByName}
        generatedAt={view.provenance?.generatedAt}
        employees={employees}
        registers={registers}
        acts={view.acts}
        fromStorage={fromStorage}
        reopenCount={view.provenance?.reopenCount ?? 0}
        reopenReason={view.provenance?.reopenReason}
        actions={
          view.locked ? (
            <>
              <button type="button" className={lr.quiet}>
                <RotateCcw className="size-4" strokeWidth={1.6} aria-hidden="true" />
                Reopen inputs
              </button>
              <button type="button" className={lr.primary}>
                <Download className="size-4" strokeWidth={1.8} aria-hidden="true" />
                Download all
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setDialogOpen(true)} className={lr.primary}>
              <Lock className="size-4" strokeWidth={1.8} aria-hidden="true" />
              Mark as ready
            </button>
          )
        }
      />

      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-3">
          <LrHero
            eyebrow={`${state?.name ?? view.stateCode} · ${label}`}
            title={
              view.locked
                ? registers && fromStorage === registers
                  ? `${registers} registers generated, all served from storage`
                  : `${registers ?? view.formsByAct.reduce((n, a) => n + a.forms.length, 0)} registers generated`
                : 'Nothing is generated yet'
            }
            blurb={
              view.locked
                ? 'Built once. Every request since has been a download of the stored file — no compute, no new version.'
                : 'The registers are built when the inputs are marked ready, and not before. Until then the folders below are empty.'
            }
            stats={stats}
            statsBeside={false}
            action={
              view.locked ? (
                <button type="button" className={lr.primary}>
                  <Download className="size-4" strokeWidth={2} aria-hidden="true" />
                  Download act-wise zip
                </button>
              ) : undefined
            }
          />

          <ActDirectory folders={foldersFor(view)} />
        </div>

        <aside className="flex min-w-[260px] flex-[0_1_318px] flex-col gap-3">
          <LrCard className="p-4">
            <h2 className={`${lr.headLabel} m-0`}>
              {view.locked ? 'Why nothing was rebuilt' : 'What the cache key is'}
            </h2>
            <p className="m-0 mt-2.5 text-[13px] leading-relaxed text-[var(--lr-muted)]">
              The batch is keyed by client, state, period and a hash of the mapped inputs plus the checklist run.
              While the key does not move, the stored files answer.
            </p>
            <div
              className={`${lr.code} mt-3 rounded-[var(--lr-radius-chip)] border border-[var(--lr-line)] bg-[var(--lr-canvas)] px-3 py-2.5 text-[12px] leading-[1.7] text-[var(--lr-muted)]`}
            >
              <div>state = {view.stateCode}</div>
              <div>period = {view.period.from.slice(0, 7)}</div>
              <div>forms = {view.formsByAct.reduce((n, a) => n + a.forms.length, 0)}</div>
              <div>acts = {view.acts}</div>
              <div>status = {view.status}</div>
            </div>
            <p className="m-0 mt-2.5 text-[12px] leading-relaxed text-[var(--lr-faint)]">
              Change a mapping, re-upload a sheet or tick a new head and the key moves — then, and only then, the
              forms affected are rebuilt.
            </p>
          </LrCard>

          <LrCard>
            <LrCardHead label="Inputs on file" />
            <ul className="m-0 list-none p-0">
              {(['paysheet', 'attendance', 'overtime', 'employees'] as const).map((slot, i) => {
                const upload = view.uploads[slot];
                return (
                  <li
                    key={slot}
                    className={`flex items-center gap-2.5 px-4 py-2.5 ${i > 0 ? 'border-t border-[var(--lr-raised)]' : ''}`}
                  >
                    <span className="min-w-0 flex-grow text-[13px] capitalize text-[var(--lr-ink)]">{slot}</span>
                    {upload ? (
                      <span className="text-[12px] tabular-nums text-[var(--lr-muted)]">
                        {upload.rowCount} rows
                      </span>
                    ) : (
                      <LrChip tone="neutral">Not uploaded</LrChip>
                    )}
                  </li>
                );
              })}
            </ul>
          </LrCard>

          {view.locked ? (
            <LrBanner icon={Info} tone="info">
              Old versions are never deleted. Retention runs to five years under the codes, and a register may not be
              destroyed after it unless it has been properly transferred.
            </LrBanner>
          ) : null}
        </aside>
      </div>

      <ReadinessDialog
        open={dialogOpen}
        summary={view.readiness}
        sentence={view.sentence}
        onCancel={() => setDialogOpen(false)}
        onConfirm={() => setDialogOpen(false)}
      />
    </LabourRegistersTheme>
  );
}
