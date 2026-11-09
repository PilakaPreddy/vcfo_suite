'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { FilterSelect } from '@/components/ui/native-select';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { StepMark, type StepState } from '@/components/ui/step-track';
import { checkMonth, hasIssues, issuesMessage, VARIANCE_LOG_LABEL, VARIANCE_STATUS_LABEL, type VarianceStatus } from '@/lib/budget/variance';
import { toastError } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';
import { Block, NumberCell, TextCell } from '../cells';
import { crore, inr, people } from '../format';
import { GRID, GridScroll, STICKY, TD, TD_NAME, TH } from '../grid-parts';
import type { Ready } from '../types';
import { useVarianceMonth } from '../variance/use-variance';

const TONE: Record<VarianceStatus, ChipTone> = { open: 'idle', draft: 'prog', submitted: 'teal', approved: 'ok', returned: 'bad' };

const STEPS = ['Project lead enters actual cost and reasons', 'Project lead submits', 'Manager approves or sends back', 'Approved actuals update advance tax'];

const stepOf = (s: VarianceStatus): number => ({ open: 0, draft: 0, returned: 0, submitted: 2, approved: 4 })[s];

const pctText = (v: number, b: number): string => {
  if (!Math.round(b)) return Math.round(v) ? 'n/a' : '–';
  return `${((v / b) * 100).toFixed(1)}%`;
};

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * The Variance tab: budget against actual for one month. The project lead types the actual cost of
 * every line, a reason for each difference, the closing headcount and any advance tax paid, then
 * submits. A manager or firm admin approves it or sends it back. Variance = Budget - Actual.
 */
export function VarianceTab({ ready }: { ready: Ready }) {
  const { view, settings, result } = ready;
  const v = useVarianceMonth(ready);
  const [showMissing, setShowMissing] = useState(false);
  const [dialog, setDialog] = useState<'send_back' | 'reopen' | null>(null);
  const [note, setNote] = useState('');

  const { shown, budget, month, editable } = v;
  const issues = useMemo(() => (shown && budget ? checkMonth(budget, v.entriesList(shown), { headcount: shown.headcount, advanceTaxPaid: shown.advanceTaxPaid, advanceTaxReason: shown.advanceTaxReason || null }) : null), [shown, budget, v]);

  if (v.query.isError) return <EmptyState title="The Variance tab could not be loaded. Try again." />;
  if (!shown || !budget || !month) return null;

  const label = result.labels[v.monthIndex];
  const status = month.status;
  const lastLog = [...(v.data?.log ?? [])].reverse().find((l) => l.monthIndex === v.monthIndex);
  const monthLog = (v.data?.log ?? []).filter((l) => l.monthIndex === v.monthIndex);
  const missingActual = new Set(showMissing ? (issues?.missingActual ?? []) : []);
  const missingReason = new Set(showMissing ? (issues?.missingReason ?? []) : []);

  /* Totals: the variance adds only the lines with an actual, so a half-filled month reads fairly. */
  const tally = (lineIds: string[]) => {
    let b = 0, a = 0, vr = 0, eb = 0, n = 0;
    for (const id of lineIds) {
      const lb = budget.lines[id] ?? 0;
      const e = shown.entries[id];
      b += lb;
      if (e?.amount != null) {
        a += e.amount;
        vr += lb - e.amount;
        eb += lb;
        n++;
      }
    }
    return { b, a, v: vr, eb, n };
  };
  const allLines = settings.lines.map((l) => l.id);
  const ops = tally(allLines);
  const adv = { b: budget.advanceTax, a: shown.advanceTaxPaid ?? 0, has: shown.advanceTaxPaid != null };
  const all = { b: ops.b + adv.b, a: ops.a + adv.a, v: ops.v + (adv.has ? adv.b - adv.a : 0), n: ops.n + (adv.has ? 1 : 0) };
  const budgeted = allLines.filter((id) => Math.round(budget.lines[id] ?? 0) !== 0 || shown.entries[id]?.amount != null).length + (Math.round(adv.b) || adv.has ? 1 : 0);
  const entered = ops.n + (adv.has ? 1 : 0);
  const needReason = allLines.filter((id) => {
    const e = shown.entries[id];
    return e?.amount != null && Math.round((budget.lines[id] ?? 0) - e.amount) !== 0;
  }).length + (adv.has && Math.round(adv.b - adv.a) !== 0 ? 1 : 0);
  const missingCount = (issues?.missingReason.length ?? 0) + (issues?.missingAdvanceReason ? 1 : 0);
  const varianceNote = !all.n ? 'Shows once actuals are entered' : `${Math.round(all.v) < 0 ? 'Over budget' : Math.round(all.v) > 0 ? 'Under budget' : 'On budget'}${entered < budgeted ? ', on lines entered' : ''}`;
  const isInstalment = Math.round(adv.b) !== 0;
  const gratuityLine = settings.lines.find((l) => l.system === 'gratuity')?.id;

  const setEntry = (lineId: string, patch: Partial<{ amount: number | null; reason: string }>) =>
    v.change((d) => ({ ...d, entries: { ...d.entries, [lineId]: { amount: d.entries[lineId]?.amount ?? null, reason: d.entries[lineId]?.reason ?? '', ...patch } } }));

  const submit = async () => {
    if (issues && hasIssues(issues)) {
      setShowMissing(true);
      toastError('Not submitted', issuesMessage(issues));
      return;
    }
    if (await v.act('submit')) setShowMissing(false);
  };

  const varCell = (b: number, a: number | null) => {
    if (a == null) return <td className={TD} />;
    const d = b - a;
    return <td className={cn(TD, Math.round(d) < 0 && 'text-danger')}>{inr(d)}</td>;
  };

  const stepAt = stepOf(status);
  const stepState = (i: number): StepState => (i < stepAt ? 'done' : i === stepAt ? 'now' : 'next');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <FilterSelect
          aria-label="Variance month"
          value={String(v.monthIndex)}
          onChange={(e) => {
            setShowMissing(false);
            void v.pick(Number(e.target.value));
          }}
          options={v.months.map((m, i) => ({ value: String(i), label: m.status === 'open' ? result.labels[i] : `${result.labels[i]} · ${VARIANCE_STATUS_LABEL[m.status]}` }))}
        />
        <Chip raw tone={TONE[status]}>
          {VARIANCE_STATUS_LABEL[status]}
        </Chip>
        {lastLog ? (
          <span className="text-[13px] text-ink-muted">
            {VARIANCE_LOG_LABEL[lastLog.action] ?? lastLog.action} by {lastLog.actorName ?? 'someone'}, {when(lastLog.createdAt)}
          </span>
        ) : null}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {editable ? (
            <>
              <Button variant="outline" size="sm" disabled={v.busy} onClick={() => void v.saveNow()}>
                Save draft
              </Button>
              <Button size="sm" disabled={v.busy} onClick={() => void submit()}>
                Submit for approval
              </Button>
            </>
          ) : null}
          {view.access.canApproveVariance && status === 'submitted' ? (
            <>
              <Button variant="outline" size="sm" disabled={v.busy} onClick={() => setDialog('send_back')}>
                Send back
              </Button>
              <Button size="sm" disabled={v.busy} onClick={() => void v.act('approve')}>
                Approve
              </Button>
            </>
          ) : null}
          {view.access.canApproveVariance && status === 'approved' ? (
            <Button variant="outline" size="sm" disabled={v.busy} onClick={() => setDialog('reopen')}>
              Reopen month
            </Button>
          ) : null}
        </span>
      </div>

      <ol className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-muted" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <StepMark state={stepState(i)} size={18} label={`Step ${i + 1}`} />
            <span className={cn(i === stepAt && 'font-semibold text-ink')}>{s}</span>
          </li>
        ))}
      </ol>

      <Banner ready={ready} status={status} note={month.note} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label={`Budget for ${label}`} value={crore(all.b)} note="Operating cost and advance tax" />
        <Tile label="Actual cost incurred" value={crore(all.a)} note={`${entered} of ${budgeted} lines entered`} />
        <Tile label="Variance" value={all.n ? crore(all.v) : '–'} note={varianceNote} tone={all.n && Math.round(all.v) < 0 ? 'bad' : undefined} />
        <Tile label="Reasons needed" value={String(missingCount)} note={`of ${needReason} line${needReason === 1 ? '' : 's'} with a variance`} />
        <Tile label="Closing headcount" value={shown.headcount == null ? '–' : people(shown.headcount)} note={`Budget ${people(budget.headcount)}`} />
      </div>

      <Block title={`Budget against actual, ${label}`} hint="Variance = Budgeted − Actual. A figure in red and brackets means more was spent than budgeted. Every line with a budget needs an actual (type 0 if nothing was spent), and every line with a variance needs a reason.">
        <GridScroll>
          <table className={GRID}>
            <thead>
              <tr>
                <th className={cn(TH, STICKY, 'z-[2] min-w-[240px] text-left')}>Line</th>
                <th className={cn(TH, 'min-w-[110px]')}>Budgeted</th>
                <th className={cn(TH, 'min-w-[130px]')}>Actual cost incurred</th>
                <th className={cn(TH, 'min-w-[110px]')}>Variance</th>
                <th className={cn(TH, 'min-w-[70px]')}>%</th>
                <th className={cn(TH, 'min-w-[300px] text-left')}>Reason for variance</th>
              </tr>
            </thead>
            <tbody>
              {result.groups.map((g) => {
                const t = tally(g.lineIds);
                return [
                  ...g.lineIds.map((id) => {
                    const line = settings.lines.find((l) => l.id === id);
                    const e = shown.entries[id];
                    const b = budget.lines[id] ?? 0;
                    const a = e?.amount ?? null;
                    return (
                      <tr key={id}>
                        <td className={cn(TD_NAME, STICKY, 'pl-5')}>
                          <span className="flex items-center gap-2">
                            {line?.name ?? id}
                            {id === gratuityLine ? <span className="text-[11px] text-ink-muted">Added back for tax</span> : null}
                          </span>
                        </td>
                        <td className={TD}>{inr(b)}</td>
                        <td className={cn(TD, 'p-0')}>
                          <NumberCell nullable label={`Actual ${line?.name ?? id}`} value={a} disabled={!editable} invalid={missingActual.has(id)} onChange={(n) => setEntry(id, { amount: n })} />
                        </td>
                        {varCell(b, a)}
                        <td className={TD}>{a == null ? '' : pctText(b - a, b)}</td>
                        <td className={cn(TD_NAME, 'p-0')}>
                          <TextCell label={`Reason ${line?.name ?? id}`} placeholder={editable && a != null && Math.round(b - a) !== 0 ? 'Why it differs' : ''} value={e?.reason ?? ''} disabled={!editable} invalid={missingReason.has(id)} onChange={(r) => setEntry(id, { reason: r })} />
                        </td>
                      </tr>
                    );
                  }),
                  <tr key={`total-${g.group}`}>
                    <td className={cn(TD_NAME, STICKY, 'bg-surface-sunken font-semibold')}>Total {g.group.charAt(0).toLowerCase() + g.group.slice(1)}</td>
                    <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{inr(t.b)}</td>
                    <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{t.n ? inr(t.a) : ''}</td>
                    <td className={cn(TD, 'bg-surface-sunken font-semibold', Math.round(t.v) < 0 && 'text-danger')}>{t.n ? inr(t.v) : ''}</td>
                    <td className={cn(TD, 'bg-surface-sunken')}>{t.n ? pctText(t.v, t.eb) : ''}</td>
                    <td className={cn(TD_NAME, 'bg-surface-sunken')} />
                  </tr>,
                ];
              })}
              <tr>
                <td className={cn(TD_NAME, STICKY, 'bg-surface-sunken font-semibold')}>Total operating cost, before tax</td>
                <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{inr(ops.b)}</td>
                <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{ops.n ? inr(ops.a) : ''}</td>
                <td className={cn(TD, 'bg-surface-sunken font-semibold', Math.round(ops.v) < 0 && 'text-danger')}>{ops.n ? inr(ops.v) : ''}</td>
                <td className={cn(TD, 'bg-surface-sunken')}>{ops.n ? pctText(ops.v, ops.eb) : ''}</td>
                <td className={cn(TD_NAME, 'bg-surface-sunken')} />
              </tr>
              <tr>
                <td className={cn(TD_NAME, STICKY, 'pl-5')}>
                  <span className="flex items-center gap-2">
                    Advance tax <span className="text-[11px] text-ink-muted">{isInstalment ? `Instalment due 15-${label}` : 'No instalment this month'}</span>
                  </span>
                </td>
                <td className={TD}>{inr(adv.b)}</td>
                <td className={cn(TD, 'p-0')}>
                  <NumberCell nullable label="Advance tax paid" value={shown.advanceTaxPaid} disabled={!editable} invalid={showMissing && Boolean(issues?.missingAdvanceTax)} onChange={(n) => v.change((d) => ({ ...d, advanceTaxPaid: n }))} />
                </td>
                {varCell(adv.b, shown.advanceTaxPaid)}
                <td className={TD}>{shown.advanceTaxPaid == null ? '' : pctText(adv.b - adv.a, adv.b)}</td>
                <td className={cn(TD_NAME, 'p-0')}>
                  <TextCell label="Reason advance tax" value={shown.advanceTaxReason} disabled={!editable} invalid={showMissing && Boolean(issues?.missingAdvanceReason)} onChange={(r) => v.change((d) => ({ ...d, advanceTaxReason: r }))} />
                </td>
              </tr>
              <tr>
                <td className={cn(TD_NAME, STICKY, 'bg-surface-sunken font-semibold')}>Total cost including tax</td>
                <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{inr(all.b)}</td>
                <td className={cn(TD, 'bg-surface-sunken font-semibold')}>{all.n ? inr(all.a) : ''}</td>
                <td className={cn(TD, 'bg-surface-sunken font-semibold', Math.round(all.v) < 0 && 'text-danger')}>{all.n ? inr(all.v) : ''}</td>
                <td className={cn(TD, 'bg-surface-sunken')}>{all.n ? pctText(all.v, ops.eb + (adv.has ? adv.b : 0)) : ''}</td>
                <td className={cn(TD_NAME, 'bg-surface-sunken')} />
              </tr>
              <tr>
                <td className={cn(TD_NAME, STICKY, 'pl-5')}>
                  <span className="flex items-center gap-2">
                    Closing headcount <span className="text-[11px] text-ink-muted">Used for prepaid insurance</span>
                  </span>
                </td>
                <td className={TD}>{people(budget.headcount)}</td>
                <td className={cn(TD, 'p-0')}>
                  <NumberCell nullable percent label="Actual closing headcount" value={shown.headcount} disabled={!editable} invalid={showMissing && Boolean(issues?.missingHeadcount)} onChange={(n) => v.change((d) => ({ ...d, headcount: n }))} />
                </td>
                <td className={TD}>{shown.headcount == null ? '' : Math.round((budget.headcount - shown.headcount) * 10) / 10 || '–'}</td>
                <td className={TD} />
                <td className={TD_NAME} />
              </tr>
            </tbody>
          </table>
        </GridScroll>
      </Block>

      {monthLog.length ? (
        <Block title={`Activity for ${label}`}>
          <ul className="divide-y divide-line-soft">
            {[...monthLog].reverse().map((l) => (
              <li key={l.id} className="flex flex-wrap gap-x-2 px-4 py-2 text-[13px] text-ink">
                <span className="font-semibold">{VARIANCE_LOG_LABEL[l.action] ?? l.action}</span>
                <span className="text-ink-muted">
                  by {l.actorName ?? 'someone'}, {when(l.createdAt)}
                </span>
                {l.note ? <span className="w-full text-ink-muted">“{l.note}”</span> : null}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {dialog ? (
        <Modal
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={dialog === 'send_back' ? `Send ${label} back` : `Reopen ${label}`}
          sub={dialog === 'send_back' ? 'The month goes back to the project lead. Say what should change.' : 'The month unlocks and goes back to the project lead. Give the reason; it stays in the log.'}
          footer={
            <>
              <Button variant="outline" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                disabled={v.busy || !note.trim()}
                onClick={async () => {
                  if (await v.act(dialog, note.trim())) {
                    setDialog(null);
                    setNote('');
                  }
                }}
              >
                {dialog === 'send_back' ? 'Send back' : 'Reopen month'}
              </Button>
            </>
          }
        >
          <textarea
            className="min-h-[90px] w-full rounded-md border-1.5 border-line-strong bg-surface-raised p-2 text-[14px] text-ink outline-none focus:border-brand"
            aria-label={dialog === 'send_back' ? 'What should change' : 'Reason'}
            placeholder={dialog === 'send_back' ? 'For example: explain the Rent variance, and check the Laptops figure against the invoice.' : 'Reason'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Modal>
      ) : null}
    </div>
  );
}

function Banner({ ready, status, note }: { ready: Ready; status: VarianceStatus; note: string | null }) {
  const { access } = ready.view;
  let text: string | null = null;
  let tone = 'border-line bg-surface-sunken text-ink';
  if (status === 'returned') {
    text = `Sent back${note ? `: ${note}` : '.'}${access.canEnterVariance ? ' Make the changes and submit again.' : ''}`;
    tone = 'border-line bg-danger-soft text-ink';
  } else if (status === 'submitted') {
    text = access.canApproveVariance ? 'Check the actual cost and the reasons, then approve the month or send it back.' : 'Submitted. Waiting for a manager to approve. Entries are locked until then.';
    tone = 'border-line bg-waiting-soft text-ink';
  } else if (status === 'approved') {
    text = 'Approved and locked. These actuals now drive the advance tax on the Finance costs tab.';
    tone = 'border-line bg-positive-soft text-ink';
  } else if (!access.canEnterVariance) {
    text = 'The project lead of this client enters the actual cost and submits the month. A manager or admin approves it.';
  }
  if (!text) return null;
  return <p className={cn('rounded-md border px-3 py-2 text-[13px]', tone)}>{text}</p>;
}

function Tile({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'bad' }) {
  return (
    <div className="rounded-lg border border-line bg-surface-raised px-4 py-3">
      <div className="text-[12px] font-semibold text-ink-muted">{label}</div>
      <div className={cn('mt-1 text-[22px] font-semibold tabular-nums text-ink', tone === 'bad' && 'text-danger')}>{value}</div>
      <div className="text-[12px] text-ink-muted">{note}</div>
    </div>
  );
}
