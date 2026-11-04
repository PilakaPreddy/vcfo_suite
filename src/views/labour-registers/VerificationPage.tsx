'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, BadgeCheck, EyeOff, FileSearch, Paperclip, ShieldQuestion } from 'lucide-react';

import { LabourRegistersTheme } from '@/components/labour-registers/LabourRegistersTheme';
import { LrBanner, LrCard, LrCardHead, LrChip, LrHero } from '@/components/labour-registers/primitives';
import { lr } from '@/components/labour-registers/theme';
import type { LrTone } from '@/components/labour-registers/theme';
import { useVerificationActions } from '@/components/labour-registers/use-verification-actions';
import type { Regime } from '@/data/labour-registers/types';
import { cn } from '@/lib/utils';

/**
 * WHAT WE HAVE CHECKED — the firm's own verdict on each form's layout.
 *
 * Every register this product generates prints a line at the head of the sheet saying how far
 * its layout has been checked. Until now that line came from a TypeScript file: a developer's
 * claim, changed only by a deploy. It is the wrong shape for what it describes. Whether Form
 * XIX matches what the Punjab rules prescribe is a company secretary's judgement, made with
 * the gazette open, and it should not wait for a release.
 *
 * So this screen is the other end of that notice. What is recorded here is printed verbatim on
 * every sheet the form produces from then on, with the date it was recorded — not a date
 * somebody typed, because a hand-typed date on a statutory document is a date that can be
 * wrong.
 *
 * **It is keyed on the form, not on a client.** A form's layout is a property of the law. The
 * same question has the same answer for every client in that state, and asking it per
 * engagement would mean asking it thirty times and getting thirty answers.
 *
 * Three things the design deliberately does not do:
 *
 *  - It does not let a disputed form be hidden by marking it unverified. Suppression is its
 *    own switch with its own reason, so that choosing not to produce a statutory register is a
 *    decision somebody made and signed, not a side effect of a dropdown.
 *  - It does not accept a dispute without a reason. The reason is the sheet's loudest line; an
 *    empty one prints a warning that names nothing.
 *  - It does not rank or score. Four words, and what each was checked against.
 *
 * A client component: it hands Lucide icons to its own children, and a function cannot cross
 * the server-to-client boundary.
 */

export type VerificationStatus = 'unverified' | 'disputed' | 'checked-against-sample' | 'gazette-verified';

export interface VerificationRow {
  formId: string;
  formNumber: string;
  title: string;
  act: string;
  rule: string;
  regime: Regime;
  jurisdiction: string;
  jurisdictionName: string;
  authorityLine: string;
  status: VerificationStatus;
  label: string;
  on: string | null;
  against: string;
  disputedBecause: string;
  open: string[];
  suppressed: boolean;
  suppressedReason: string;
  evidenceFileName: string | null;
  /** True when a firm verdict governs, rather than the catalogue's own claim. */
  fromFirm: boolean;
  catalogueStatus: VerificationStatus;
}

export interface VerificationView {
  rows: VerificationRow[];
  counts: {
    total: number;
    disputed: number;
    unverified: number;
    sampled: number;
    gazette: number;
    suppressed: number;
    fromFirm: number;
  };
  canWrite: boolean;
  /** Clearing a verdict back to the catalogue's claim is an admin's or a manager's call. */
  canClear: boolean;
}

const STATUS_WORDS: Record<VerificationStatus, { label: string; tone: LrTone; blurb: string }> = {
  'gazette-verified': {
    label: 'Gazette verified',
    tone: 'ok',
    blurb: 'The layout has been compared with the gazette notification or the prescribed form itself.',
  },
  'checked-against-sample': {
    label: 'Checked against a sample',
    tone: 'info',
    blurb: 'Compared with a filed register or a form somebody has used, not with the gazette.',
  },
  unverified: {
    label: 'Unverified',
    tone: 'warn',
    blurb: 'Built from the rules as read, and not compared with anything. The register still prints.',
  },
  disputed: {
    label: 'Disputed',
    tone: 'bad',
    blurb: 'A source we trust says this layout is wrong. The register prints, carrying a red notice.',
  },
};

const FILTERS = [
  { key: 'attention' as const, label: 'Needs attention' },
  { key: 'all' as const, label: 'Every form' },
  { key: 'firm' as const, label: 'Recorded by us' },
  { key: 'suppressed' as const, label: 'Not produced' },
];

function statusChip(row: VerificationRow) {
  if (row.suppressed) return <LrChip tone="neutral">Not produced</LrChip>;
  const word = STATUS_WORDS[row.status];
  return <LrChip tone={word.tone}>{word.label}</LrChip>;
}

export function VerificationPage({ view, shellBase }: { view: VerificationView; shellBase: string }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('attention');
  const [openForm, setOpenForm] = useState<string | null>(null);
  const actions = useVerificationActions();

  const rows = useMemo(() => {
    switch (filter) {
      case 'all':
        return view.rows;
      case 'firm':
        return view.rows.filter((r) => r.fromFirm);
      case 'suppressed':
        return view.rows.filter((r) => r.suppressed);
      default:
        return view.rows.filter((r) => !r.suppressed && (r.status === 'disputed' || r.status === 'unverified'));
    }
  }, [filter, view.rows]);

  return (
    <LabourRegistersTheme className="flex flex-col gap-4">
      <Link href={`${shellBase}/labour-registers`} className={lr.link}>
        <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden={true} />
        Labour registers
      </Link>

      <LrHero
        eyebrow="Layout verification"
        title="What we have checked"
        blurb="Every register prints a line saying how far its layout has been checked. This is where that line is written. It takes effect on the next generation of that form — no deploy, and nothing else is rebuilt."
        stats={[
          { label: 'Forms', value: view.counts.total },
          { label: 'Disputed', value: view.counts.disputed, tone: view.counts.disputed ? 'bad' : 'neutral' },
          { label: 'Unverified', value: view.counts.unverified, tone: view.counts.unverified ? 'warn' : 'neutral' },
          { label: 'Gazette verified', value: view.counts.gazette, tone: view.counts.gazette ? 'ok' : 'neutral' },
          { label: 'Not produced', value: view.counts.suppressed },
        ]}
      />

      {view.counts.gazette === 0 ? (
        <LrBanner tone="warn" icon={ShieldQuestion}>
          Not one form has been compared with the gazette yet. Every register produced so far carries a notice
          saying so, which is honest but is not a verified register. The catalogue was built from the rules as
          read, and no entry in it has been confirmed against a primary source.
        </LrBanner>
      ) : null}

      {actions.error ? (
        <LrBanner tone="bad" icon={AlertTriangle}>
          {actions.error}
        </LrBanner>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(filter === f.key ? lr.secondary : lr.quiet, 'h-9 px-3.5 text-[13px]')}
          >
            {f.label}
          </button>
        ))}
      </div>

      <LrCard>
        <LrCardHead
          icon={FileSearch}
          label={filter === 'attention' ? 'Needs attention' : 'Forms'}
          right={<span className={lr.small}>{rows.length} of {view.counts.total}</span>}
        />

        {rows.length === 0 ? (
          <p className={cn(lr.body, 'm-0 px-5 py-6')}>
            {filter === 'attention'
              ? 'Nothing is disputed or unverified. Every form has been checked against something.'
              : 'Nothing here yet.'}
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {rows.map((row) => (
              <li key={row.formId} className="border-t border-[var(--lr-raised)] first:border-t-0">
                <button
                  type="button"
                  onClick={() => setOpenForm(openForm === row.formId ? null : row.formId)}
                  className="flex w-full items-start gap-3 px-5 py-3.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-[var(--lr-ink)]">
                        Form {row.formNumber}
                      </span>
                      <span className={cn(lr.code, 'text-[var(--lr-faint)]')}>{row.jurisdictionName}</span>
                      {row.fromFirm ? <LrChip tone="blue">Our verdict</LrChip> : null}
                      {row.evidenceFileName ? (
                        <Paperclip className="size-3.5 text-[var(--lr-faint)]" strokeWidth={1.8} aria-hidden={true} />
                      ) : null}
                    </span>
                    <span className={cn(lr.small, 'mt-0.5 block')}>{row.title}</span>
                    <span className={cn(lr.small, 'mt-0.5 block text-[var(--lr-muted)]')}>
                      {row.rule} · {row.act}
                    </span>
                    {row.status === 'disputed' && row.disputedBecause ? (
                      <span className="mt-1.5 block text-[13px] leading-5 text-[var(--lr-bad)]">
                        {row.disputedBecause}
                      </span>
                    ) : null}
                    {row.suppressed && row.suppressedReason ? (
                      <span className={cn(lr.small, 'mt-1.5 block')}>Not produced: {row.suppressedReason}</span>
                    ) : null}
                  </span>
                  <span className="flex flex-none flex-col items-end gap-1">
                    {statusChip(row)}
                    {row.on ? <span className={cn(lr.small, 'tabular-nums')}>{row.on}</span> : null}
                  </span>
                </button>

                {openForm === row.formId ? (
                  <VerdictForm
                    row={row}
                    busy={actions.busy === row.formId}
                    canWrite={view.canWrite}
                    canClear={view.canClear}
                    onSave={async (input) => {
                      const ok = await actions.save(input);
                      if (ok) setOpenForm(null);
                    }}
                    onClear={() => actions.clear(row.formId)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </LrCard>
    </LabourRegistersTheme>
  );
}

/**
 * The editor for one form's verdict.
 *
 * Opens on whatever governs today, firm verdict or catalogue claim, so that recording a check
 * is an edit rather than a blank form. The authority line is shown because it is what the
 * sheet prints above the table, and checking a layout means checking that line as much as the
 * columns.
 */
function VerdictForm({
  row,
  busy,
  canWrite,
  canClear,
  onSave,
  onClear,
}: {
  row: VerificationRow;
  busy: boolean;
  canWrite: boolean;
  canClear: boolean;
  onSave: (input: {
    formId: string;
    status: VerificationStatus;
    against?: string;
    disputedBecause?: string;
    openItems?: string[];
    suppressed?: boolean;
    suppressedReason?: string;
    evidence?: File | null;
    evidenceFileName?: string | null;
  }) => void;
  onClear: () => void;
}) {
  const [status, setStatus] = useState<VerificationStatus>(row.status);
  const [against, setAgainst] = useState(row.against);
  const [because, setBecause] = useState(row.disputedBecause);
  const [open, setOpen] = useState(row.open.join(', '));
  const [suppressed, setSuppressed] = useState(row.suppressed);
  const [suppressedReason, setSuppressedReason] = useState(row.suppressedReason);
  const [evidence, setEvidence] = useState<File | null>(null);

  const word = STATUS_WORDS[status];
  const blocked =
    (status === 'disputed' && !because.trim()) || (suppressed && !suppressedReason.trim()) || !canWrite;

  return (
    <div className="border-t border-[var(--lr-raised)] bg-[var(--lr-canvas)] px-5 py-4">
      <p className={cn(lr.small, 'm-0')}>
        Printed above the table: <span className="font-semibold text-[var(--lr-ink)]">{row.authorityLine}</span>
      </p>

      <fieldset className="mt-3.5 border-0 p-0">
        <legend className={cn(lr.fieldLabel, 'mb-1.5')}>How far this layout has been checked</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STATUS_WORDS) as VerificationStatus[]).map((key) => (
            <button
              key={key}
              type="button"
              disabled={!canWrite || busy}
              onClick={() => setStatus(key)}
              className={cn(
                status === key ? lr.secondary : lr.quiet,
                'h-9 px-3.5 text-[13px]',
                !canWrite && 'opacity-60',
              )}
            >
              {STATUS_WORDS[key].label}
            </button>
          ))}
        </div>
        <p className={cn(lr.small, 'm-0 mt-1.5')}>{word.blurb}</p>
      </fieldset>

      <label className="mt-3.5 block">
        <span className={lr.fieldLabel}>What it was checked against</span>
        <input
          value={against}
          onChange={(e) => setAgainst(e.target.value)}
          disabled={!canWrite || busy}
          placeholder="Punjab Gazette notification of 8 May 2026, rule 5"
          className={cn(lr.select, 'mt-1 h-10 w-full')}
        />
      </label>

      {status === 'disputed' ? (
        <label className="mt-3.5 block">
          <span className={lr.fieldLabel}>What the dispute is — printed on the register verbatim</span>
          <textarea
            value={because}
            onChange={(e) => setBecause(e.target.value)}
            disabled={!canWrite || busy}
            rows={2}
            placeholder="The rules text appears to prescribe a register of eating houses under this number, not a muster roll."
            className={cn(lr.select, 'mt-1 h-auto w-full py-2 leading-5')}
          />
        </label>
      ) : null}

      <label className="mt-3.5 block">
        <span className={lr.fieldLabel}>What is still open, separated by commas</span>
        <input
          value={open}
          onChange={(e) => setOpen(e.target.value)}
          disabled={!canWrite || busy}
          placeholder="signatory, seal, page initialling, column order"
          className={cn(lr.select, 'mt-1 h-10 w-full')}
        />
      </label>

      <label className="mt-3.5 block">
        <span className={lr.fieldLabel}>
          The gazette page or form it rests on
          {row.evidenceFileName ? ` — ${row.evidenceFileName} is attached` : ''}
        </span>
        <input
          type="file"
          accept=".pdf,.docx,.png,.jpg,.jpeg,.webp"
          disabled={!canWrite || busy}
          onChange={(e) => setEvidence(e.target.files?.[0] ?? null)}
          className={cn(lr.small, 'mt-1 block w-full')}
        />
      </label>

      <div className="mt-4 rounded-[var(--lr-radius-card)] border border-[var(--lr-line)] bg-[var(--lr-surface)] p-3.5">
        <div className="flex items-start gap-2.5">
          <input
            id={`suppress-${row.formId}`}
            type="checkbox"
            checked={suppressed}
            disabled={!canWrite || busy}
            onChange={(e) => setSuppressed(e.target.checked)}
            className="mt-0.5 size-4 flex-none"
          />
          <div className="min-w-0">
            <label
              htmlFor={`suppress-${row.formId}`}
              className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--lr-ink)]"
            >
              <EyeOff className="size-3.5" strokeWidth={1.8} aria-hidden={true} />
              This register is not one we owe
            </label>
            <p className={cn(lr.small, 'm-0 mt-0.5')}>
              A different decision from an unsure layout. The form stops being produced, and the reason is
              reported in its place so the gap can be accounted for.
            </p>
          </div>
        </div>
        {suppressed ? (
          <input
            value={suppressedReason}
            onChange={(e) => setSuppressedReason(e.target.value)}
            disabled={!canWrite || busy}
            placeholder="Superseded by the combined register under rule 27 of the Wage Code Rules."
            className={cn(lr.select, 'mt-2.5 h-10 w-full')}
          />
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={blocked || busy}
          onClick={() =>
            onSave({
              formId: row.formId,
              status,
              against: against.trim() || undefined,
              disputedBecause: because.trim() || undefined,
              openItems: open
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
              suppressed,
              suppressedReason: suppressedReason.trim() || undefined,
              evidence,
              evidenceFileName: row.evidenceFileName,
            })
          }
          className={lr.primary}
        >
          <BadgeCheck className="size-4" strokeWidth={1.8} aria-hidden={true} />
          {busy ? 'Recording…' : 'Record this'}
        </button>

        {row.fromFirm && canClear ? (
          <button type="button" disabled={busy} onClick={onClear} className={lr.quiet}>
            Clear, back to “{STATUS_WORDS[row.catalogueStatus].label.toLowerCase()}”
          </button>
        ) : null}

        {status === 'disputed' && !because.trim() ? (
          <span className={cn(lr.small, 'text-[var(--lr-bad)]')}>Say what the dispute is before recording it.</span>
        ) : null}
        {suppressed && !suppressedReason.trim() ? (
          <span className={cn(lr.small, 'text-[var(--lr-bad)]')}>Say why this register is not produced.</span>
        ) : null}
      </div>
    </div>
  );
}
