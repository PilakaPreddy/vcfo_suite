'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, CheckCheck, FileSpreadsheet, MapPin, Printer, TriangleAlert } from 'lucide-react';

import { regimeNote, stateByCode, statesForPicker } from '@/data/labour-registers/states';
import {
  formsByAct,
  formsFor,
  monthPeriod,
  needsAttendanceGrid,
  regimeSummary,
  retentionYears,
} from '@/lib/labour-registers/catalogue';
import { IndiaMap, IndiaMapLegend, type MapState } from '@/components/labour-registers/IndiaMap';
import { LabourRegistersTheme } from '@/components/labour-registers/LabourRegistersTheme';
import { LrBanner, LrCard, LrCardHead, LrChip, LrHero, type LrStat } from '@/components/labour-registers/primitives';
import { lr, statusTone } from '@/components/labour-registers/theme';

/**
 * LABOUR REGISTERS — the state and period picker, and the catalogue of what is due.
 *
 * The jurisdiction is picked on a map of India, with a list of the same states beside it. Both
 * read the same rows, so they cannot disagree, and the list is the keyboard and screen-reader
 * path: the small jurisdictions (Delhi, Chandigarh, Goa, Sikkim, Puducherry, the islands) are
 * a few pixels across at page scale and are high-volume compliance states, so the map alone
 * would make the most-used targets the hardest to hit. What the geometry does and does not
 * depict, and its licence, are documented in `src/data/labour-registers/india-outline.ts`.
 *
 * The screen is styled with the feature's own tokens rather than Spectrum's — see
 * `src/components/labour-registers/theme.ts` for why that fork exists and what deleting it
 * would take.
 *
 * A client component, and it has to be one. It reads the catalogue, which is pure data, so
 * there is nothing to fetch and no spinner to show — but it hands Lucide icons to client
 * components, and a function cannot cross the server-to-client boundary, so rendering this as a
 * server component throws at request time. A unit test does not catch it (jsdom renders
 * everything as plain React, with no boundary); `npm run e2e:smoke` does.
 */

/** `?state=` and `?period=` carry the choice across a refresh. */
export interface LabourRegistersPageProps {
  shellBase: string;
  stateCode?: string;
  /** `YYYY-MM`. */
  period?: string;
  /** False on the client portal, where the page is download-only. */
  canPrepare?: boolean;
  /**
   * The clients this preparer can open a batch for. Opening one needs a client as well as a
   * state, and this screen is state-first, so the client is chosen here.
   */
  engagements?: Array<{ id: string; name: string }>;
  /**
   * The states this client actually has an establishment in. When given, the map shows those at
   * full strength and fades the rest, so a client with one establishment is not asked to find
   * it among thirty-six. Left out, every configured state reads as reachable.
   */
  relevantStates?: string[];
}

function parsePeriod(period: string | undefined): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(period ?? '');
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month >= 1 && month <= 12) return { year, month };
  }
  /* Registers are prepared for the month that has just closed. */
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { year: prev.getUTCFullYear(), month: prev.getUTCMonth() + 1 };
}

const MONTH_NAMES = [
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

/** The six status words, and nothing else (Spectrum rule 5, which the fork keeps). */
function formStatus(hasPeriodClosed: boolean): string {
  return hasPeriodClosed ? 'Not started' : 'Upcoming';
}

export function LabourRegistersPage({
  shellBase,
  stateCode,
  period,
  canPrepare = true,
  relevantStates,
  engagements = [],
}: LabourRegistersPageProps) {
  const router = useRouter();
  const [engagementId, setEngagementId] = useState(engagements[0]?.id ?? '');
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const states = statesForPicker();
  const selected = stateByCode(stateCode ?? '') ?? states.find((s) => s.configured)!;
  const { year, month } = parsePeriod(period);
  const periodRange = monthPeriod(year, month);
  const periodLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  const forms = selected.configured ? formsFor(selected.code, periodRange) : [];
  const byAct = formsByAct(forms);
  const summary = regimeSummary(selected, periodRange);
  const closed = periodRange.to < new Date().toISOString().slice(0, 10);
  const status = formStatus(closed);

  const href = (code: string) =>
    `${shellBase}/labour-registers?state=${code}&period=${year}-${String(month).padStart(2, '0')}`;

  const configured = states.filter((s) => s.configured);
  /* The figures are counted from the same catalogue the list below reads, so nothing on this
     page can claim a number the rows do not support. */
  const catalogueTotal = configured.reduce((n, s) => n + formsFor(s.code, periodRange).length, 0);

  const relevant = relevantStates ? new Set(relevantStates) : null;
  const tiles: MapState[] = states.map((state) => ({
    code: state.code,
    configured: state.configured,
    relevant: relevant ? relevant.has(state.code) : true,
    count: state.configured ? formsFor(state.code, periodRange).length : undefined,
    status,
  }));

  /**
   * Open the batch for this client, state and period.
   *
   * It has to be a request rather than a link, because the batch may not exist yet: the route
   * finds or creates it and hands back an id, which is what `?batch=` needs. Before this
   * existed the button was a link back to this same page, which is why pressing it appeared to
   * do nothing at all.
   */
  async function open() {
    if (!engagementId || opening) return;
    setOpening(true);
    setOpenError('');
    try {
      const res = await fetch('/api/labour-registers/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          engagementId,
          stateCode: selected.code,
          periodFrom: periodRange.from,
          periodTo: periodRange.to,
        }),
      });
      if (!res.ok) {
        setOpenError(res.status === 404 ? 'That client is not yours to open.' : 'Could not open the batch.');
        return;
      }
      const { batchId } = (await res.json()) as { batchId: string };
      router.push(`${shellBase}/labour-registers?batch=${batchId}`);
    } catch {
      setOpenError('Could not reach the server.');
    } finally {
      setOpening(false);
    }
  }

  const stats: LrStat[] = [
    { label: 'States live', value: configured.length },
    { label: 'Forms in catalogue', value: catalogueTotal },
    { label: `Due in ${selected.name}`, value: forms.length, tone: forms.length ? 'warn' : 'neutral' },
    { label: 'Retention', value: retentionYears(forms) ? `${retentionYears(forms)} yr` : '—' },
  ];

  return (
    <LabourRegistersTheme className="flex flex-col gap-3">
      <LrHero
        eyebrow={`Labour registers · ${periodLabel}`}
        title="Pick a state to open its registers"
        blurb="Forms differ by state; the inputs do not. Click a state on the map or choose it from the list beside it."
        stats={stats}
      />

      {summary.hybrid && selected.configured ? (
        <LrBanner icon={AlertTriangle} tone="warn">
          <span className="font-semibold">Both stacks apply this month.</span> {regimeNote(selected)} The figures
          below count the state and central forms separately so nothing is filed short.
        </LrBanner>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {/* The jurisdiction panel: the map, and the same states as a list. */}
        <LrCard className="min-w-0 flex-[999_1_520px]">
          <LrCardHead
            icon={MapPin}
            tone="reg"
            label="Jurisdiction"
            right={<LrChip tone="neutral">{configured.length} configured</LrChip>}
          />

          <div className="flex flex-wrap items-start gap-4 px-4 pb-4 pt-3.5">
            <div className="min-w-[280px] flex-[0_0_352px]">
              <IndiaMap states={tiles} selected={selected.code} href={href} focusRelevant={Boolean(relevant)} />
              <IndiaMapLegend className="mt-2.5" />
            </div>

            <div className="flex min-w-0 flex-[999_1_220px] flex-col gap-2">
              <div className={lr.headLabel}>Or choose from the list</div>

              <ul className="m-0 list-none overflow-hidden rounded-[var(--lr-radius-card)] border border-[var(--lr-line)] p-0">
                {configured.map((state) => {
                  const isSelected = state.code === selected.code;
                  const count = formsFor(state.code, periodRange).length;
                  return (
                    <li key={state.code} className="border-t border-[var(--lr-raised)] first:border-t-0">
                      <Link
                        href={href(state.code)}
                        aria-current={isSelected ? 'page' : undefined}
                        className={`flex items-center gap-2.5 px-3 py-2.5 ${isSelected ? 'bg-[var(--lr-primary-soft)]' : ''}`}
                      >
                        <span
                          aria-hidden="true"
                          className="size-2 flex-none rounded-[3px]"
                          style={{ background: isSelected ? 'var(--lr-primary)' : 'var(--lr-reg)' }}
                        />
                        <span className="min-w-0 flex-grow text-[13px] font-semibold text-[var(--lr-ink)]">
                          {state.name}
                        </span>
                        {isSelected ? (
                          <LrChip className="bg-[var(--lr-surface)] text-[var(--lr-primary-deep)]">Selected</LrChip>
                        ) : (
                          <span className="text-[12px] tabular-nums text-[var(--lr-muted)]">{count} forms</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
                {states.length > configured.length ? (
                  <li className="flex items-center gap-2.5 border-t border-[var(--lr-raised)] bg-[var(--lr-canvas)] px-3 py-2.5">
                    <span aria-hidden="true" className="size-2 flex-none rounded-[3px] bg-[var(--lr-faint)]" />
                    <span className="min-w-0 flex-grow text-[13px] font-semibold text-[var(--lr-muted)]">
                      {states.length - configured.length} other states and union territories
                    </span>
                    <span className="text-[12px] text-[var(--lr-faint)]">Not configured</span>
                  </li>
                ) : null}
              </ul>

              {selected.configured && canPrepare ? (
                <div className="mt-1 flex flex-col gap-2">
                  <label htmlFor="lr-client" className={lr.headLabel}>
                    For which client
                  </label>
                  <select
                    id="lr-client"
                    value={engagementId}
                    onChange={(e) => setEngagementId(e.target.value)}
                    className={`${lr.select} w-full`}
                  >
                    {engagements.length === 0 ? <option value="">No clients you can prepare for</option> : null}
                    {engagements.map((eng) => (
                      <option key={eng.id} value={eng.id}>
                        {eng.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={open} disabled={!engagementId || opening} className={lr.primary}>
                    {opening ? 'Opening…' : `Open ${selected.name} · ${periodLabel}`}
                    <ArrowRight className="size-4" strokeWidth={2} aria-hidden="true" />
                  </button>
                  {openError ? (
                    <p className="m-0 text-[13px] text-[var(--lr-bad)]" role="alert">
                      {openError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </LrCard>

        {/* The side rail. */}
        <aside className="flex min-w-[260px] flex-[0_1_318px] flex-col gap-3">
          {selected.configured && needsAttendanceGrid(forms) ? (
            <LrCard>
              <LrCardHead icon={Printer} tone="warn" label="This month needs" />
              <ul className="m-0 flex list-none flex-col gap-2 px-4 py-3 text-[13px] leading-relaxed text-[var(--lr-muted)]">
                <li>A paysheet, and a daily attendance sheet for the muster rolls.</li>
                <li>
                  An overtime report, where overtime was worked. Employee addresses and guardian names come from the
                  client record, not from a sheet.
                </li>
                <li className="text-[var(--lr-faint)]">
                  Registers may be kept electronically, but a printout has to be produced to an inspector on demand,
                  so every batch also builds a print bundle.
                </li>
              </ul>
            </LrCard>
          ) : null}

          <LrCard>
            <LrCardHead icon={CheckCheck} tone="ok" label="What this period holds" />
            <ul className="m-0 list-none p-0">
              {[
                { label: 'State forms', value: summary.stateForms },
                { label: 'Central forms', value: summary.centralForms },
                { label: 'Acts', value: byAct.length },
              ].map((row, i) => (
                <li
                  key={row.label}
                  className={`flex items-center gap-2.5 px-4 py-2.5 ${i > 0 ? 'border-t border-[var(--lr-raised)]' : ''}`}
                >
                  <span className="min-w-0 flex-grow text-[13px] text-[var(--lr-ink)]">{row.label}</span>
                  <span className={`${lr.fieldValue} flex-none`}>{row.value}</span>
                </li>
              ))}
            </ul>
          </LrCard>

          {canPrepare ? null : (
            <LrBanner icon={TriangleAlert} tone="info">
              Downloads only. Column mapping, generation and sign-off stay with the SBC team.
            </LrBanner>
          )}
        </aside>
      </div>

      {/* The catalogue itself, act by act. */}
      {!selected.configured ? (
        <LrCard className="px-5 py-8 text-center">
          <p className={`${lr.body} m-0`}>
            {selected.name} has no form catalogue yet. Pick a configured state, or ask for this one to be added.
          </p>
        </LrCard>
      ) : (
        byAct.map(({ act, forms: actForms }) => (
          <LrCard key={act}>
            <LrCardHead
              icon={FileSpreadsheet}
              tone="blue"
              label={act}
              right={<LrChip tone="neutral">{`${actForms.length} form${actForms.length === 1 ? '' : 's'}`}</LrChip>}
            />
            <ul className="m-0 list-none p-0">
              {actForms.map((form, i) => (
                <li
                  key={form.id}
                  className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-[var(--lr-raised)]' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[var(--lr-ink)]">
                      Form {form.formNumber} — {form.title}
                    </div>
                    <div className={`${lr.code} mt-0.5 text-[12px] text-[var(--lr-muted)]`}>
                      {form.rule} · {form.period} · {form.columns.length} columns
                      {form.verification.status === 'unverified'
                        ? ' · not yet checked against the prescribed form'
                        : ''}
                    </div>
                  </div>
                  <LrChip tone={statusTone(status)}>{status}</LrChip>
                </li>
              ))}
            </ul>
          </LrCard>
        ))
      )}
    </LabourRegistersTheme>
  );
}
