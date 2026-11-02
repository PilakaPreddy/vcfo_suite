import Link from 'next/link';
import { AlertTriangle, FileSpreadsheet, Printer, ScrollText, ShieldCheck } from 'lucide-react';

import { DashHero } from '@/components/dash/DashHero';
import { DashSection } from '@/components/dash/DashSection';
import { EmptyState } from '@/components/ui/empty-state';
import { Chip } from '@/components/ui/spectrum-chip';
import { regimeNote, stateByCode, statesForPicker } from '@/data/labour-registers/states';
import { formsByAct, formsFor, monthPeriod, needsAttendanceGrid, regimeSummary, retentionYears } from '@/lib/labour-registers/catalogue';

/**
 * LABOUR REGISTERS — the state and period picker, and the catalogue of what is due.
 *
 * The jurisdiction control is a grouped list, not a map. A clickable India map was the first
 * design and the research argued it out: the only formal study found on region selectors with
 * more than thirty options favoured a dropdown on every measure; India's smallest targets
 * (Delhi, Chandigarh, Goa, Sikkim, Puducherry, the union territories) are also high-volume
 * compliance jurisdictions, so the most-used targets would be the hardest to hit, and WCAG 2.2
 * target sizes cannot be met at form scale. The decisive point was legal rather than usable:
 * Survey of India remains the arbiter of maps depicting state and national boundaries, apps
 * have been removed from stores over boundary depiction, and every freely licensed India map
 * checked was either stale (the one first used here still showed Jammu and Kashmir with no
 * Ladakh) or barred from commercial use. Not shipping a boundary map removes that whole risk
 * at no cost to the person using the page.
 *
 * A server component: it reads the catalogue, which is pure data, so there is nothing to fetch
 * and no spinner to show.
 */

/** `?state=` and `?period=` carry the choice across a refresh. */
export interface LabourRegistersPageProps {
  shellBase: string;
  stateCode?: string;
  /** `YYYY-MM`. */
  period?: string;
  /** False on the client portal, where the page is download-only. */
  canPrepare?: boolean;
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

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The six status words, and nothing else (Spectrum rule 5). */
function formStatus(hasPeriodClosed: boolean): string {
  return hasPeriodClosed ? 'Not started' : 'Upcoming';
}

export function LabourRegistersPage({ shellBase, stateCode, period, canPrepare = true }: LabourRegistersPageProps) {
  const states = statesForPicker();
  const selected = stateByCode(stateCode ?? '') ?? states.find((s) => s.configured)!;
  const { year, month } = parsePeriod(period);
  const periodRange = monthPeriod(year, month);
  const periodLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  const forms = selected.configured ? formsFor(selected.code, periodRange) : [];
  const byAct = formsByAct(forms);
  const summary = regimeSummary(selected, periodRange);
  const closed = periodRange.to < new Date().toISOString().slice(0, 10);

  const href = (code: string) => `${shellBase}/labour-registers?state=${code}&period=${year}-${String(month).padStart(2, '0')}`;

  return (
    <div className="flex flex-col gap-3">
      <DashHero
        title="Labour registers"
        subtitle={`${selected.name} · ${periodLabel}`}
        stats={[
          { label: 'Forms due', value: forms.length, icon: ScrollText },
          { label: 'State forms', value: summary.stateForms },
          { label: 'Central forms', value: summary.centralForms },
          { label: 'Retention', value: retentionYears(forms) || '—', of: 'years' },
        ]}
      />

      {summary.hybrid && selected.configured ? (
        <div className="flex items-start gap-3 rounded-md border-2 border-line bg-warning-soft p-4">
          <AlertTriangle className="mt-0.5 size-4 flex-none text-warning" aria-hidden="true" />
          <div className="text-[13px] leading-relaxed text-warning">
            <span className="font-medium">Both stacks apply this month.</span> {regimeNote(selected)} The figures
            below count the state and central forms separately so nothing is filed short.
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_318px]">
        <div className="flex flex-col gap-3">
          {!selected.configured ? (
            <DashSection title="Not configured yet" headIcon={{ icon: ScrollText, tone: 'blue' }}>
              <EmptyState title={`${selected.name} has no form catalogue yet. Pick a configured state, or ask for this one to be added.`} />
            </DashSection>
          ) : (
            byAct.map(({ act, forms: actForms }) => (
              <DashSection
                key={act}
                title={act}
                meta={`${actForms.length} form${actForms.length === 1 ? '' : 's'}`}
                headIcon={{ icon: FileSpreadsheet, tone: 'blue' }}
              >
                <ul className="divide-y divide-line-soft">
                  {actForms.map((form) => (
                    <li key={form.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-ink">
                          Form {form.formNumber} — {form.title}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-ink-faint">
                          {form.rule} · {form.period} · {form.columns.length} columns
                          {form.verification.status === 'unverified' ? ' · not yet checked against the prescribed form' : ''}
                        </div>
                      </div>
                      <Chip fixed>{formStatus(closed)}</Chip>
                    </li>
                  ))}
                </ul>
              </DashSection>
            ))
          )}
        </div>

        <aside className="flex flex-col gap-3">
          <DashSection title="Jurisdiction" headIcon={{ icon: ShieldCheck, tone: 'blue' }}>
            <ul className="divide-y divide-line-soft">
              {states.map((state) => (
                <li key={state.code}>
                  {state.configured ? (
                    <Link
                      href={href(state.code)}
                      aria-current={state.code === selected.code ? 'page' : undefined}
                      className={`flex items-center gap-2.5 py-2.5 text-[13px] ${
                        state.code === selected.code ? 'font-medium text-brand-text' : 'text-ink'
                      }`}
                    >
                      <span className="size-2 flex-none rounded-bar bg-reg-labour" aria-hidden="true" />
                      <span className="min-w-0 flex-1">{state.name}</span>
                      <span className="font-mono text-[11px] text-ink-faint">{formsFor(state.code, periodRange).length}</span>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2.5 py-2.5 text-[13px] text-ink-faint">
                      <span className="size-2 flex-none rounded-bar bg-line-strong" aria-hidden="true" />
                      <span className="min-w-0 flex-1">{state.name}</span>
                      <span className="text-[11px]">Not configured</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </DashSection>

          {selected.configured && needsAttendanceGrid(forms) ? (
            <DashSection title="This month needs" headIcon={{ icon: Printer, tone: 'blue' }}>
              <ul className="flex flex-col gap-2 py-1 text-[13px] text-ink-muted">
                <li>A paysheet, and a daily attendance sheet for the muster rolls.</li>
                <li>
                  An overtime report, if the payroll checklist has overtime on. Employee addresses and guardian
                  names come from the client record, not from a sheet.
                </li>
                <li className="text-ink-faint">
                  Registers may be kept electronically, but a printout has to be produced to an inspector on
                  demand, so every batch also builds a print bundle.
                </li>
              </ul>
            </DashSection>
          ) : null}

          {canPrepare ? null : (
            <div className="rounded-md border-2 border-line bg-surface-raised p-4 text-[12.5px] text-ink-muted">
              Downloads only. Column mapping, generation and sign-off stay with the SBC team.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
