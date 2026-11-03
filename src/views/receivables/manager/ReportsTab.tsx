'use client';

import { useState, type ReactNode } from 'react';
import { DashBarChart, type ChartRow } from '@/components/charts';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Chip } from '@/components/ui/spectrum-chip';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { sheetDate } from '@/lib/receivables/dates';
import type { FiraDto, ReportsDto, TdsRowDto } from '@/lib/receivables/reports-wire';
import { useReports, useReportsActions } from '@/hooks/use-receivables-reports';
import { inr, parseInr } from '../format';

/**
 * The Reports tab (Phase 9, docs/specs/receivables/PLAN.md): what the live invoices say about
 * the sheet. Ageing by days past due, how late each client pays, the cash expected by week, FX
 * (today's USD rate with the manager's override, open invoices at today's rate and the gain or
 * loss on receipts), TDS certificates, and FIRAs awaited from the bank. Everything here reads
 * the draft, so it needs no Update; a dispute or FIRA change never shows on the client page.
 */

const TH = 'whitespace-nowrap bg-surface-sunken px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[.04em] text-ink-muted';
const TD = 'border-t border-line-soft px-2.5 py-2 align-middle';
const NUM = `${TD} text-right font-mono tabular-nums`;
const BAR = 'oklch(var(--data-1))';

function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.';
}

function invoiceName(r: { clientName: string | null; invoiceNo: string | null }) {
  return `${r.clientName ?? 'Foreign receipt'}${r.invoiceNo ? ` ${r.invoiceNo}` : ''}`;
}

/** "+₹12,400" or "−₹3,100", green for a gain and red for a loss. */
function Signed({ n }: { n: number | null }) {
  if (n === null) return <span className="text-ink-faint">—</span>;
  const tone = n > 0 ? 'text-positive' : n < 0 ? 'text-danger' : 'text-ink-muted';
  return <span className={tone}>{`${n > 0 ? '+' : n < 0 ? '−' : ''}₹${inr(Math.abs(n))}`}</span>;
}

function fc(n: number | null, currency = 'USD') {
  return n === null ? '—' : `${currency} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)}`;
}

function rateText(n: number | null) {
  return n === null ? '—' : n.toFixed(4);
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[.04em] text-ink-2">{title}</h2>
        {aside ? <div className="text-[12.5px] text-ink-muted">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Table({ head, children, minWidth = 640 }: { head: ReactNode; children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface-raised">
      <table className="w-full border-collapse text-[13px]" style={{ minWidth }}>
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Ageing({ data }: { data: ReportsDto }) {
  const rows: ChartRow[] = data.ageing.buckets.map((b) => ({ bucket: b.label, inr: b.inr }));
  return (
    <Section title="Ageing" aside={`${data.ageing.total.count} open · ₹${inr(data.ageing.total.inr)}${data.disputes.length ? ` · ${data.disputes.length} disputed left out` : ''}`}>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Table
          minWidth={320}
          head={
            <>
              <th className={TH}>Days past due</th>
              <th className={`${TH} text-right`}>Invoices</th>
              <th className={`${TH} text-right`}>Amount INR</th>
            </>
          }
        >
          {data.ageing.buckets.map((b) => (
            <tr key={b.bucket}>
              <td className={TD}>{b.label}</td>
              <td className={NUM}>{b.count}</td>
              <td className={NUM}>{inr(b.inr)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className={TD}>Total</td>
            <td className={NUM}>{data.ageing.total.count}</td>
            <td className={NUM}>{inr(data.ageing.total.inr)}</td>
          </tr>
        </Table>
        <div className="rounded-md border border-line bg-surface-raised p-3">
          <DashBarChart data={rows} categoryKey="bucket" series={[{ key: 'inr', label: 'Amount INR', color: BAR }]} valueFormatter={(v) => `₹${inr(Number(v))}`} emptyLabel="Nothing open" />
        </div>
      </div>
    </Section>
  );
}

function DaysToPay({ data }: { data: ReportsDto }) {
  return (
    <Section title="Days to pay by client" aside="Paid date minus due date, over received invoices">
      {data.daysToPay.length === 0 ? (
        <EmptyState title="No received invoices with a paid date yet" />
      ) : (
        <Table
          minWidth={420}
          head={
            <>
              <th className={TH}>Client</th>
              <th className={`${TH} text-right`}>Invoices paid</th>
              <th className={`${TH} text-right`}>Average days late</th>
              <th className={`${TH} text-right`}>Latest</th>
            </>
          }
        >
          {data.daysToPay.map((c) => (
            <tr key={c.client}>
              <td className={TD}>{c.client}</td>
              <td className={NUM}>{c.count}</td>
              <td className={NUM}>{c.avgDaysLate < 0 ? `${Math.abs(c.avgDaysLate)} early` : c.avgDaysLate}</td>
              <td className={NUM}>{c.maxDaysLate < 0 ? `${Math.abs(c.maxDaysLate)} early` : c.maxDaysLate}</td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}

const BASIS: Record<'promised' | 'history' | 'due', string> = { promised: 'promised', history: 'client history', due: 'due date' };

function Forecast({ data, sheetId }: { data: ReportsDto; sheetId: string }) {
  const act = useReportsActions(sheetId);
  const f = data.forecast;
  const rows: ChartRow[] = f.weeks.map((w) => ({ week: sheetDate(w.weekStart), inr: w.inr }));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Section title="Cash forecast by week" aside={`₹${inr(f.total.inr)} expected from ${f.total.count} invoice${f.total.count === 1 ? '' : 's'}`}>
      <div className="mb-3 rounded-md border border-line bg-surface-raised p-3">
        <DashBarChart data={rows} categoryKey="week" series={[{ key: 'inr', label: 'Expected INR', color: BAR }]} valueFormatter={(v) => `₹${inr(Number(v))}`} emptyLabel="Nothing expected" />
      </div>
      <Table
        minWidth={560}
        head={
          <>
            <th className={TH}>Week</th>
            <th className={`${TH} text-right`}>Invoices</th>
            <th className={`${TH} text-right`}>Expected INR</th>
            <th className={TH}>Invoices</th>
          </>
        }
      >
        {[...f.weeks.map((w) => ({ key: w.weekStart, label: `${sheetDate(w.weekStart)} to ${sheetDate(w.weekEnd)}`, ...w })), { key: 'later', label: 'Later', ...f.later }].map((w) => (
          <tr key={w.key}>
            <td className={`${TD} whitespace-nowrap`}>{w.label}</td>
            <td className={NUM}>{w.count}</td>
            <td className={NUM}>{inr(w.inr)}</td>
            <td className={TD}>
              {w.items.length ? (
                <Button size="sm" variant="quiet" onClick={() => setOpen(open === w.key ? null : w.key)} aria-expanded={open === w.key}>
                  {open === w.key ? 'Hide' : 'Show'}
                </Button>
              ) : null}
              {open === w.key ? (
                <ul className="mt-1 grid gap-0.5 text-[12.5px]">
                  {w.items.map((i) => (
                    <li key={i.id}>
                      {invoiceName(i)} · ₹{inr(i.amountInr)} · {sheetDate(i.expectedOn)} <span className="text-ink-faint">({BASIS[i.basis]})</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </td>
          </tr>
        ))}
      </Table>
      <p className="mt-1.5 text-[12px] text-ink-faint">Expected on the promised date, else the due date plus the client&apos;s average days late, never before today.</p>

      {data.disputes.length ? (
        <div className="mt-3">
          <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[.04em] text-ink-muted">{`Disputed · ₹${inr(f.disputed.inr)} not counted`}</h3>
          <div className="grid gap-2">
            {data.disputes.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface-raised px-3 py-2 text-[13px]">
                <div>
                  <b className="font-semibold">{invoiceName(d)}</b> <span className="text-ink-muted">· ₹{inr(d.amountInr)} · due {sheetDate(d.dueDate)}</span>
                  <div className="text-[12px] text-ink-muted">{d.reason}</div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={act.resolveDispute.isPending}
                  onClick={() => act.resolveDispute.mutate(d.id, { onSuccess: () => toastSuccess('Dispute resolved', 'Reminders resume if the dispute paused them.'), onError: (e) => toastError('Not saved', errorText(e)) })}
                >
                  Resolve
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Section>
  );
}

function RateCard({ data, sheetId }: { data: ReportsDto; sheetId: string }) {
  const act = useReportsActions(sheetId);
  const rate = data.fx.rate;
  const [day, setDay] = useState(data.today);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const n = Number(value);
  const ok = Number.isFinite(n) && n > 0 && Boolean(day) && day <= data.today;
  const save = () =>
    act.setRate.mutate(
      { currency: 'USD', rateDate: day, rate: n, note: note.trim() || null },
      {
        onSuccess: () => {
          toastSuccess('Rate saved', `USD ${n.toFixed(4)} is used for ${sheetDate(day)}.`);
          setValue('');
          setNote('');
        },
        onError: (e) => toastError('Not saved', errorText(e)),
      },
    );
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-4 rounded-md border border-line bg-surface-raised p-4">
      <div>
        <div className="text-[12px] uppercase tracking-[.04em] text-ink-muted">USD to INR</div>
        {rate ? (
          <>
            <div className="font-mono text-[22px] font-semibold tabular-nums">₹{rate.rate.toFixed(4)}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-muted">
              <span>{sheetDate(rate.rateDate)}</span>
              <Chip raw tone={rate.source === 'manual' ? 'warn' : rate.source === 'fbil' ? 'ok' : 'idle'}>
                {rate.source === 'manual' ? 'Set by hand' : rate.source === 'fbil' ? 'FBIL reference' : 'ECB (fallback)'}
              </Chip>
              {rate.rateDate !== data.today ? <span>Today&apos;s rate is not in yet.</span> : null}
            </div>
          </>
        ) : (
          <p className="mt-1 text-[13px] text-ink-muted">No rate yet. The rate is fetched at 14:30 IST on weekdays; set one by hand meanwhile.</p>
        )}
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) save();
        }}
      >
        <label className="grid gap-1 text-[12px] text-ink-muted">
          Day
          <Input type="date" value={day} max={data.today} onChange={(e) => setDay(e.target.value)} className="h-8 w-[150px]" />
        </label>
        <label className="grid gap-1 text-[12px] text-ink-muted">
          INR per USD
          <Input inputMode="decimal" placeholder="84.1250" value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-[110px]" />
        </label>
        <label className="grid gap-1 text-[12px] text-ink-muted">
          Note
          <Input placeholder="e.g. HSBC rate" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} className="h-8 w-[160px]" />
        </label>
        <Button size="sm" type="submit" disabled={!ok || act.setRate.isPending}>
          Override rate
        </Button>
      </form>
    </div>
  );
}

function Fx({ data, sheetId }: { data: ReportsDto; sheetId: string }) {
  const { open, realised, openTotals, realisedTotals } = data.fx;
  return (
    <Section title="Foreign exchange">
      <RateCard data={data} sheetId={sheetId} />
      <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[.04em] text-ink-muted">Open USD invoices at today&apos;s rate</h3>
      {open.length === 0 ? (
        <EmptyState title="No open foreign invoices" className="mb-3" />
      ) : (
        <div className="mb-3">
          <Table
            minWidth={760}
            head={
              <>
                <th className={TH}>Client · invoice</th>
                <th className={TH}>Due</th>
                <th className={`${TH} text-right`}>Amount</th>
                <th className={`${TH} text-right`}>Booked rate</th>
                <th className={`${TH} text-right`}>Booked INR</th>
                <th className={`${TH} text-right`}>INR today</th>
                <th className={`${TH} text-right`}>Change</th>
              </>
            }
          >
            {open.map((r) => (
              <tr key={r.id}>
                <td className={TD}>{invoiceName(r)}</td>
                <td className={`${TD} whitespace-nowrap`}>{sheetDate(r.dueDate)}</td>
                <td className={NUM}>{fc(r.fcAmount, r.currency)}</td>
                <td className={NUM}>{rateText(r.bookedRate)}</td>
                <td className={NUM}>{inr(r.bookedInr)}</td>
                <td className={NUM}>{r.inrToday === null ? '—' : inr(r.inrToday)}</td>
                <td className={NUM}>
                  <Signed n={r.changeInr} />
                  {r.changePct !== null ? <span className="ml-1 text-[11.5px] text-ink-faint">{`${r.changePct > 0 ? '+' : ''}${r.changePct}%`}</span> : null}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className={TD} colSpan={4}>
                Unrealised
              </td>
              <td className={NUM}>{inr(openTotals.bookedInr)}</td>
              <td className={NUM}>{inr(openTotals.inrToday)}</td>
              <td className={NUM}>
                <Signed n={openTotals.changeInr} />
              </td>
            </tr>
          </Table>
        </div>
      )}
      <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[.04em] text-ink-muted">Received USD invoices</h3>
      {realised.length === 0 ? (
        <EmptyState title="No foreign receipts yet" />
      ) : (
        <Table
          minWidth={820}
          head={
            <>
              <th className={TH}>Client · invoice</th>
              <th className={TH}>Received</th>
              <th className={`${TH} text-right`}>Invoiced</th>
              <th className={`${TH} text-right`}>Arrived</th>
              <th className={`${TH} text-right`}>INR credited</th>
              <th className={`${TH} text-right`}>Booked / effective rate</th>
              <th className={`${TH} text-right`}>Bank charges</th>
              <th className={`${TH} text-right`}>Realised</th>
            </>
          }
        >
          {realised.map((r) => (
            <tr key={r.id}>
              <td className={TD}>{invoiceName(r)}</td>
              <td className={`${TD} whitespace-nowrap`}>{r.paidOn ? sheetDate(r.paidOn) : '—'}</td>
              <td className={NUM}>{fc(r.fcAmount, r.currency)}</td>
              <td className={NUM}>{fc(r.receivedFc, r.currency)}</td>
              <td className={NUM}>{r.receivedInr === null ? '—' : inr(r.receivedInr)}</td>
              <td className={NUM}>{`${rateText(r.bookedRate)} / ${rateText(r.effectiveRate)}`}</td>
              <td className={NUM}>{r.bankChargesFc === null ? '—' : `${fc(r.bankChargesFc, r.currency)} · ₹${inr(r.bankChargesInr)}`}</td>
              <td className={NUM}>{r.realisedInr === null ? <span className="text-[12px] text-ink-faint">USD received not recorded</span> : <Signed n={r.realisedInr} />}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className={TD} colSpan={6}>
              Realised
            </td>
            <td className={NUM}>₹{inr(realisedTotals.bankChargesInr)}</td>
            <td className={NUM}>
              <Signed n={realisedTotals.realisedInr} />
            </td>
          </tr>
        </Table>
      )}
    </Section>
  );
}

function TdsRow({ r, sheetId }: { r: TdsRowDto; sheetId: string }) {
  const act = useReportsActions(sheetId);
  const [day, setDay] = useState(r.certificateOn ?? '');
  const [amount, setAmount] = useState(inr(r.tdsInr));
  const save = (input: { tdsInr?: number; certificateOn?: string | null }) =>
    act.setTds.mutate({ invoiceId: r.id, ...input }, { onSuccess: () => toastSuccess('TDS saved'), onError: (e) => toastError('Not saved', errorText(e)) });
  const amt = parseInr(amount);
  return (
    <tr>
      <td className={TD}>{invoiceName(r)}</td>
      <td className={`${TD} whitespace-nowrap`}>{r.paidOn ? sheetDate(r.paidOn) : '—'}</td>
      <td className={`${TD} text-right`}>
        <Input aria-label={`TDS for ${invoiceName(r)}`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={() => {
            if (Number.isFinite(amt) && amt >= 0 && amt !== r.tdsInr) save({ tdsInr: amt });
          }} className="ml-auto h-8 w-[120px] text-right font-mono" />
      </td>
      <td className={TD}>{r.status === 'received' ? <Chip raw tone="ok">{`Certificate ${sheetDate(r.certificateOn)}`}</Chip> : <Chip raw tone="warn">Certificate awaited</Chip>}</td>
      <td className={TD}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Input type="date" aria-label={`Certificate date for ${invoiceName(r)}`} value={day} onChange={(e) => setDay(e.target.value)} className="h-8 w-[150px]" />
          <Button size="sm" variant="secondary" disabled={!day || day === r.certificateOn || act.setTds.isPending} onClick={() => save({ certificateOn: day })}>
            Save
          </Button>
          {r.certificateOn ? (
            <Button size="sm" variant="quiet" disabled={act.setTds.isPending} onClick={() => save({ certificateOn: null })}>
              Clear
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function Tds({ data, sheetId }: { data: ReportsDto; sheetId: string }) {
  const t = data.tds;
  return (
    <Section title="TDS" aside={t.rows.length ? `₹${inr(t.totals.tdsInr)} deducted · ${t.totals.awaitedCount} certificate${t.totals.awaitedCount === 1 ? '' : 's'} awaited (₹${inr(t.totals.awaitedInr)})` : undefined}>
      {t.rows.length === 0 ? (
        <EmptyState title="No TDS recorded on received invoices" />
      ) : (
        <Table
          minWidth={760}
          head={
            <>
              <th className={TH}>Client · invoice</th>
              <th className={TH}>Received</th>
              <th className={`${TH} text-right`}>TDS INR</th>
              <th className={TH}>Form 16A</th>
              <th className={TH}>Certificate date</th>
            </>
          }
        >
          {t.rows.map((r) => (
            <TdsRow key={r.id} r={r} sheetId={sheetId} />
          ))}
        </Table>
      )}
    </Section>
  );
}

function FiraRow({ f, sheetId, today }: { f: FiraDto; sheetId: string; today: string }) {
  const act = useReportsActions(sheetId);
  const [no, setNo] = useState('');
  const [day, setDay] = useState(today);
  const done = (title: string) => ({ onSuccess: () => toastSuccess(title), onError: (e: unknown) => toastError('Not saved', errorText(e)) });
  return (
    <tr>
      <td className={TD}>{invoiceName(f)}</td>
      <td className={NUM}>{fc(f.fcAmount, f.currency)}</td>
      <td className={NUM}>{f.inrAmount === null ? '—' : inr(f.inrAmount)}</td>
      <td className={TD}>
        {f.status === 'received' ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip raw tone="ok">{`${f.firaNo} · ${sheetDate(f.issuedOn)}`}</Chip>
            <Button size="sm" variant="quiet" disabled={act.updateFira.isPending} onClick={() => act.updateFira.mutate({ id: f.id, status: 'awaited' }, done('Set back to awaited'))}>
              Undo
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-wrap items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (no.trim() && day) act.updateFira.mutate({ id: f.id, status: 'received', firaNo: no.trim(), issuedOn: day }, done('FIRA recorded'));
            }}
          >
            <Input aria-label="FIRA number" placeholder="FIRA number" maxLength={60} value={no} onChange={(e) => setNo(e.target.value)} className="h-8 w-[150px]" />
            <Input type="date" aria-label="FIRA date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className="h-8 w-[150px]" />
            <Button size="sm" type="submit" disabled={!no.trim() || !day || act.updateFira.isPending}>
              Mark received
            </Button>
          </form>
        )}
      </td>
    </tr>
  );
}

function Fira({ data, sheetId }: { data: ReportsDto; sheetId: string }) {
  const { rows, awaited, received } = data.firas;
  return (
    <Section title="FIRA" aside={rows.length ? `${awaited} awaited · ${received} received` : undefined}>
      {rows.length === 0 ? (
        <EmptyState title="No foreign receipts need a FIRA yet" />
      ) : (
        <Table
          minWidth={720}
          head={
            <>
              <th className={TH}>Client · invoice</th>
              <th className={`${TH} text-right`}>Amount</th>
              <th className={`${TH} text-right`}>INR</th>
              <th className={TH}>FIRA from the bank</th>
            </>
          }
        >
          {rows.map((f) => (
            <FiraRow key={f.id} f={f} sheetId={sheetId} today={data.today} />
          ))}
        </Table>
      )}
    </Section>
  );
}

export function ReportsTab({ sheetId }: { sheetId: string }) {
  const { data, isLoading, error } = useReports(sheetId);
  if (isLoading) return <SkeletonRows rows={6} />;
  if (error) return <p className="py-10 text-center text-danger">{error.message}</p>;
  if (!data) return null;
  return (
    <>
      <Ageing data={data} />
      <DaysToPay data={data} />
      <Forecast data={data} sheetId={sheetId} />
      <Fx data={data} sheetId={sheetId} />
      <Tds data={data} sheetId={sheetId} />
      <Fira data={data} sheetId={sheetId} />
    </>
  );
}
