'use client';

import { useState } from 'react';
import { FilterSelect } from '@/components/ui/native-select';
import { sumSeries } from '@/lib/budget/engine';
import type { RoleData } from '@/lib/budget/model';
import { cn } from '@/lib/utils';
import { Block, Field, NumberCell, SelectCell, TextCell } from '../cells';
import { inr, people } from '../format';
import { AddRow, CalcCells, GRID, GridScroll, IssueList, MonthHeads, MoreCell, NoRows, STICKY, TD, TD_NAME, TH } from '../grid-parts';
import { departmentOptions, rowsOf, type Ready } from '../types';

type View = 'hires' | 'exits' | 'salary';

/** The Talent Acquisition tab: roles, CTC, opening headcount and joiners and exits by month. */
export function HiringTab({ ready }: { ready: Ready }) {
  const { settings, result, view, b } = ready;
  const roles = rowsOf(ready, 'role');
  const canEdit = ready.canEdit('hiring');
  const canSeeCtc = view.access.canSeeCtc;
  const [show, setShow] = useState<View>('hires');
  const months = result.calendar.map((m) => m - 1);

  const paste = (rowAt: number, fyAt: number, field: 'hires' | 'exits', grid: number[][]) => {
    grid.forEach((line, dr) => {
      const row = roles[rowAt + dr];
      if (!row) return;
      const series = [...((row.data as RoleData)[field] ?? Array(12).fill(0))];
      line.forEach((v, dc) => {
        if (fyAt + dc < 12) series[months[fyAt + dc]] = v;
      });
      b.patchRow(row.id, { [field]: series });
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <IssueList ready={ready} section="hiring" />
      <Block
        title="Roles and hiring plan"
        hint="Joiners add cost from their joining month; exits stop it after theirs."
        right={<FilterSelect aria-label="Show" value={show} onChange={(e) => setShow(e.target.value as View)} options={[{ value: 'hires', label: 'New joiners' }, { value: 'exits', label: 'Exits' }, { value: 'salary', label: 'Salary cost' }]} />}
        footer={roles.length ? <AddRow ready={ready} kind="role" section="hiring" label="Add role" /> : null}
      >
        {!roles.length ? (
          <div className="p-4">
            <NoRows ready={ready} kind="role" section="hiring" title="No roles yet. Add a role for each designation, with its annual CTC." label="Add role" />
          </div>
        ) : (
          <GridScroll>
            <table className={GRID}>
              <thead>
                <tr>
                  <th className={cn(TH, STICKY, 'z-[2] min-w-[200px] text-left')}>Role</th>
                  <th className={cn(TH, 'min-w-[150px] text-left')}>Department</th>
                  <th className={cn(TH, 'min-w-[110px]')}>Annual CTC (INR)</th>
                  <th className={cn(TH, 'min-w-[72px]')}>Opening</th>
                  <MonthHeads labels={result.labels} />
                  <th className={cn(TH, 'min-w-[90px]')}>{show === 'salary' ? 'Year' : 'Total'}</th>
                  <th className={cn(TH, 'min-w-[72px]')}>Closing</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {roles.map((row, rowAt) => {
                  const d = row.data as RoleData;
                  const r = result.roles[row.id];
                  const series = show === 'hires' ? d.hires : d.exits;
                  return (
                    <tr key={row.id}>
                      <td className={cn(TD_NAME, STICKY, 'p-0')}>
                        <TextCell label="Role" value={d.role} disabled={!canEdit} onChange={(v) => b.patchRow(row.id, { role: v })} />
                      </td>
                      <td className={cn(TD_NAME, 'p-0')}>
                        <SelectCell label="Department" value={d.departmentId} disabled={!canEdit} options={departmentOptions(settings)} onChange={(v) => b.patchRow(row.id, { departmentId: v })} />
                      </td>
                      <td className={cn(TD, 'p-0')}>{canSeeCtc ? <NumberCell label="Annual CTC" value={d.ctc} disabled={!canEdit} onChange={(v) => b.patchRow(row.id, { ctc: v ?? 0 })} /> : <span className="px-2 text-ink-muted">Hidden</span>}</td>
                      <td className={cn(TD, 'p-0')}>
                        <NumberCell label="Opening headcount" value={d.opening} disabled={!canEdit} percent onChange={(v) => b.patchRow(row.id, { opening: v ?? 0 })} />
                      </td>
                      {show === 'salary' ? (
                        canSeeCtc && r ? (
                          <CalcCells series={r.cost} />
                        ) : (
                          <td colSpan={13} className={cn(TD, 'text-center text-ink-muted')}>
                            Hidden
                          </td>
                        )
                      ) : (
                        <>
                          {months.map((m, i) => (
                            <td key={m} className={cn(TD, 'p-0')}>
                              <NumberCell
                                label={`${show === 'hires' ? 'Joiners' : 'Exits'} ${result.labels[i]}`}
                                percent
                                value={series?.[m] ?? 0}
                                disabled={!canEdit}
                                onChange={(v) => {
                                  const next = [...(series ?? Array(12).fill(0))];
                                  next[m] = v ?? 0;
                                  b.patchRow(row.id, { [show]: next });
                                }}
                                onPasteGrid={(grid) => paste(rowAt, i, show, grid)}
                              />
                            </td>
                          ))}
                          <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{people((series ?? []).reduce((a, x) => a + (Number(x) || 0), 0))}</td>
                        </>
                      )}
                      <td className={cn(TD, 'bg-surface-sunken')}>{people(r?.closing[11] ?? 0)}</td>
                      <MoreCell ready={ready} row={row} />
                    </tr>
                  );
                })}
                <tr>
                  <td className={cn(TD_NAME, STICKY, 'bg-surface-sunken font-semibold')}>Closing headcount</td>
                  <td className={cn(TD_NAME, 'bg-surface-sunken')} />
                  <td className={cn(TD, 'bg-surface-sunken')} />
                  <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{people(result.headcount.opening)}</td>
                  {result.headcount.closing.map((v, i) => (
                    <td key={i} className={cn(TD, 'bg-surface-sunken font-semibold')}>
                      {people(v)}
                    </td>
                  ))}
                  <td className={cn(TD, 'bg-surface-sunken')} />
                  <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{people(result.headcount.closing[11])}</td>
                  <td className={cn(TD_NAME, 'bg-surface-sunken')} />
                </tr>
              </tbody>
            </table>
          </GridScroll>
        )}
      </Block>

      {canSeeCtc ? (
        <Block title="Salary of existing staff" hint={`Salary across the year: ₹${inr(sumSeries(result.salary))}.`}>
          <div className="grid max-w-[640px] gap-3 p-4 sm:grid-cols-2">
            <Field label="Work it out from">
              <SelectCell
                label="Existing salary source"
                blank={false}
                value={settings.payrollSource ?? 'roles'}
                disabled={!ready.canEdit('settings')}
                options={[{ value: 'roles', label: 'CTC and opening headcount' }, { value: 'typed', label: 'A monthly total I type' }]}
                onChange={(v) => b.patchSettings({ payrollSource: v as 'roles' | 'typed' })}
              />
            </Field>
            <Field label="Current monthly payroll (INR)">
              <NumberCell label="Current monthly payroll" value={settings.currentMonthlyPayroll} disabled={!ready.canEdit('settings')} onChange={(v) => b.patchSettings({ currentMonthlyPayroll: v ?? 0 })} />
            </Field>
          </div>
          {result.payrollDifference ? (
            <p className="px-4 pb-3 text-[13px] text-ink-muted">
              The monthly total differs from CTC and opening headcount by ₹{inr(Math.abs(result.payrollDifference))}. {settings.payrollSource === 'typed' ? 'The budget uses the total you typed.' : 'The budget uses CTC and opening headcount.'}
            </p>
          ) : null}
        </Block>
      ) : null}
    </div>
  );
}
