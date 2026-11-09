'use client';

import { useMemo } from 'react';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { sumSeries } from '@/lib/budget/engine';
import { TAX_PRESETS, newId, withTaxDefaults, zero12, type AssetBlock, type TaxSettings } from '@/lib/budget/model';
import { advanceTaxSchedule, computeTax, type Instalment, type TaxCalc } from '@/lib/budget/tax';
import { cn } from '@/lib/utils';
import { Block, Field, NumberCell, SelectCell, TextCell } from '../cells';
import { inr, people } from '../format';
import { GRID, GridScroll, MonthHeads, STICKY, TD, TD_NAME, TH } from '../grid-parts';
import type { Ready } from '../types';
import { useTaxActuals } from '../variance/use-variance';

const ACTUAL_CELL = 'bg-positive-soft';
const BASIS_TONE: Record<Instalment['basis'], ChipTone> = { Actual: 'ok', 'Part actual': 'warn', Budget: 'idle' };
const plain = (n: number) => Math.round(n).toLocaleString('en-IN');

/**
 * Income tax and advance tax on the Finance costs tab: the assumptions, the add-backs, insurance on
 * a prepaid basis, depreciation under both Acts, the computation for the year and the four
 * instalments. Inputs live in the budget settings, so they follow the Settings tab's edit rights.
 */
export function AdvanceTax({ ready }: { ready: Ready }) {
  const { settings, result, rows, b } = ready;
  const canEdit = ready.canEdit('settings');
  const t = withTaxDefaults(settings.tax);
  const set = (patch: Partial<TaxSettings>) => b.patchSettings({ tax: { ...t, ...patch } });
  const on = t.mode === 'cost_plus';
  const taxActuals = useTaxActuals(ready);
  const budget = result.taxDetail;
  const latest = useMemo(() => (taxActuals ? computeTax(settings, rows, result, taxActuals) : budget), [taxActuals, settings, rows, result, budget]);
  const schedule = useMemo(() => advanceTaxSchedule(settings, rows, result, taxActuals), [settings, rows, result, taxActuals]);
  const approvedLabels = result.labels.filter((_, i) => latest.actualMonths[i]);
  const actualNote = approvedLabels.length ? `Green months use approved actuals from the Variance tab (${approvedLabels.join(', ')}).` : 'No approved actuals yet, so every figure is budget.';

  return (
    <>
      <Block
        title="Income tax assumptions"
        hint={on ? 'Cost-plus company. Revenue is the cost base plus the mark-up, so profit before tax is the mark-up on cost. The rates follow the Income-tax Act 2025, in force from 1 April 2026. An estimate, not tax advice.' : 'Income tax is off for this client. Choose “Yes, cost plus” to work out income tax and advance tax.'}
      >
        <div className="grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-7">
          <Field label="Include in budget">
            <SelectCell label="Include income tax" blank={false} value={t.mode} disabled={!canEdit} options={[{ value: 'none', label: 'No' }, { value: 'cost_plus', label: 'Yes, cost plus' }]} onChange={(v) => set({ mode: v as TaxSettings['mode'] })} />
          </Field>
          <Field label="Preset">
            <SelectCell
              label="Tax preset"
              value={TAX_PRESETS.some((p) => p.key === t.preset) ? t.preset : ''}
              disabled={!canEdit || !on}
              options={TAX_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
              onChange={(key) => {
                const p = TAX_PRESETS.find((x) => x.key === key);
                if (p) set({ preset: p.key, ratePct: p.ratePct, surchargePct: p.surchargePct, surchargeBySlab: p.surchargeBySlab, cessPct: p.cessPct });
              }}
            />
          </Field>
          <Field label="Mark-up %">
            <NumberCell label="Mark-up percent" percent value={t.markupPct} disabled={!canEdit || !on} onChange={(v) => set({ markupPct: v ?? 0 })} />
          </Field>
          <Field label="Tax rate %">
            <NumberCell label="Tax rate" percent value={t.ratePct} disabled={!canEdit || !on} onChange={(v) => set({ ratePct: v ?? 0, preset: '' })} />
          </Field>
          <Field label="Surcharge">
            <SelectCell label="Surcharge basis" blank={false} value={t.surchargeBySlab ? 'slab' : 'fixed'} disabled={!canEdit || !on} options={[{ value: 'fixed', label: 'Fixed %' }, { value: 'slab', label: 'By slab (0 / 7 / 12%)' }]} onChange={(v) => set({ surchargeBySlab: v === 'slab', preset: '' })} />
          </Field>
          <Field label="Surcharge %">
            <NumberCell label="Surcharge" percent value={t.surchargeBySlab ? latest.surchargePct : t.surchargePct} disabled={!canEdit || !on || t.surchargeBySlab} onChange={(v) => set({ surchargePct: v ?? 0, preset: '' })} />
          </Field>
          <Field label="Cess %">
            <NumberCell label="Cess" percent value={t.cessPct} disabled={!canEdit || !on} onChange={(v) => set({ cessPct: v ?? 0, preset: '' })} />
          </Field>
        </div>
        {on ? (
          <p className="border-t border-line-soft px-4 py-2.5 text-[13px] text-ink">
            Effective tax rate: <strong>{(latest.effectiveRate * 100).toFixed(3)}%</strong> ({latest.ratePct}% × {(1 + latest.surchargePct / 100).toFixed(2)} surcharge × {(1 + latest.cessPct / 100).toFixed(2)} cess).
            {t.surchargeBySlab ? ' The surcharge follows the taxable income: 0% up to ₹1 crore, 7% up to ₹10 crore, 12% above.' : ''}
          </p>
        ) : null}
      </Block>

      {on ? (
        <>
          <GratuityBlock ready={ready} latest={latest} note={actualNote} />
          <InsuranceBlock ready={ready} latest={latest} t={t} set={set} canEdit={canEdit} note={actualNote} />
          <AssetBlocks ready={ready} latest={latest} t={t} set={set} canEdit={canEdit} />
          <Computation budget={budget} latest={latest} hasActuals={Boolean(taxActuals)} />
          <Instalments schedule={schedule} />
        </>
      ) : null}
    </>
  );
}

function SeriesRow({ label, series, actual, strong, tag }: { label: string; series: number[]; actual?: boolean[]; strong?: boolean; tag?: string }) {
  return (
    <tr>
      <td className={cn(TD_NAME, STICKY, strong && 'bg-surface-sunken font-semibold')}>
        <span className="flex items-center gap-2">
          {label} {tag ? <span className="text-[11px] font-normal text-ink-muted">{tag}</span> : null}
        </span>
      </td>
      {series.map((v, i) => (
        <td key={i} className={cn(TD, strong && 'bg-surface-sunken font-semibold', actual?.[i] && ACTUAL_CELL)}>
          {inr(v)}
        </td>
      ))}
      <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{inr(sumSeries(series))}</td>
    </tr>
  );
}

function GratuityBlock({ ready, latest, note }: { ready: Ready; latest: TaxCalc; note: string }) {
  const { result } = ready;
  const total = latest.gratuity.map((g, i) => g + latest.leave[i]);
  return (
    <Block title="Gratuity and leave encashment" hint={`Provisions are allowed for tax only when paid, so they are added back. The budget comes from the gratuity % and leave % in Settings, applied to basic pay. ${note}`}>
      <GridScroll>
        <table className={GRID}>
          <thead>
            <tr>
              <th className={cn(TH, STICKY, 'z-[2] min-w-[240px] text-left')}>Provision</th>
              <MonthHeads labels={result.labels} />
              <th className={cn(TH, 'min-w-[100px]')}>Year</th>
            </tr>
          </thead>
          <tbody>
            <SeriesRow label="Gratuity used in tax" series={latest.gratuity} actual={latest.actualMonths} />
            <SeriesRow label="Leave encashment used in tax" series={latest.leave} actual={latest.actualMonths} />
            <SeriesRow label="Total added back" series={total} strong />
          </tbody>
        </table>
      </GridScroll>
    </Block>
  );
}

function InsuranceBlock({ ready, latest, t, set, canEdit, note }: { ready: Ready; latest: TaxCalc; t: Required<TaxSettings>; set: (p: Partial<TaxSettings>) => void; canEdit: boolean; note: string }) {
  const { result } = ready;
  return (
    <Block title="Insurance on a prepaid basis" hint={`The premium is paid in advance, so the cost base takes the cover of each month: closing headcount × premium per employee ÷ 12, in place of the insurance as booked. Leave both premiums at 0 to use the insurance as booked. ${note}`}>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:max-w-[560px]">
        <Field label="Group insurance, per employee per year">
          <NumberCell label="Group insurance premium" value={t.insuranceGroupPerYear} disabled={!canEdit} onChange={(v) => set({ insuranceGroupPerYear: v ?? 0 })} />
        </Field>
        <Field label="Workers comp, per employee per year">
          <NumberCell label="Workers comp premium" value={t.insuranceWcPerYear} disabled={!canEdit} onChange={(v) => set({ insuranceWcPerYear: v ?? 0 })} />
        </Field>
      </div>
      {latest.insuranceOn ? (
        <GridScroll>
          <table className={GRID}>
            <thead>
              <tr>
                <th className={cn(TH, STICKY, 'z-[2] min-w-[240px] text-left')}>Insurance</th>
                <MonthHeads labels={result.labels} />
                <th className={cn(TH, 'min-w-[100px]')}>Year</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={cn(TD_NAME, STICKY)}>Closing headcount</td>
                {latest.headcount.map((h, i) => (
                  <td key={i} className={cn(TD, latest.actualMonths[i] && ACTUAL_CELL)}>
                    {people(h)}
                  </td>
                ))}
                <td className={cn(TD, 'bg-surface-sunken')} />
              </tr>
              <SeriesRow label="Insurance on prepaid basis" tag="Headcount × premium ÷ 12" series={latest.insurancePrepaid} strong />
              <SeriesRow label="Insurance as booked or paid" tag="Group + workers comp" series={latest.insuranceBooked} actual={latest.actualMonths} />
              <SeriesRow label="Difference" series={latest.insurancePrepaid.map((p, i) => p - latest.insuranceBooked[i])} />
            </tbody>
          </table>
        </GridScroll>
      ) : null}
    </Block>
  );
}

function AssetBlocks({ ready, latest, t, set, canEdit }: { ready: Ready; latest: TaxCalc; t: Required<TaxSettings>; set: (p: Partial<TaxSettings>) => void; canEdit: boolean }) {
  const { result, settings } = ready;
  const blocks = t.assetBlocks;
  const patch = (i: number, p: Partial<AssetBlock>) => set({ assetBlocks: blocks.map((blk, at) => (at === i ? { ...blk, ...p } : blk)) });
  const lineOpts = settings.lines.filter((l) => !l.system).map((l) => ({ value: l.id, label: l.name }));
  const lineName = (id: string) => settings.lines.find((l) => l.id === id)?.name ?? id;
  const months = result.calendar.map((m) => m - 1);
  const total = (k: 'additionsTotal' | 'itDepreciation' | 'closingIt' | 'cosDepreciationTotal' | 'closingCos' | 'openingIt' | 'openingCos') => latest.blocks.reduce((a, blk) => a + blk[k], 0);

  return (
    <Block
      title="Fixed assets and depreciation"
      hint="Enter the opening written-down value of each block on the first day of the year from the client's books. Income-tax Act: block written-down value at the block rate; additions from October get half the rate (used for under 180 days). Companies Act 2013: written-down value at the rate from the useful life in Schedule II with a 5% residual value, by month from the month of addition. The cost base takes the Companies Act depreciation in place of the Master Budget depreciation line, and a linked line (for example Laptops) is capitalised, not expensed."
      footer={canEdit ? <button type="button" className="text-[13px] font-semibold text-brand hover:underline" onClick={() => set({ assetBlocks: [...blocks, { id: newId('blk'), name: '', itRatePct: 15, lifeYears: 5, openingIt: 0, openingCos: 0, linkLineId: '', additions: zero12() }] })}>Add block</button> : null}
    >
      <GridScroll>
        <table className={GRID}>
          <thead>
            <tr>
              <th className={cn(TH, STICKY, 'z-[2] min-w-[220px] text-left')}>Block of assets</th>
              <th className={cn(TH, 'min-w-[170px] text-left')}>Capitalised line</th>
              <th className={cn(TH, 'min-w-[70px]')}>IT Act rate %</th>
              <th className={cn(TH, 'min-w-[110px]')}>Opening WDV, IT Act</th>
              <th className={cn(TH, 'min-w-[100px]')}>Additions</th>
              <th className={cn(TH, 'min-w-[110px]')}>Depreciation, IT Act</th>
              <th className={cn(TH, 'min-w-[110px]')}>Closing WDV, IT Act</th>
              <th className={cn(TH, 'min-w-[80px]')}>Useful life, years</th>
              <th className={cn(TH, 'min-w-[80px]')}>Cos. Act WDV rate %</th>
              <th className={cn(TH, 'min-w-[110px]')}>Opening WDV, Cos. Act</th>
              <th className={cn(TH, 'min-w-[110px]')}>Depreciation, Cos. Act</th>
              <th className={cn(TH, 'min-w-[110px]')}>Closing WDV, Cos. Act</th>
              {canEdit ? <th className={TH} /> : null}
            </tr>
          </thead>
          <tbody>
            {blocks.map((blk, i) => {
              const r = latest.blocks[i];
              return (
                <tr key={blk.id}>
                  <td className={cn(TD_NAME, STICKY, 'p-0')}>
                    <TextCell label="Block name" value={blk.name} disabled={!canEdit} onChange={(v) => patch(i, { name: v })} />
                  </td>
                  <td className={cn(TD_NAME, 'p-0')}>
                    <SelectCell label="Capitalised line" value={blk.linkLineId} disabled={!canEdit} options={lineOpts} onChange={(v) => patch(i, { linkLineId: v })} />
                  </td>
                  <td className={cn(TD, 'p-0')}>
                    <NumberCell label="IT Act rate" percent value={blk.itRatePct} disabled={!canEdit} onChange={(v) => patch(i, { itRatePct: v ?? 0 })} />
                  </td>
                  <td className={cn(TD, 'p-0')}>
                    <NumberCell label="Opening WDV IT Act" value={blk.openingIt} disabled={!canEdit} onChange={(v) => patch(i, { openingIt: v ?? 0 })} />
                  </td>
                  <td className={cn(TD, 'bg-surface-sunken text-ink-muted')}>{inr(r?.additionsTotal ?? 0)}</td>
                  <td className={cn(TD, 'bg-surface-sunken text-ink-muted')}>{inr(r?.itDepreciation ?? 0)}</td>
                  <td className={cn(TD, 'bg-surface-sunken text-ink-muted')}>{inr(r?.closingIt ?? 0)}</td>
                  <td className={cn(TD, 'p-0')}>
                    <NumberCell label="Useful life" percent value={blk.lifeYears} disabled={!canEdit} onChange={(v) => patch(i, { lifeYears: v ?? 0 })} />
                  </td>
                  <td className={cn(TD, 'bg-surface-sunken text-ink-muted')}>{(r?.cosRatePct ?? 0).toFixed(2)}</td>
                  <td className={cn(TD, 'p-0')}>
                    <NumberCell label="Opening WDV Companies Act" value={blk.openingCos} disabled={!canEdit} onChange={(v) => patch(i, { openingCos: v ?? 0 })} />
                  </td>
                  <td className={cn(TD, 'bg-surface-sunken text-ink-muted')}>{inr(r?.cosDepreciationTotal ?? 0)}</td>
                  <td className={cn(TD, 'bg-surface-sunken text-ink-muted')}>{inr(r?.closingCos ?? 0)}</td>
                  {canEdit ? (
                    <td className={cn(TD_NAME, 'w-[1%] px-1')}>
                      <button type="button" className="h-7 rounded px-1.5 text-[12px] text-ink-muted hover:bg-hover" aria-label={`Remove ${blk.name || 'block'}`} onClick={() => set({ assetBlocks: blocks.filter((_, at) => at !== i) })}>
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
            <tr>
              <td className={cn(TD_NAME, STICKY, 'bg-surface-sunken font-semibold')}>Total</td>
              <td className={cn(TD_NAME, 'bg-surface-sunken')} />
              <td className={cn(TD, 'bg-surface-sunken')} />
              <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{inr(total('openingIt'))}</td>
              <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{inr(total('additionsTotal'))}</td>
              <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{inr(total('itDepreciation'))}</td>
              <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{inr(total('closingIt'))}</td>
              <td className={cn(TD, 'bg-surface-sunken')} />
              <td className={cn(TD, 'bg-surface-sunken')} />
              <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{inr(total('openingCos'))}</td>
              <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{inr(total('cosDepreciationTotal'))}</td>
              <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{inr(total('closingCos'))}</td>
              {canEdit ? <td className={cn(TD, 'bg-surface-sunken')} /> : null}
            </tr>
          </tbody>
        </table>
      </GridScroll>

      <div className="border-t border-line-soft px-4 pb-1 pt-3 text-[12px] font-semibold text-ink-muted">Additions by month</div>
      <GridScroll>
        <table className={GRID}>
          <thead>
            <tr>
              <th className={cn(TH, STICKY, 'z-[2] min-w-[220px] text-left')}>Block of assets</th>
              <MonthHeads labels={result.labels} />
              <th className={cn(TH, 'min-w-[100px]')}>Year</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((blk, i) => {
              const r = latest.blocks[i];
              return (
                <tr key={blk.id}>
                  <td className={cn(TD_NAME, STICKY)}>
                    <span className="flex items-center gap-2">
                      {blk.name || 'Unnamed block'}
                      {blk.linkLineId ? <span className="text-[11px] text-ink-muted">Includes {lineName(blk.linkLineId)}</span> : null}
                    </span>
                  </td>
                  {months.map((m, at) => (
                    <td key={m} className={cn(TD, 'p-0', latest.actualMonths[at] && ACTUAL_CELL)}>
                      {blk.linkLineId ? (
                        <span className="flex h-8 items-center justify-end px-2 text-ink-muted" title="The linked line, plus any typed addition below it">
                          {inr(r?.additions[at] ?? 0)}
                        </span>
                      ) : (
                        <NumberCell
                          label={`${blk.name || 'Block'} additions ${result.labels[at]}`}
                          value={blk.additions?.[m] ?? 0}
                          disabled={!canEdit}
                          onChange={(v) => {
                            const next = [...(blk.additions ?? zero12())];
                            next[m] = v ?? 0;
                            patch(i, { additions: next });
                          }}
                        />
                      )}
                    </td>
                  ))}
                  <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{inr(r?.additionsTotal ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </GridScroll>
    </Block>
  );
}

function Computation({ budget, latest, hasActuals }: { budget: TaxCalc; latest: TaxCalc; hasActuals: boolean }) {
  const b = budget.totals;
  const l = latest.totals;
  const rowsList: { label: string; b: number; l: number; strong?: boolean; hide?: boolean }[] = [
    { label: 'Total operating cost (Master Budget lines)', b: b.opex, l: l.opex },
    { label: 'Less: GST inside the cost', b: -b.gst, l: -l.gst, hide: !b.gst && !l.gst },
    { label: 'Less: lines capitalised into an asset block', b: -b.capitalised, l: -l.capitalised, hide: !b.capitalised && !l.capitalised },
    { label: 'Less: depreciation line in the Master Budget', b: -b.masterDepreciation, l: -l.masterDepreciation },
    { label: 'Less: insurance as booked or paid', b: -b.insuranceBooked, l: -l.insuranceBooked, hide: !latest.insuranceOn },
    { label: 'Add: insurance on a prepaid basis', b: b.insurancePrepaid, l: l.insurancePrepaid, hide: !latest.insuranceOn },
    { label: 'Add: depreciation as per Companies Act 2013', b: b.cosDepreciation, l: l.cosDepreciation },
    { label: 'Cost base for the mark-up', b: b.base, l: l.base, strong: true },
    { label: 'Revenue (cost base + mark-up)', b: b.revenue, l: l.revenue },
    { label: 'Profit before tax', b: b.profitBeforeTax, l: l.profitBeforeTax, strong: true },
    { label: 'Add: gratuity', b: b.gratuity, l: l.gratuity },
    { label: 'Add: leave encashment', b: b.leave, l: l.leave },
    { label: 'Add: depreciation as per Companies Act 2013', b: b.cosDepreciation, l: l.cosDepreciation },
    { label: 'Less: depreciation as per Income-tax Act', b: -b.itDepreciation, l: -l.itDepreciation },
    { label: 'Taxable income', b: b.taxable, l: l.taxable, strong: true },
    { label: `Income tax for the year @ ${(latest.effectiveRate * 100).toFixed(3)}%`, b: b.tax, l: l.tax, strong: true },
  ];
  return (
    <Block title="Income tax computation" hint="No marginal relief, minimum alternate tax, TDS or TCS credit, or interest for late payment is included. Confirm the figures before any payment.">
      <GridScroll>
        <table className={GRID}>
          <thead>
            <tr>
              <th className={cn(TH, STICKY, 'z-[2] min-w-[340px] text-left')}>Income tax computation</th>
              <th className={cn(TH, 'min-w-[130px]')}>Budget</th>
              <th className={cn(TH, 'min-w-[150px]')}>Latest estimate {hasActuals ? '(approved actuals + budget)' : '(no approved actuals yet)'}</th>
              <th className={cn(TH, 'min-w-[120px]')}>Change</th>
            </tr>
          </thead>
          <tbody>
            {rowsList
              .filter((r) => !r.hide)
              .map((r, i) => (
                <tr key={`${r.label}-${i}`}>
                  <td className={cn(TD_NAME, STICKY, r.strong && 'bg-surface-sunken font-semibold')}>{r.label}</td>
                  <td className={cn(TD, r.strong && 'bg-surface-sunken font-semibold')}>{r.b < 0 ? `(${plain(-r.b)})` : plain(r.b)}</td>
                  <td className={cn(TD, r.strong && 'bg-surface-sunken font-semibold')}>{r.l < 0 ? `(${plain(-r.l)})` : plain(r.l)}</td>
                  <td className={cn(TD, r.strong && 'bg-surface-sunken font-semibold')}>{inr(r.l - r.b)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </GridScroll>
    </Block>
  );
}

function Instalments({ schedule }: { schedule: Instalment[] }) {
  const total = schedule.reduce((a, i) => a + (i.actualPaid ?? i.payable), 0);
  const paid = schedule.reduce((a, i) => a + (i.actualPaid ?? 0), 0);
  return (
    <Block title="Advance tax instalments" hint="15% of the tax for the year by 15 June, 45% by 15 September, 75% by 15 December and 100% by 15 March. Each instalment uses the approved months up to the end of its quarter and the budget for the rest, less what was paid before.">
      <GridScroll>
        <table className={GRID}>
          <thead>
            <tr>
              <th className={cn(TH, STICKY, 'z-[2] min-w-[100px] text-left')}>Due date</th>
              <th className={cn(TH, 'min-w-[130px] text-left')}>Quarter</th>
              <th className={cn(TH, 'min-w-[110px] text-left')}>Basis</th>
              <th className={cn(TH, 'min-w-[90px]')}>Months on actuals</th>
              <th className={cn(TH, 'min-w-[120px]')}>Estimated tax for the year</th>
              <th className={cn(TH, 'min-w-[80px]')}>Cumulative %</th>
              <th className={cn(TH, 'min-w-[110px]')}>Cumulative due</th>
              <th className={cn(TH, 'min-w-[110px]')}>Less: paid earlier</th>
              <th className={cn(TH, 'min-w-[120px]')}>Instalment payable</th>
              <th className={cn(TH, 'min-w-[110px]')}>Actual paid</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((i) => (
              <tr key={i.monthIndex}>
                <td className={cn(TD_NAME, STICKY)}>{i.dueLabel}</td>
                <td className={TD_NAME}>{i.quarter}</td>
                <td className={TD_NAME}>
                  <Chip raw tone={BASIS_TONE[i.basis]}>
                    {i.basis}
                  </Chip>
                </td>
                <td className={TD}>{i.monthsOnActuals} of 12</td>
                <td className={TD}>{inr(i.taxForYear)}</td>
                <td className={TD}>{i.cumulativePct}%</td>
                <td className={TD}>{inr(i.cumulativeDue)}</td>
                <td className={TD}>{inr(i.paidBefore)}</td>
                <td className={cn(TD, 'font-semibold')}>{inr(i.payable)}</td>
                <td className={TD}>{i.actualPaid == null ? '–' : inr(i.actualPaid)}</td>
              </tr>
            ))}
            <tr>
              <td className={cn(TD_NAME, STICKY, 'bg-surface-sunken font-semibold')} colSpan={8}>
                Total paid or payable
              </td>
              <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{inr(total)}</td>
              <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{inr(paid)}</td>
            </tr>
          </tbody>
        </table>
      </GridScroll>
    </Block>
  );
}
