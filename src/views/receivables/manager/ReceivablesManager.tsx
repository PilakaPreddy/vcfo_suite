'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/native-select';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { Chip } from '@/components/ui/spectrum-chip';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import { todayIst } from '@/lib/receivables/dates';
import type { SheetListItem } from '@/lib/receivables/wire';
import { useManagerSheet, useOutlookStatus, useReceivablesActions } from '@/hooks/use-receivables';
import { OUTLOOK_CONNECT_HREF } from './ComposeSummary';
import { BankTab } from './BankTab';
import { PartnersTab } from './PartnersTab';
import { RemindersTab } from './RemindersTab';
import { ReportsTab } from './ReportsTab';
import { SheetTab } from './SheetTab';
import { VersionsTab } from './VersionsTab';

/**
 * /receivables/manager (docs/specs/receivables/PLAN.md): the one manager's workspace, outside
 * the staff shell. A light header with the Outlook link, and six tabs: Sheet, From bank,
 * Reminders, Partners, Versions, Reports.
 */

const TABS = [
  { key: 'sheet', label: 'Sheet' },
  { key: 'bank', label: 'From bank' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'partners', label: 'Partners' },
  { key: 'versions', label: 'Versions' },
  { key: 'reports', label: 'Reports' },
] as const;
type Tab = (typeof TABS)[number]['key'];

export function ReceivablesManager({ sheets, sheetId, userName, homeHref }: { sheets: SheetListItem[]; sheetId: string; userName: string; homeHref: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'sheet') as Tab;
  const { data, isLoading, error } = useManagerSheet(sheetId);
  const actions = useReceivablesActions(sheetId);
  const outlook = useOutlookStatus();
  const today = todayIst();

  // Back from the Outlook connect flow (?outlook=connected or ?outlook=error&reason=…).
  useEffect(() => {
    const result = params.get('outlook');
    if (!result) return;
    if (result === 'connected') toastSuccess('Outlook connected', 'Emails now send from your mailbox.');
    else toastError('Outlook did not connect', params.get('reason') || 'Try Connect Outlook again.');
    const q = new URLSearchParams(params.toString());
    q.delete('outlook');
    q.delete('reason');
    router.replace(`/receivables/manager${q.toString() ? `?${q}` : ''}`, { scroll: false });
  }, [params, router]);

  const go = (next: { tab?: string; sheet?: string }) => {
    const q = new URLSearchParams(params.toString());
    if (next.tab) q.set('tab', next.tab);
    if (next.sheet) q.set('sheet', next.sheet);
    router.replace(`/receivables/manager?${q.toString()}`, { scroll: false });
  };

  return (
    <div className="min-h-screen bg-surface text-ink">
      <div className="mx-auto max-w-[1180px] px-4 pb-12">
        <header className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={homeHref} className="text-[13px] font-bold tracking-[.06em] text-ink">
              VCFO SUITE
            </Link>
            <span className="text-[13px] text-ink-muted">/ Receivables</span>
            {sheets.length > 1 ? (
              <FilterSelect aria-label="Sheet" value={sheetId} onChange={(e) => go({ sheet: e.target.value })} options={sheets.map((s) => ({ value: s.id, label: s.clientOrgName }))} />
            ) : (
              <span className="text-[13px] font-medium text-ink-2">· {data?.sheet.clientOrgName ?? sheets[0]?.clientOrgName}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            {outlook.data?.connected ? (
              <Chip raw tone="ok" title="Summary emails send from this mailbox">
                {`Outlook: ${outlook.data.msEmail}`}
              </Chip>
            ) : outlook.data?.configured ? (
              <Button size="sm" variant="strong" asChild>
                <a href={OUTLOOK_CONNECT_HREF}>Connect Outlook</a>
              </Button>
            ) : null}
            <span className="font-medium text-ink-2">{userName}</span>
            <Button size="sm" variant="quiet" asChild>
              <Link href={homeHref}>Back to VCFO Suite</Link>
            </Button>
            <Button size="sm" variant="quiet" onClick={() => void signOut({ callbackUrl: '/login' })}>
              Log out
            </Button>
          </div>
        </header>

        <SpectrumTabs variant="underline" label="Receivables" className="mb-4" items={TABS.map((t) => ({ key: t.key, label: t.label }))} value={tab} onChange={(k) => go({ tab: k })} />

        {isLoading ? <p className="py-10 text-center text-ink-muted">Loading the sheet…</p> : null}
        {error ? <p className="py-10 text-center text-danger">{error.message}</p> : null}
        {data ? (
          tab === 'sheet' ? (
            <SheetTab data={data} actions={actions} today={today} />
          ) : tab === 'bank' ? (
            <BankTab data={data} />
          ) : tab === 'reminders' ? (
            <RemindersTab data={data} actions={actions} />
          ) : tab === 'partners' ? (
            <PartnersTab data={data} actions={actions} />
          ) : tab === 'reports' ? (
            <ReportsTab sheetId={sheetId} />
          ) : (
            <VersionsTab sheetId={sheetId} />
          )
        ) : null}
      </div>
    </div>
  );
}
