'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Download, Info, Lock, RotateCcw } from 'lucide-react';

import { ActDirectory, type DirectoryFile, type DirectoryFolder } from '@/components/labour-registers/ActDirectory';
import { AttestDialog } from '@/components/labour-registers/AttestDialog';
import { useAttest } from '@/components/labour-registers/use-attest';
import { AttendanceChoiceDialog } from '@/components/labour-registers/AttendanceChoiceDialog';
import { SphereCard } from '@/components/labour-registers/SphereCard';
import { ReopenDialog } from '@/components/labour-registers/ReopenDialog';
import { useBatchActions } from '@/components/labour-registers/use-batch-actions';
import { UploadCard, type SlotKey, type SlotState } from '@/components/labour-registers/UploadCard';
import { useRegisterUpload } from '@/components/labour-registers/use-register-upload';
import { LabourRegistersTheme } from '@/components/labour-registers/LabourRegistersTheme';
import { ProvenanceBar } from '@/components/labour-registers/ProvenanceBar';
import { ReadinessDialog } from '@/components/labour-registers/ReadinessDialog';
import { cn } from '@/lib/utils';
import { LrBanner, LrCard, LrHero, type LrStat } from '@/components/labour-registers/primitives';
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
  uploads: Partial<Record<SlotKey, SlotState>>;
  readiness: ReadinessSummary;
  sentence: string;
  /** The client this batch belongs to, printed on every register. */
  companyName?: string;
  /** The documents produced, so the directory lists what exists rather than what might. */
  documents?: Array<{
    id: string;
    formId: string;
    byteLength: number;
    format: string;
    status: string;
    attestedAt: string | null;
    signedByName: string;
    hasSignedCopy: boolean;
  }>;
  /** Registers that carry a day grid and so cannot be produced without attendance. */
  needsAttendance?: string[];
  /** True when the month has been stated fully present rather than uploaded. */
  attendanceAssumed?: boolean;
  /** Whose rules this establishment is under. Decides which registers exist at all. */
  sphere?: 'state' | 'central';
  /** How many central forms the sphere choice adds or removes for this period. */
  centralFormCount?: number;
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
  /* What exists, not what might. A folder listing files that were never produced is the
     version of this screen that told everybody the feature worked. */
  const byForm = new Map<string, BatchView['documents']>();
  for (const doc of view.documents ?? []) {
    const list = byForm.get(doc.formId) ?? [];
    list.push(doc);
    byForm.set(doc.formId, list);
  }

  return view.formsByAct.map(({ act, forms }, i) => ({
    act,
    tone: tones[i % tones.length],
    expected: forms.length,
    files: (forms.flatMap((form) =>
      /* Workbook first, printout second: the order somebody works in. */
      [...(byForm.get(form.id) ?? [])]
        .sort((a, b) => (a.format === b.format ? 0 : a.format === 'xlsx' ? -1 : 1))
        .map((doc) => ({
          name: `Form ${form.formNumber} - ${form.title} - ${stamp}.${doc.format}`,
          format: doc.format.toUpperCase(),
          href: `/api/labour-registers/download?document=${doc.id}`,
          documentId: doc.id,
          status: doc.status,
          attestedOn: doc.attestedAt,
          signedByName: doc.signedByName,
          signedHref: doc.hasSignedCopy
            ? `/api/labour-registers/download?document=${doc.id}&signed=1`
            : undefined,
          /* A signature goes on paper. The workbook is the working copy it came from. */
          signable: doc.format === 'pdf',
        })),
    ) as DirectoryFolder['files']),
  }));
}

export function BatchPage({
  view,
  shellBase,
  canPrepare = true,
  canAttest = false,
}: {
  view: BatchView;
  shellBase: string;
  /**
   * False in the client portal. A client may read a batch and never write to one, and the
   * controls must not be drawn rather than drawn and refused — a client pressing "Mark as
   * ready" and getting a 403 is a bug report. The write routes refuse them anyway; this is the
   * other half of the same rule.
   */
  canPrepare?: boolean;
  /**
   * Whether this person may put the firm's name to a register.
   *
   * Narrower than `canPrepare` on purpose, and separate for the same reason the rest of this
   * screen draws its controls by role: the attest route admits a firm-wide admin alone, and a
   * manager offered the button and then refused is a bug report rather than a boundary.
   */
  canAttest?: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  /* The printout is produced alongside the workbook by default, because the printout is what
     gets signed and an unsigned month is an unfinished one. It is a choice rather than a fixed
     behaviour: a preparer re-running a batch only to re-check a figure does not need both. */
  const [withPrintout, setWithPrintout] = useState(true);
  const [attesting, setAttesting] = useState<DirectoryFile | null>(null);
  const { uploads, busySlot, errors, upload } = useRegisterUpload(view.batchId, view.uploads);
  const actions = useBatchActions(view.batchId, view.companyName);
  const attestation = useAttest();

  const formats = (): Array<'xlsx' | 'pdf'> => (withPrintout ? ['xlsx', 'pdf'] : ['xlsx']);

  /* Where a readiness line's "fix this" link goes. The dialog has always taken an onFix and
     has never been given one, so every fix link has been invisible. */
  function goFix(to: 'uploads' | 'mapping' | 'employees') {
    setDialogOpen(false);
    if (to === 'uploads') {
      document.getElementById('lr-inputs')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const slot = to === 'employees' ? 'employees' : 'paysheet';
    window.location.href = `${shellBase}/labour-registers?batch=${view.batchId}&map=${slot}`;
  }
  const state = stateByCode(view.stateCode);
  const label = periodLabel(view.period.from, view.period.to);
  const registers = view.provenance?.registers;
  const fromStorage = view.provenance?.fromStorage;
  /* The paysheet is the roll, so its row count is the employee count. It comes from the live
     upload state rather than the server view, so it updates the moment a file is read. */
  const employees = uploads.paysheet?.rowCount;

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
              {canPrepare ? (
                <button
                  type="button"
                  onClick={() => setReopenOpen(true)}
                  disabled={actions.busy !== null}
                  className={lr.quiet}
                >
                  <RotateCcw className="size-4" strokeWidth={1.6} aria-hidden="true" />
                  Reopen inputs
                </button>
              ) : null}
              <a href={`/api/labour-registers/zip?batch=${view.batchId}`} className={lr.primary}>
                <Download className="size-4" strokeWidth={1.8} aria-hidden="true" />
                Download all
              </a>
            </>
          ) : canPrepare ? (
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              disabled={actions.busy !== null}
              className={lr.primary}
            >
              <Lock className="size-4" strokeWidth={1.8} aria-hidden="true" />
              {actions.busy === 'closing' ? 'Closing…' : actions.busy === 'generating' ? 'Generating…' : 'Mark as ready'}
            </button>
          ) : null
        }
      />

      {actions.error ? (
        <LrBanner icon={AlertCircle} tone="bad">
          {actions.error}
        </LrBanner>
      ) : null}

      {actions.outcome ? (
        <LrBanner icon={Info} tone={actions.outcome.blocked.length > 0 ? 'warn' : 'ok'}>
          {actions.outcome.built > 0
            ? `${actions.outcome.built} registers built`
            : 'Nothing needed building'}
          {actions.outcome.fromStorage > 0 ? `, ${actions.outcome.fromStorage} served from storage` : ''}.
          {actions.outcome.blocked.length > 0
            ? ` ${actions.outcome.blocked.length} could not be produced: ${actions.outcome.blocked
                .slice(0, 2)
                .map((b) => b.reason)
                .join(' ')}`
            : ''}
          {actions.outcome.deferred.length > 0
            ? ` ${actions.outcome.deferred.length} use a form shape that is not built yet.`
            : ''}
          {actions.outcome.suppressed.length > 0
            ? ` ${actions.outcome.suppressed.length} were not produced because the firm has recorded that they do not apply: ${actions.outcome.suppressed
                .slice(0, 2)
                .map((x) => x.reason)
                .join(' ')}`
            : ''}
        </LrBanner>
      ) : null}

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

          {/* The inputs come before the registers, because that is the order of the work and
              because an empty directory makes no sense until somebody has seen why it is
              empty. Once the period is locked the card goes read-only rather than away: what
              was uploaded is part of what the registers were built from. */}
          <div id="lr-inputs" />
          <UploadCard
            uploads={uploads}
            busySlot={busySlot}
            errors={errors}
            locked={view.locked || !canPrepare}
            /* Column reconciliation is the firm's work. A client sees what was uploaded and
               never how it was mapped. */
            mapHref={
              canPrepare
                ? (slot) => `${shellBase}/labour-registers?batch=${view.batchId}&map=${slot}`
                : undefined
            }
            /* The missing-attendance notice sits on the Attendance row, next to the file it asks for,
               not in a banner at the top of the page. */
            notes={
              !view.locked && canPrepare && !uploads.attendance && (view.needsAttendance?.length ?? 0) > 0
                ? {
                    attendance: (
                      <>
                        <span className="font-semibold">No attendance sheet for this period.</span>{' '}
                        {view.attendanceAssumed
                          ? 'The month is recorded as fully present. Upload a sheet to replace that.'
                          : `${view.needsAttendance!.length} ${view.needsAttendance!.length === 1 ? 'register carries' : 'registers carry'} a column per day and cannot be produced without one.`}{' '}
                        <button type="button" onClick={() => setAttendanceOpen(true)} className={`${lr.link} align-baseline`}>
                          {view.attendanceAssumed ? 'Change how it was recorded' : 'Decide how to handle it'}
                        </button>
                      </>
                    ),
                  }
                : undefined
            }
            onPick={upload}
          />

          <ActDirectory
            folders={foldersFor(view)}
            onAttest={canAttest ? (file) => setAttesting(file) : undefined}
          />

          {canPrepare && !view.locked ? (
            <div className="flex items-start gap-2.5 rounded-[var(--lr-radius-card)] border border-[var(--lr-line)] bg-[var(--lr-surface)] px-4 py-3">
              <input
                id="lr-with-printout"
                type="checkbox"
                checked={withPrintout}
                onChange={(e) => setWithPrintout(e.target.checked)}
                className="mt-0.5 size-4 flex-none"
              />
              <div className="min-w-0">
                <label
                  htmlFor="lr-with-printout"
                  className="block text-[13px] font-semibold text-[var(--lr-ink)]"
                >
                  Produce the signing copy as well
                </label>
                <p className={cn(lr.small, 'm-0 mt-0.5')}>
                  A PDF per register, laid out for A4 with the signature block the rules call for. It is the
                  copy that gets printed, signed and scanned back — the workbook is the working copy.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="flex min-w-[260px] flex-[0_1_318px] flex-col gap-3">
          <LrCard className="p-4">
            <h2 className={`${lr.headLabel} m-0`}>
              {view.locked ? 'Why nothing was rebuilt' : 'What the cache key is'}
            </h2>
            <p className="m-0 mt-2.5 text-[13px] leading-relaxed text-[var(--lr-muted)]">
              The batch is keyed by client, state, period and a hash of the mapped inputs. While the key does not
              move, the stored files answer.
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
              Change a mapping or re-upload a sheet and the key moves — then, and only then, the forms affected are
              rebuilt.
            </p>
          </LrCard>


          {view.locked ? (
            <LrBanner icon={Info} tone="info">
              Old versions are never deleted. Retention runs to five years under the codes; this product keeps them
              beyond that as a conservative default rather than deleting on a schedule.
            </LrBanner>
          ) : null}
        </aside>
      </div>

      <ReadinessDialog
        open={dialogOpen}
        summary={view.readiness}
        sentence={view.sentence}
        busy={actions.busy === 'closing' || actions.busy === 'generating'}
        onCancel={() => setDialogOpen(false)}
        onFix={goFix}
        onConfirm={(summary) => {
          setDialogOpen(false);
          void actions.closeAndGenerate(summary, formats());
        }}
      />

      <AttestDialog
        open={attesting !== null}
        fileName={attesting?.name ?? ''}
        downloadHref={attesting?.href}
        busy={attestation.busy}
        error={attestation.error}
        onCancel={() => {
          setAttesting(null);
          attestation.clearError();
        }}
        onConfirm={async ({ file, signedByName }) => {
          if (!attesting?.documentId) return;
          const ok = await attestation.attest({ documentId: attesting.documentId, file, signedByName });
          if (ok) setAttesting(null);
        }}
      />

      <AttendanceChoiceDialog
        open={attendanceOpen}
        periodLabel={label}
        blockedForms={view.needsAttendance ?? []}
        busy={actions.busy === 'generating'}
        onCancel={() => setAttendanceOpen(false)}
        onUpload={() => {
          setAttendanceOpen(false);
          document.getElementById('lr-inputs')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}
        onConfirmAssume={(weekOff) => {
          setAttendanceOpen(false);
          void actions.assumeAttendance(weekOff);
        }}
      />

      <ReopenDialog
        open={reopenOpen}
        periodLabel={label}
        registers={registers}
        busy={actions.busy === 'reopening'}
        onCancel={() => setReopenOpen(false)}
        onConfirm={(reason) => {
          setReopenOpen(false);
          void actions.reopen(reason);
        }}
      />
    </LabourRegistersTheme>
  );
}
