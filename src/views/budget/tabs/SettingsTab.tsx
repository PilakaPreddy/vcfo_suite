'use client';

import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CURRENCIES, MONTHS, newId, type BudgetSettings, type FxRate, type NamedRef } from '@/lib/budget/model';
import { cn } from '@/lib/utils';
import { Block, Field, GRID, GridScroll, NumberCell, SelectCell, TD, TD_NAME, TH, TextCell } from '../cells';
import { IssueList, STICKY } from '../grid-parts';
import type { Ready } from '../types';

/** Finance's tab: the assumptions and the lists every other tab chooses from. */
export function SettingsTab({ ready }: { ready: Ready }) {
  const { settings: s, b, result } = ready;
  const canEdit = ready.canEdit('settings');
  const set = (patch: Partial<BudgetSettings>) => b.patchSettings(patch);
  const monthOptions = result.calendar.map((m) => ({ value: String(m), label: MONTHS[m - 1] }));
  const st = s.statutory;
  const setStat = (patch: Partial<typeof st>) => set({ statutory: { ...st, ...patch } });

  return (
    <div className="flex flex-col gap-4">
      <IssueList ready={ready} section="settings" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Block title="The budget">
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Company">
              <TextCell label="Company" value={s.company} disabled={!canEdit} onChange={(v) => set({ company: v })} />
            </Field>
            <Field label="Budget title">
              <TextCell label="Budget title" value={s.title} disabled={!canEdit} onChange={(v) => set({ title: v })} />
            </Field>
            <Field label="Year starts in" help="Monthly values stay with their calendar month if this changes.">
              <SelectCell label="Year starts in" blank={false} value={String(s.fyStartMonth)} disabled={!canEdit} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} onChange={(v) => set({ fyStartMonth: Number(v) })} />
            </Field>
            <Field label="Prepared as of">
              <input className="h-8 w-full bg-surface-raised px-2 text-[13px] text-ink outline-none" type="date" aria-label="Prepared as of" value={s.asOf ?? ''} disabled={!canEdit} onChange={(e) => set({ asOf: e.target.value })} />
            </Field>
          </div>
        </Block>

        <Block title="Salary assumptions" hint="A role can set its own increment in its row panel.">
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <Field label="Increment %">
              <NumberCell label="Increment percent" percent value={s.incrementPct} disabled={!canEdit} onChange={(v) => set({ incrementPct: v ?? 0 })} />
            </Field>
            <Field label="From month">
              <SelectCell label="Increment month" value={s.incrementMonth ? String(s.incrementMonth) : ''} disabled={!canEdit} options={monthOptions} onChange={(v) => set({ incrementMonth: Number(v) })} />
            </Field>
            <Field label="Attrition % a year">
              <NumberCell label="Attrition percent" percent value={s.attritionPct} disabled={!canEdit} onChange={(v) => set({ attritionPct: v ?? 0 })} />
            </Field>
          </div>
        </Block>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <NameList title="Departments" hint="Renaming is safe: rows keep their link." items={s.departments} prefix="dept" canEdit={canEdit} onChange={(departments) => set({ departments })} />
        <NameList title="Locations" hint="Optional. Use for cost by location." items={s.locations} prefix="loc" canEdit={canEdit} onChange={(locations) => set({ locations })} />
      </div>

      <Block
        title="Master Budget lines"
        hint="Each client can add, rename or remove lines. A line with rows on it cannot be removed; calculated lines stay."
        footer={
          canEdit ? (
            <Button variant="outline" size="sm" onClick={() => set({ lines: [...s.lines, { id: newId('line'), group: s.lines[s.lines.length - 1]?.group ?? 'Other costs', name: '' }] })}>
              <Plus className="h-4 w-4" /> Add line
            </Button>
          ) : null
        }
      >
        <GridScroll>
          <table className={GRID}>
            <thead>
              <tr>
                <th className={cn(TH, 'min-w-[220px] text-left')}>Group</th>
                <th className={cn(TH, 'min-w-[280px] text-left')}>Line</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {s.lines.map((line) => {
                const edit = (patch: { group?: string; name?: string }) => set({ lines: s.lines.map((l) => (l.id === line.id ? { ...l, ...patch } : l)) });
                return (
                  <tr key={line.id}>
                    <td className={cn(TD_NAME, 'p-0')}>
                      <TextCell label="Group" value={line.group} disabled={!canEdit} onChange={(v) => edit({ group: v })} />
                    </td>
                    <td className={cn(TD_NAME, 'p-0')}>
                      <TextCell label="Line name" value={line.name} disabled={!canEdit} onChange={(v) => edit({ name: v })} />
                    </td>
                    <td className={cn(TD_NAME, 'w-[1%]')}>{line.system ? <span className="text-[12px] text-ink-muted">Calculated</span> : canEdit ? <RemoveButton label={`Remove ${line.name}`} onClick={() => set({ lines: s.lines.filter((l) => l.id !== line.id) })} /> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </GridScroll>
      </Block>

      <FxBlock ready={ready} canEdit={canEdit} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Block title="Cash" hint="Used by the cash flow and the funds request.">
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Opening cash (INR)">
              <NumberCell label="Opening cash" value={s.openingCash} disabled={!canEdit} onChange={(v) => set({ openingCash: v ?? 0 })} />
            </Field>
            <Field label="Minimum cash (INR)">
              <NumberCell label="Minimum cash" value={s.minimumCash} disabled={!canEdit} onChange={(v) => set({ minimumCash: v ?? 0 })} />
            </Field>
          </div>
        </Block>
        <Block title="Scenarios and alerts" hint="High and low change joiners and other costs by these percentages.">
          <div className="grid gap-3 p-4 sm:grid-cols-5">
            <Field label="High: joiners %">
              <NumberCell label="High joiners" percent value={s.scenarios.high.hiresPct} disabled={!canEdit} onChange={(v) => set({ scenarios: { ...s.scenarios, high: { ...s.scenarios.high, hiresPct: v ?? 0 } } })} />
            </Field>
            <Field label="High: costs %">
              <NumberCell label="High costs" percent value={s.scenarios.high.costPct} disabled={!canEdit} onChange={(v) => set({ scenarios: { ...s.scenarios, high: { ...s.scenarios.high, costPct: v ?? 0 } } })} />
            </Field>
            <Field label="Low: joiners %">
              <NumberCell label="Low joiners" percent value={s.scenarios.low.hiresPct} disabled={!canEdit} onChange={(v) => set({ scenarios: { ...s.scenarios, low: { ...s.scenarios.low, hiresPct: v ?? 0 } } })} />
            </Field>
            <Field label="Low: costs %">
              <NumberCell label="Low costs" percent value={s.scenarios.low.costPct} disabled={!canEdit} onChange={(v) => set({ scenarios: { ...s.scenarios, low: { ...s.scenarios.low, costPct: v ?? 0 } } })} />
            </Field>
            <Field label="Alert above %">
              <NumberCell label="Overspend alert percent" percent value={s.overspendAlertPct} disabled={!canEdit} onChange={(v) => set({ overspendAlertPct: v ?? 0 })} />
            </Field>
          </div>
        </Block>
      </div>

      <Block title="Statutory costs" hint="Off by default, because CTC normally already includes employer PF. Turn on only when CTC excludes them, and have a CA confirm the rates.">
        <div className="flex flex-col gap-3 p-4">
          <label htmlFor="budget-statutory" className="flex items-center gap-2 text-[14px] text-ink">
            <Checkbox id="budget-statutory" checked={st.enabled} disabled={!canEdit} onCheckedChange={(v) => setStat({ enabled: v === true })} /> Calculate PF, ESI, gratuity and leave from salary
          </label>
          {st.enabled ? (
            <div className="grid gap-3 sm:grid-cols-4">
              {(
                [
                  ['basicSharePct', 'Basic as % of CTC'],
                  ['pfPct', 'Employer PF %'],
                  ['pfWageCap', 'PF wage cap (INR, monthly)'],
                  ['esiPct', 'Employer ESI %'],
                  ['esiWageLimit', 'ESI wage limit (INR, monthly)'],
                  ['gratuityPct', 'Gratuity % of basic'],
                  ['leavePct', 'Leave provision % of basic'],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <NumberCell label={label} percent value={st[key]} disabled={!canEdit} onChange={(v) => setStat({ [key]: v ?? 0 })} />
                </Field>
              ))}
            </div>
          ) : null}
        </div>
      </Block>
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="rounded p-1 text-ink-muted hover:bg-hover" aria-label={label} onClick={onClick}>
      <X size={14} />
    </button>
  );
}

function NameList({ title, hint, items, prefix, canEdit, onChange }: { title: string; hint: string; items: NamedRef[]; prefix: string; canEdit: boolean; onChange: (items: NamedRef[]) => void }) {
  return (
    <Block
      title={title}
      hint={hint}
      footer={
        canEdit ? (
          <Button variant="outline" size="sm" onClick={() => onChange([...items, { id: newId(prefix), name: '' }])}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        ) : null
      }
    >
      <ul className="divide-y divide-line-soft">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-1 pr-2">
            <TextCell label={title} value={item.name} disabled={!canEdit} onChange={(v) => onChange(items.map((x) => (x.id === item.id ? { ...x, name: v } : x)))} />
            {canEdit ? <RemoveButton label={`Remove ${item.name}`} onClick={() => onChange(items.filter((x) => x.id !== item.id))} /> : null}
          </li>
        ))}
      </ul>
    </Block>
  );
}

function FxBlock({ ready, canEdit }: { ready: Ready; canEdit: boolean }) {
  const { settings: s, b, result } = ready;
  const set = (fx: FxRate[]) => b.patchSettings({ fx });
  const codes = CURRENCIES.map((c) => ({ value: c, label: c }));
  return (
    <Block
      title="Currencies"
      hint="INR for one unit. A month left blank uses the standard rate."
      right={
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-ink-muted">Report in</span>
          <div className="w-[96px] overflow-hidden rounded-md border border-line-strong">
            <SelectCell label="Report currency" value={s.reportCurrency} disabled={!canEdit} options={s.fx.map((f) => ({ value: f.code, label: f.code }))} onChange={(v) => b.patchSettings({ reportCurrency: v })} />
          </div>
        </div>
      }
      footer={
        canEdit ? (
          <Button variant="outline" size="sm" onClick={() => set([...s.fx, { code: codes.find((c) => !s.fx.some((f) => f.code === c.value))?.value ?? 'USD', rate: 0, monthly: Array(12).fill(0) }])}>
            <Plus className="h-4 w-4" /> Add currency
          </Button>
        ) : null
      }
    >
      {s.fx.length ? (
        <GridScroll>
          <table className={GRID}>
            <thead>
              <tr>
                <th className={cn(TH, STICKY, 'z-[2] min-w-[84px] text-left')}>Currency</th>
                <th className={cn(TH, 'min-w-[84px]')}>Standard rate</th>
                {result.labels.map((l) => (
                  <th key={l} className={cn(TH, 'min-w-[72px]')}>
                    {l}
                  </th>
                ))}
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {s.fx.map((f, at) => {
                const edit = (patch: Partial<FxRate>) => set(s.fx.map((x, i) => (i === at ? { ...x, ...patch } : x)));
                return (
                  <tr key={at}>
                    <td className={cn(TD_NAME, STICKY, 'p-0')}>
                      <SelectCell label="Currency" blank={false} value={f.code} disabled={!canEdit} options={codes} onChange={(v) => edit({ code: v })} />
                    </td>
                    <td className={cn(TD, 'p-0')}>
                      <NumberCell label={`${f.code} standard rate`} percent value={f.rate} disabled={!canEdit} onChange={(v) => edit({ rate: v ?? 0 })} />
                    </td>
                    {result.calendar.map((m, i) => (
                      <td key={m} className={cn(TD, 'p-0')}>
                        <NumberCell
                          label={`${f.code} ${result.labels[i]}`}
                          percent
                          value={f.monthly?.[m - 1] ?? 0}
                          disabled={!canEdit}
                          onChange={(v) => {
                            const monthly = [...(f.monthly ?? Array(12).fill(0))];
                            monthly[m - 1] = v ?? 0;
                            edit({ monthly });
                          }}
                        />
                      </td>
                    ))}
                    <td className={cn(TD_NAME, 'w-[1%]')}>{canEdit ? <RemoveButton label={`Remove ${f.code}`} onClick={() => set(s.fx.filter((_, i) => i !== at))} /> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </GridScroll>
      ) : (
        <p className="px-4 py-3 text-[13px] text-ink-muted">All amounts are in INR.</p>
      )}
    </Block>
  );
}
