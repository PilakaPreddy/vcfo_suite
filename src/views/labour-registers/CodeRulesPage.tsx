'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Scale } from 'lucide-react';

import { LabourRegistersTheme } from '@/components/labour-registers/LabourRegistersTheme';
import { LrBanner, LrCard, LrCardHead, LrChip, LrHero } from '@/components/labour-registers/primitives';
import { lr } from '@/components/labour-registers/theme';
import type { LrTone } from '@/components/labour-registers/theme';
import { useCodeRules } from '@/components/labour-registers/use-code-rules';
import { cn } from '@/lib/utils';

/**
 * WHERE EACH STATE HAS GOT TO — the four codes, state by state.
 *
 * The product used to hold one value per state for this, and that value could not be true of a
 * state at all. The four codes were commenced together on 21 November 2025 and the states are
 * notifying rules under them separately, so a state can have final Wage Code rules and nothing
 * under the OSH Code. One lumped value answered the question wrongly in both directions.
 *
 * It decides which registers a client owes, which is why it is a screen rather than a note:
 * the wage registers follow the Wage Code's rules, the muster roll and the accident register
 * follow the OSH Code's, and a state that has notified one and not the other is on a split
 * regime. That is the ordinary case rather than an edge.
 *
 * Two things this screen insists on, both because of what it is for:
 *
 *  - **Unknown is not none.** A cell nobody has looked at says so. "We looked and there are no
 *    rules" and "nobody looked" are different answers, and only one of them is a reason to
 *    stop worrying.
 *  - **Every entry carries a source and a date, and both are printed.** A tracker nobody dates
 *    is a tracker nobody trusts, and an entry with no source looks settled when it is not. The
 *    route refuses one without them.
 */

export type Stage = 'notified' | 'draft' | 'none' | 'unknown';

export interface CodeRuleCell {
  code: string;
  title: string;
  short: string;
  stage: Stage;
  on: string;
  source: string;
  lastVerified: string;
  note: string;
  fromFirm: boolean;
}

export interface CodeRulesStateRow {
  code: string;
  name: string;
  zone: string;
  configured: boolean;
  cells: CodeRuleCell[];
  /** The one-line reading of the two codes that govern registers. */
  regimeLine: string;
  hybrid: boolean;
  /** The oldest check across the four, so staleness is visible at a glance. */
  oldestCheck: string;
}

export interface CodeRulesView {
  states: CodeRulesStateRow[];
  counts: { configured: number; hybrid: number; unknown: number; fromFirm: number };
  canWrite: boolean;
}

const STAGE_WORDS: Record<Stage, { label: string; tone: LrTone }> = {
  notified: { label: 'Notified', tone: 'ok' },
  draft: { label: 'Draft', tone: 'warn' },
  none: { label: 'None', tone: 'info' },
  unknown: { label: 'Not checked', tone: 'neutral' },
};

export function CodeRulesPage({ view, shellBase }: { view: CodeRulesView; shellBase: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [configuredOnly, setConfiguredOnly] = useState(true);
  const actions = useCodeRules();

  const states = configuredOnly ? view.states.filter((s) => s.configured) : view.states;

  return (
    <LabourRegistersTheme className="flex flex-col gap-4">
      <Link href={`${shellBase}/labour-registers`} className={lr.link}>
        <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden={true} />
        Labour registers
      </Link>

      <LrHero
        eyebrow="The codes, state by state"
        title="Where each state has got to"
        blurb="The four codes were commenced together and the states are notifying rules under them separately. Which ones a state has notified decides which registers its clients owe, so this is recorded per code rather than per state."
        stats={[
          { label: 'States configured', value: view.counts.configured },
          { label: 'On a split regime', value: view.counts.hybrid, tone: view.counts.hybrid ? 'warn' : 'neutral' },
          { label: 'Not checked', value: view.counts.unknown },
          { label: 'Recorded by us', value: view.counts.fromFirm, tone: view.counts.fromFirm ? 'blue' : 'neutral' },
        ]}
      />

      <LrBanner tone="warn" icon={AlertTriangle}>
        Nothing here came from a gazette. The research pass of 28 October 2026 could not open one, and trackers
        disagreed on Telangana and Haryana. Every cell shows where it was read and when somebody last looked, and
        anything you record replaces it without a deploy.
      </LrBanner>

      {actions.error ? (
        <LrBanner tone="bad" icon={AlertTriangle}>
          {actions.error}
        </LrBanner>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setConfiguredOnly(true)}
          className={cn(configuredOnly ? lr.secondary : lr.quiet, 'h-9 px-3.5 text-[13px]')}
        >
          States we produce for
        </button>
        <button
          type="button"
          onClick={() => setConfiguredOnly(false)}
          className={cn(!configuredOnly ? lr.secondary : lr.quiet, 'h-9 px-3.5 text-[13px]')}
        >
          Every state
        </button>
      </div>

      <LrCard>
        <LrCardHead
          icon={Scale}
          label="The four codes"
          right={<span className={lr.small}>{states.length} states</span>}
        />

        <ul className="m-0 list-none p-0">
          {states.map((state) => (
            <li key={state.code} className="border-t border-[var(--lr-raised)] first:border-t-0">
              <button
                type="button"
                onClick={() => setOpen(open === state.code ? null : state.code)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5 text-left"
              >
                <span className="min-w-[180px] flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-[var(--lr-ink)]">{state.name}</span>
                    <span className={cn(lr.code, 'text-[var(--lr-faint)]')}>{state.code}</span>
                    {state.hybrid ? <LrChip tone="warn">Split regime</LrChip> : null}
                  </span>
                  <span className={cn(lr.small, 'mt-0.5 block')}>
                    {state.oldestCheck ? `Last checked ${state.oldestCheck}` : 'Never checked'}
                  </span>
                </span>

                <span className="flex flex-wrap gap-1.5">
                  {state.cells.map((cell) => (
                    <LrChip key={cell.code} tone={STAGE_WORDS[cell.stage].tone}>
                      {cell.short}: {STAGE_WORDS[cell.stage].label}
                    </LrChip>
                  ))}
                </span>
              </button>

              {open === state.code ? (
                <div className="border-t border-[var(--lr-raised)] bg-[var(--lr-canvas)] px-5 py-4">
                  <p className="m-0 text-[13px] leading-relaxed text-[var(--lr-muted)]">{state.regimeLine}</p>

                  <ul className="m-0 mt-3.5 flex list-none flex-col gap-2.5 p-0">
                    {state.cells.map((cell) => (
                      <li
                        key={cell.code}
                        className="rounded-[var(--lr-radius-card)] border border-[var(--lr-line)] bg-[var(--lr-surface)] p-3.5"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold text-[var(--lr-ink)]">{cell.title}</span>
                          <LrChip tone={STAGE_WORDS[cell.stage].tone}>{STAGE_WORDS[cell.stage].label}</LrChip>
                          {cell.on ? <span className={cn(lr.code, 'text-[12px] text-[var(--lr-faint)]')}>{cell.on}</span> : null}
                          {cell.fromFirm ? <LrChip tone="blue">Ours</LrChip> : null}
                        </div>
                        <p className={cn(lr.small, 'm-0 mt-1')}>{cell.source}</p>
                        {cell.lastVerified ? (
                          <p className={cn(lr.small, 'm-0 mt-0.5')}>Last checked {cell.lastVerified}</p>
                        ) : null}
                        {cell.note ? (
                          <p className="m-0 mt-1 text-[13px] leading-5 text-[var(--lr-ink-2)]">{cell.note}</p>
                        ) : null}

                        {view.canWrite ? (
                          <CellForm
                            stateCode={state.code}
                            cell={cell}
                            busy={actions.busy === `${state.code}:${cell.code}`}
                            onSave={(input) => void actions.save(input)}
                            onClear={() => void actions.clear(state.code, cell.code)}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </LrCard>
    </LabourRegistersTheme>
  );
}

/** Recording one state's position under one code. Source and date are not optional. */
function CellForm({
  stateCode,
  cell,
  busy,
  onSave,
  onClear,
}: {
  stateCode: string;
  cell: CodeRuleCell;
  busy: boolean;
  onSave: (input: {
    stateCode: string;
    code: string;
    stage: 'notified' | 'draft' | 'none';
    notifiedOn?: string;
    source?: string;
    note?: string;
  }) => void;
  onClear: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [stage, setStage] = useState<'notified' | 'draft' | 'none'>(
    cell.stage === 'unknown' ? 'none' : cell.stage,
  );
  const [on, setOn] = useState(cell.on);
  const [source, setSource] = useState(cell.fromFirm ? cell.source : '');
  const [note, setNote] = useState(cell.note);

  if (!editing) {
    return (
      <div className="mt-2.5 flex flex-wrap gap-3">
        <button type="button" onClick={() => setEditing(true)} className={lr.link}>
          {cell.fromFirm ? 'Change this' : 'Record what you know'}
        </button>
        {cell.fromFirm ? (
          <button type="button" disabled={busy} onClick={onClear} className={lr.link}>
            Clear, back to the research reading
          </button>
        ) : null}
      </div>
    );
  }

  const blocked = !source.trim() || (stage !== 'none' && !on.trim());

  return (
    <div className="mt-3 border-t border-[var(--lr-raised)] pt-3">
      <div className="flex flex-wrap gap-2">
        {(['notified', 'draft', 'none'] as const).map((key) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            onClick={() => setStage(key)}
            className={cn(stage === key ? lr.secondary : lr.quiet, 'h-9 px-3.5 text-[13px]')}
          >
            {STAGE_WORDS[key].label}
          </button>
        ))}
      </div>

      <label className="mt-3 block">
        <span className={lr.fieldLabel}>Date of the notification or the draft</span>
        <input
          value={on}
          onChange={(e) => setOn(e.target.value)}
          disabled={busy || stage === 'none'}
          placeholder="2026-05-08"
          className={cn(lr.select, 'mt-1 h-10 w-full')}
        />
      </label>

      <label className="mt-3 block">
        <span className={lr.fieldLabel}>Where you read it</span>
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          disabled={busy}
          placeholder="Karnataka Gazette, Part IVA, 8 May 2026"
          className={cn(lr.select, 'mt-1 h-10 w-full')}
        />
      </label>

      <label className="mt-3 block">
        <span className={lr.fieldLabel}>Anything else worth knowing</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
          placeholder="Registers under rule 51 only; the returns rules are still awaited."
          className={cn(lr.select, 'mt-1 h-10 w-full')}
        />
      </label>

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={blocked || busy}
          onClick={() => {
            onSave({
              stateCode,
              code: cell.code,
              stage,
              notifiedOn: on.trim() || undefined,
              source: source.trim() || undefined,
              note: note.trim() || undefined,
            });
            setEditing(false);
          }}
          className={cn(lr.primary, 'h-10 text-[14px]')}
        >
          {busy ? 'Recording…' : 'Record it'}
        </button>
        <button type="button" onClick={() => setEditing(false)} className={cn(lr.quiet, 'h-10 text-[14px]')}>
          Cancel
        </button>
        {blocked ? (
          <span className={cn(lr.small, 'text-[var(--lr-bad)]')}>
            {!source.trim() ? 'Say where you read it.' : 'Give the date.'}
          </span>
        ) : null}
      </div>
    </div>
  );
}
