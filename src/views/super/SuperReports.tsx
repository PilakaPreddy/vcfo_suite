'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { Button } from '@/components/ui/button';
import {
  SuperPageError,
  SuperPageHead,
  SuperPageSkeleton,
} from '@/components/super/parts/super-parts';
import { plainDay } from '@/lib/date-format';
import { buildRisks, type SuperTeamManager } from '@/lib/super/super-insights-model';
import { useSuperInsights } from '@/views/super/use-super-insights';
import { useSuperStaff } from '@/components/super/assign/use-super-staff';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button-variants';
import { SaveReportDialog } from '@/components/super/reports/SaveReportDialog';
import { SavedReportsCard } from '@/components/super/reports/SavedReportsCard';
import { useApp } from '@/context/AppContext';
import { SBC_LOCKUP_DARK_SRC, SBC_LOCKUP_LIGHT_SRC } from '@/components/brand/SbcLogo';
import { clientLine, monthNumbers, onTimePct, recentMonths, type SavedReport } from '@/lib/reports/partner-report';
import { useProspects } from '@/views/super/growth/use-growth-data';
import { useFirmSettings } from '@/views/firm-settings/use-firm-settings';
import { errorMessage, toastError, toastSuccess } from '@/lib/toast-errors';
import { useSavedReportMutations, useSavedReports } from '@/views/super/reports/use-saved-reports';

/**
 * REPORTS (prototype `ReportsScreen`, the monthly partner report), counts only.
 *
 * Six numbers read from stored rows: active clients, prospects won and lost that month,
 * certificates issued, the average days to COI against the firm's target, filings filed on time
 * that month (`filed_on` on or before `due_date`), and registrations done so far. Items store
 * no finish date, so that last one is a running count. On time and late by month is on Filings.
 *
 * G-21: "Download PDF" renders the report on the server (`/api/super/reports/pdf`, built from
 * the same insights through `src/lib/reports/partner-report.ts`). "Save report", in the Saved
 * reports head, stores the report with its month, a schedule (none,
 * weekly, monthly) and recipients in `saved_reports`; the Inngest function
 * `saved-reports-send` emails due schedules with the PDF attached. The prototype's fee report
 * stays out (R-37: no money).
 */
const SUPER_REPORTS_HREF = '/app/super/reports';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "November" for the month after a "2026-10" key. */
function nextMonthName(key: string): string {
  const m = Number(key.slice(5, 7));
  return Number.isFinite(m) && m >= 1 ? MONTH_NAMES[m % 12]! : 'next month';
}

const managerColumnsFor = (adminOf: (managerId: string) => string | null): EFilingColumn<SuperTeamManager>[] => [
  { key: 'name', header: 'Manager', render: (m) => <span className="font-medium text-ink">{m.name}</span> },
  {
    key: 'admin',
    header: 'Admin',
    width: '120px',
    render: (m) => {
      const name = adminOf(m.id);
      return name ? <span className="block truncate">{name}</span> : <span className="text-ink-faint">–</span>;
    },
  },
  { key: 'clients', header: 'Clients', width: '80px', align: 'right', render: (m) => <span className="tabular-nums">{m.clients}</span> },
  { key: 'ontime', header: 'On time', width: '84px', align: 'right', render: (m) => <span className="tabular-nums">{onTimePct(m)}</span> },
  {
    key: 'coi',
    header: 'Days to COI',
    width: '104px',
    align: 'right',
    render: (m) => <span className="tabular-nums">{m.avgDaysToCoi === null ? '–' : `${m.avgDaysToCoi} ${m.avgDaysToCoi === 1 ? 'day' : 'days'}`}</span>,
  },
];

export default function SuperReports() {
  const query = useSuperInsights();
  const insights = query.data;
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const { user } = useApp();
  const staff = useSuperStaff();
  const saved = useSavedReports();
  const prospects = useProspects().data?.prospects;
  const targetDays = useFirmSettings().settings?.serviceTargets.daysToCoi ?? null;
  const { save, remove } = useSavedReportMutations();
  const [saving, setSaving] = useState<SavedReport | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SavedReport | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const recent = useMemo(() => (insights ? recentMonths(insights) : []), [insights]);
  const risks = useMemo(() => (insights ? buildRisks(insights, new Date()).slice(0, 4) : []), [insights]);

  const seo = <SEO title="Reports — VCFO Suite" description="The monthly partner report, from the firm's records." path={SUPER_REPORTS_HREF} />;

  if (query.isPending) {
    return (
      <PageTransition>
        {seo}
        <SuperPageSkeleton label="Loading reports" />
      </PageTransition>
    );
  }
  if (query.isError || !insights) {
    return (
      <PageTransition>
        {seo}
        <SuperPageError title="Reports could not load" error={query.error} onRetry={() => void query.refetch()} />
      </PageTransition>
    );
  }

  const month = recent.find((m) => m.key === monthKey) ?? recent[recent.length - 1];
  const clients = clientLine(insights);
  const latestKey = recent[recent.length - 1]?.key;

  function openSaved(r: SavedReport) {
    setOpenId(r.id);
    setMonthKey(r.params.month === 'latest' ? null : recent.some((m) => m.key === r.params.month) ? r.params.month : null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const numbers = month ? monthNumbers(insights, month, { prospects: prospects ?? [], targetDays }) : [];

  return (
    <PageTransition>
      {seo}
      <div className="flex flex-col gap-5">
        <SuperPageHead title="Reports" />

        {/* One row, as in the prototype: month tabs, the prepared line, then the actions at the right end. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <SpectrumTabs
            label="Month"
            size="md"
            items={recent.map((m) => ({ key: m.key, label: m.longLabel.split(' ')[0]! }))}
            value={month?.key ?? ''}
            onChange={(key) => {
              setMonthKey(key);
              setOpenId(null);
            }}
          />
          <span className="text-[12.5px] text-ink-muted">Partner report · prepared on {plainDay(insights.generatedAt)}</span>
          {month ? (
            <Button asChild className="ml-auto">
              <a href={`/api/super/reports/pdf?month=${month.key === latestKey ? 'latest' : month.key}`}>
                <Download aria-hidden />
                Download PDF
              </a>
            </Button>
          ) : null}
        </div>

        {month ? (
          <article className="mx-auto grid w-full min-w-0 max-w-[900px] grid-cols-1 gap-6 rounded-md border-1.5 border-line bg-surface-raised px-5 py-6 md:px-10 md:py-9 [&>*]:min-w-0">
            <header className="flex items-start justify-between gap-4 border-b-1.5 border-line pb-4">
              <span className="min-w-0">
                <span className="text-[12.5px] text-ink-muted">SBC · monthly partner report</span>
                <h2 className="text-[28px] font-medium leading-tight tracking-[-0.01em] text-ink">{month.longLabel}</h2>
              </span>
              {/* Our own brand files, not a remote CDN, so a plain <img> is right; dark mode swaps the lockup. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={SBC_LOCKUP_LIGHT_SRC} alt="SBC" width={115} height={34} className="block h-[34px] w-auto dark:hidden" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={SBC_LOCKUP_DARK_SRC} alt="SBC" width={115} height={34} className="hidden h-[34px] w-auto dark:block" />
            </header>
            <section>
              <h3 className="mb-2 text-[15px] font-medium text-ink">The month in numbers</h3>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {numbers.map((n) => (
                  <div key={n.k} className="flex min-w-0 flex-col gap-1.5 rounded-md border-1.5 border-line px-4 py-3.5">
                    <span className="truncate text-[13px] font-medium text-ink-2" title={n.k}>
                      {n.k}
                    </span>
                    <b className={cn('text-[26px] font-medium leading-none tabular-nums', n.tone === 'warn' && 'text-warning')}>{n.v}</b>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h3 className="mb-1 text-[15px] font-medium text-ink">Clients</h3>
              <p className="text-[13.5px] text-ink-2">{clients}</p>
            </section>
            <section>
              <h3 className="mb-2 text-[15px] font-medium text-ink">Managers</h3>
              <div className="overflow-hidden rounded-md border-1.5 border-line">
                <EFilingGrid caption="Managers" columns={managerColumnsFor((id) => staff.adminOfManager.get(id)?.name ?? null)} rows={insights.team.managers} rowKey={(m) => m.id} empty="No manager yet" minWidth={600} />
              </div>
            </section>
            <section>
              <h3 className="mb-1 text-[15px] font-medium text-ink">Top risks for {nextMonthName(month.key)}</h3>
              {risks.length === 0 ? (
                <p className="text-[13.5px] text-ink-2">None</p>
              ) : (
                <ol className="grid list-decimal gap-1.5 pl-5 text-[13.5px] text-ink-2">
                  {risks.map((r) => (
                    <li key={r.id}>
                      {r.title} · {r.companyName}
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <footer className="border-t border-line-soft pt-3 text-[12px] text-ink-muted">
              Prepared by VCFO Suite from the firm&apos;s records on {plainDay(insights.generatedAt)}.
            </footer>
          </article>
        ) : null}

        <SavedReportsCard
          reports={saved.data ?? []}
          loading={saved.isPending}
          error={saved.isError ? errorMessage(saved.error, 'Saved reports could not load.') : null}
          onOpen={openSaved}
          openId={openId}
          onSchedule={setSaving}
          onDelete={setDeleting}
          onSave={month ? () => setSaving('new') : undefined}
        />
      </div>

      <SaveReportDialog
        open={saving !== null}
        onOpenChange={(o) => !o && setSaving(null)}
        report={saving === 'new' ? null : saving}
        monthKey={month?.key ?? ''}
        monthLabel={month?.longLabel ?? ''}
        defaultRecipient={user?.email ?? ''}
        saving={save.isPending}
        onSave={(values) =>
          save.mutate(
            { id: saving && saving !== 'new' ? saving.id : undefined, values },
            {
              onSuccess: (r) => {
                toastSuccess(`${r.name} saved`);
                setSaving(null);
              },
              onError: (err) => toastError('Could not save the report', errorMessage(err)),
            },
          )
        }
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this saved report?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `${deleting.name} and its schedule will be removed. Nothing more goes to its recipients.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              className={buttonVariants({ variant: 'destructive' })}
              onClick={(e) => {
                e.preventDefault();
                if (!deleting) return;
                remove.mutate(deleting.id, {
                  onSuccess: () => setDeleting(null),
                  onError: (err) => toastError('Could not delete the report', errorMessage(err)),
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageTransition>
  );
}
