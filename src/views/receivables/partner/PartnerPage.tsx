'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDownToLine, CalendarClock, CheckCircle2, CircleAlert, FileText, Printer, Search, Sparkles, Wallet, X } from 'lucide-react';
import { DashHero, type DashHeroStat } from '@/components/dash/DashHero';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { FilterSelect } from '@/components/ui/native-select';
import { Chip } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { daysLeft, sheetDate } from '@/lib/receivables/dates';
import type { PartnerInvoiceChange } from '@/lib/receivables/publish-alerts';
import type { PartnerRowDto } from '@/lib/receivables/partner-wire';
import { receivedThisWeek, sumInr } from '@/lib/receivables/summary';
import { PARTNER_EXPORT_HREF, usePartnerHome } from '@/hooks/use-receivables-partner';
import { inr, stamp } from '../format';
import { plural } from '../sheet-parts';
import { InvoiceDetails } from './InvoiceDetails';
import { InvoiceList } from './InvoiceList';
import { PartnerHeader } from './PartnerHeader';
import { changeWord, changesSince, readSeen, seenFrom, writeSeen } from './seen-changes';

/**
 * The signed-in client partner's page (/receivables, Phases 8 and 10 of
 * docs/specs/receivables/PLAN.md): the partner's own invoices of the latest published version.
 * The home card on the colour wash greets them and holds the numbers (open, overdue, due in seven
 * days, received this week) with the published stamp; "What changed since your last visit"
 * lists what SBC's latest Update moved (remembered per browser, `seen-changes.ts`); overdue
 * invoices come first under "Needs attention"; search, a client filter and status tabs narrow
 * the lists; each invoice opens in a drawer (promise to pay, notes, reminder timeline).
 * `?invoice=<id>` opens that invoice on load; reminder emails link there.
 */

type StatusFilter = 'open' | 'overdue' | 'not_due' | 'received';
const DUE_SOON_DAYS = 7;

function greeting(now = new Date()): string {
  const h = Number(new Date(now.getTime() + 330 * 60_000).toISOString().slice(11, 13));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Shell({ children, header }: { children: React.ReactNode; header: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface text-ink">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 pb-12">
        {header}
        {children}
      </div>
    </div>
  );
}

function matches(r: PartnerRowDto, q: string): boolean {
  if (!q) return true;
  const digits = q.replace(/[₹,\s]/g, '');
  return (
    r.clientName.toLowerCase().includes(q) ||
    (r.invoiceNo ?? '').toLowerCase().includes(q) ||
    (/^\d+$/.test(digits) && String(Math.round(r.amountInr)).includes(digits))
  );
}

export function PartnerPage() {
  const router = useRouter();
  const params = useSearchParams();
  const home = usePartnerHome();
  const [openId, setOpenId] = useState<string | null>(params.get('invoice'));
  const [client, setClient] = useState('');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [search, setSearch] = useState('');
  const [changes, setChanges] = useState<PartnerInvoiceChange[]>([]);
  const [changesFrom, setChangesFrom] = useState<string | null>(null);

  // A reminder email links to ?invoice=<id>; follow the address when it changes.
  const fromUrl = params.get('invoice');
  useEffect(() => {
    if (fromUrl) setOpenId(fromUrl);
  }, [fromUrl]);

  const showInvoice = (id: string | null) => {
    setOpenId(id);
    const q = new URLSearchParams(params.toString());
    if (id) q.set('invoice', id);
    else q.delete('invoice');
    const qs = q.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  };

  const data = home.data;
  const rows = useMemo(() => data?.rows ?? [], [data]);

  // "What changed since your last visit": compare with what this browser last showed, then remember this version.
  const email = data?.partner.email;
  const publishedAt = data?.publishedAt ?? null;
  useEffect(() => {
    if (!email || !publishedAt) return;
    const before = readSeen(email);
    if (before && before.publishedAt !== publishedAt) {
      setChanges(changesSince(before, publishedAt, rows));
      setChangesFrom(before.publishedAt);
    }
    writeSeen(email, seenFrom(publishedAt, rows));
  }, [email, publishedAt, rows]);

  const clients = useMemo(() => [...new Set(rows.map((r) => r.clientName))].sort((a, b) => a.localeCompare(b)), [rows]);
  const header = <PartnerHeader clientOrgName={data?.clientOrgName} partnerName={data?.partner.name} current="sheet" />;

  if (home.isPending) {
    return (
      <Shell header={header}>
        <div className="bg-wash rounded-md border border-line px-5 py-6" aria-busy>
          <SkeletonRows rows={2} />
        </div>
        <DashSection title="Invoices" loading>
          <span />
        </DashSection>
      </Shell>
    );
  }

  if (home.isError || !data) {
    return (
      <Shell header={header}>
        <EmptyState
          title={
            <span role="alert" className="text-ink-2">
              {home.error instanceof Error ? home.error.message : 'The invoices did not load.'}
            </span>
          }
          action={
            <Button size="sm" variant="secondary" onClick={() => void home.refetch()}>
              Try again
            </Button>
          }
        />
      </Shell>
    );
  }

  const today = data.today;
  const first = data.partner.name.trim().split(/\s+/)[0] || data.partner.name;
  const details = openId ? <InvoiceDetails invoiceId={openId} today={today} preview={rows.find((r) => r.id === openId)} onClose={() => showInvoice(null)} /> : null;

  if (!data.publishedAt) {
    return (
      <Shell header={header}>
        <DashHero title={`${greeting()}, ${first}`} subtitle="Nothing is published yet" />
        <EmptyState title="Nothing is published yet." action={<span className="text-[13px]">SBC will share your invoices here after their first update.</span>} />
        {details}
      </Shell>
    );
  }

  // Search and client narrow everything below the card; the card keeps the partner's whole picture.
  const q = search.trim().toLowerCase();
  const scoped = rows.filter((r) => (!client || r.clientName === client) && matches(r, q));
  const open = rows.filter((r) => r.status === 'open');
  const overdueAll = open.filter((r) => daysLeft(r.dueDate, today) < 0);
  const soonAll = open.filter((r) => daysLeft(r.dueDate, today) >= 0 && daysLeft(r.dueDate, today) <= DUE_SOON_DAYS);
  const weekAll = rows.filter((r) => receivedThisWeek(r, today));
  const oldest = overdueAll.reduce((m, r) => Math.max(m, -daysLeft(r.dueDate, today)), 0);

  const overdue = scoped.filter((r) => r.status === 'open' && daysLeft(r.dueDate, today) < 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.amountInr - a.amountInr);
  const notDue = scoped.filter((r) => r.status === 'open' && daysLeft(r.dueDate, today) >= 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const received = scoped.filter((r) => r.status === 'received').sort((a, b) => (b.paidOn ?? '').localeCompare(a.paidOn ?? ''));
  const receivedWeek = received.filter((r) => receivedThisWeek(r, today));
  const changedWords = new Map(changes.map((c) => [c.invoiceId, changeWord(c)]));
  const filtering = Boolean(q || client);

  const stats: DashHeroStat[] = [
    { label: 'Open receivables', icon: Wallet, value: `₹${inr(sumInr(open))}`, note: plural(open.length, 'invoice') },
    {
      label: 'Overdue',
      icon: CircleAlert,
      value: `₹${inr(sumInr(overdueAll))}`,
      hot: overdueAll.length > 0,
      note: overdueAll.length ? `${plural(overdueAll.length, 'invoice')}, oldest ${plural(oldest, 'day')}` : 'Nothing overdue',
      onClick: overdueAll.length ? () => setStatus('overdue') : undefined,
    },
    { label: `Due in ${DUE_SOON_DAYS} days`, icon: CalendarClock, value: `₹${inr(sumInr(soonAll))}`, note: soonAll.length ? plural(soonAll.length, 'invoice') : 'Nothing due this week' },
    { label: 'Received this week', icon: CheckCircle2, value: `₹${inr(weekAll.reduce((s, r) => s + (r.paidAmount ?? 0), 0))}`, good: weekAll.length > 0, note: plural(weekAll.length, 'payment') },
  ];

  const tabs = [
    { key: 'open', label: 'Open', count: overdue.length + notDue.length },
    { key: 'overdue', label: 'Overdue', count: overdue.length },
    { key: 'not_due', label: 'Not due', count: notDue.length },
    { key: 'received', label: 'Received', count: received.length },
  ];
  const empty = (what: string) => (
    <div className="p-4">
      <EmptyState
        title={filtering ? `No ${what} match your search.` : `No ${what}.`}
        action={
          filtering ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setSearch('');
                setClient('');
              }}
            >
              Clear search
            </Button>
          ) : undefined
        }
      />
    </div>
  );

  return (
    <Shell header={header}>
      <DashHero
        title={`${greeting()}, ${first}`}
        subtitle={
          <>
            <Chip raw tone="ok" className="min-w-0">
              Live
            </Chip>
            <span className="truncate">Published {stamp(data.publishedAt)} by SBC</span>
          </>
        }
        stats={stats}
      >
        <Button size="sm" variant="secondary" asChild>
          <Link href="/receivables/statement">
            <FileText aria-hidden /> Statement
          </Link>
        </Button>
        <Button size="sm" variant="secondary" asChild>
          <a href={PARTNER_EXPORT_HREF}>
            <ArrowDownToLine aria-hidden /> Download Excel
          </a>
        </Button>
      </DashHero>

      {changes.length ? (
        <DashSection
          title="What changed since your last visit"
          headIcon={{ icon: Sparkles, tone: 'blue' }}
          meta={changesFrom ? `SBC published an update after ${stamp(changesFrom)}` : undefined}
          right={
            <Button size="sm" variant="quiet" onClick={() => setChanges([])} aria-label="Hide what changed">
              <X aria-hidden /> Hide
            </Button>
          }
          flush
        >
          <ul>
            {changes.map((c) => (
              <li key={`${c.invoiceId}-${c.kind}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-4 py-2.5 text-[13px] first:border-t-0 md:px-5">
                <Chip raw tone={c.kind === 'removed' ? 'idle' : c.status === 'received' ? 'ok' : 'prog'} className="w-[136px]">
                  {changeWord(c)}
                </Chip>
                <span className="ml-auto tabular-nums text-ink-2 sm:order-3 sm:ml-0">₹{inr(c.amountInr)}</span>
                <span className="min-w-0 basis-full truncate sm:order-2 sm:flex-1 sm:basis-auto">
                  <span className="font-medium">{c.clientName}</span>
                  {c.invoiceNo ? <span className="ml-2 font-mono text-[12px] text-ink-muted">{c.invoiceNo}</span> : null}
                  <span className="ml-2 text-[12.5px] text-ink-muted sm:hidden">due {sheetDate(c.dueDate)}</span>
                </span>
                <span className="hidden w-[92px] text-right text-[12.5px] text-ink-muted sm:order-4 sm:inline">due {sheetDate(c.dueDate)}</span>
              </li>
            ))}
          </ul>
        </DashSection>
      ) : null}

      <div className="flex flex-wrap items-center gap-2.5 print:hidden">
        <div className="relative min-w-0 flex-[1_1_240px] sm:max-w-[340px]">
          <label htmlFor="rcv-partner-search" className="sr-only">
            Search invoices
          </label>
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
          <Input id="rcv-partner-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client, invoice no. or amount" className="h-control-sm pl-8 text-[13px]" />
        </div>
        {clients.length > 1 ? (
          <FilterSelect
            aria-label="Client"
            value={client}
            onChange={(e) => setClient(e.target.value)}
            options={[{ value: '', label: 'All clients' }, ...clients.map((c) => ({ value: c, label: c }))]}
          />
        ) : null}
        <SpectrumTabs label="Status" items={tabs} value={status} onChange={(k) => setStatus(k as StatusFilter)} className="max-sm:w-full" />
      </div>

      {status === 'open' || status === 'overdue' ? (
        <DashSection
          title="Needs attention"
          headIcon={{ icon: CircleAlert, tone: overdue.length ? 'red' : 'green' }}
          meta={overdue.length ? `${plural(overdue.length, 'overdue invoice')} · ₹${inr(sumInr(overdue))}` : undefined}
          flush
        >
          {overdue.length ? (
            <InvoiceList rows={overdue} today={today} onOpen={showInvoice} changed={changedWords} />
          ) : filtering ? (
            empty('overdue invoices')
          ) : (
            <div className="p-4">
              <EmptyState title="Nothing is overdue. Thank you." />
            </div>
          )}
        </DashSection>
      ) : null}

      {status === 'open' || status === 'not_due' ? (
        <DashSection title="Coming up" headIcon={{ icon: CalendarClock, tone: 'blue' }} meta={notDue.length ? `${plural(notDue.length, 'invoice')} · ₹${inr(sumInr(notDue))}` : undefined} flush>
          {notDue.length ? <InvoiceList rows={notDue} today={today} onOpen={showInvoice} changed={changedWords} /> : empty('invoices waiting for their due date')}
        </DashSection>
      ) : null}

      {status === 'received' ? (
        <DashSection title="Received" headIcon={{ icon: CheckCircle2, tone: 'green' }} meta={received.length ? plural(received.length, 'invoice') : undefined} flush>
          {received.length ? <InvoiceList rows={received} today={today} onOpen={showInvoice} received changed={changedWords} /> : empty('received invoices')}
        </DashSection>
      ) : status === 'open' && receivedWeek.length ? (
        <DashSection
          title="Received this week"
          headIcon={{ icon: CheckCircle2, tone: 'green' }}
          meta={`${plural(receivedWeek.length, 'payment')} · ₹${inr(receivedWeek.reduce((s, r) => s + (r.paidAmount ?? 0), 0))}`}
          flush
        >
          <InvoiceList rows={receivedWeek} today={today} onOpen={showInvoice} received changed={changedWords} />
        </DashSection>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-ink-muted">
        <span>The figures change when SBC publishes an update.</span>
        <Button size="sm" variant="quiet" className="print:hidden" onClick={() => window.print()}>
          <Printer aria-hidden /> Print
        </Button>
      </div>
      {details}
    </Shell>
  );
}

