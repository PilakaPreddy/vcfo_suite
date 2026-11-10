'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CalendarClock, FileWarning, IndianRupee, Plus } from 'lucide-react';
import { DashHero } from '@/components/dash/DashHero';
import { DashSection } from '@/components/dash/DashSection';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { FilterSelect } from '@/components/ui/native-select';
import { Chip } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { useApp } from '@/context/AppContext';
import { useNotices, type NoticeCase } from '@/hooks/use-notices';
import { NOTICE_AUTHORITY_LABEL, NOTICE_STAGE_LABEL, type NoticeAuthority } from '@/lib/notices/model';
import { cn } from '@/lib/utils';
import { dueLabel, dueTone, STAGE_TONE } from './notice-format';
import { NoticeDrawer } from './NoticeDrawer';
import { NoticeIntake } from './NoticeIntake';

type View = 'open' | 'done' | 'all';

const DUE_CLASS = { danger: 'text-danger', warning: 'text-warning', muted: 'text-ink-muted' } as const;

const rupees = (n: number) => `Rs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/**
 * NOTICES — the notice desk across the staff member's clients (IDEAS-PLAN wave 2, section C). One
 * page for every staff role; GET /api/notices is scoped by `AuthContext`, so each role sees its
 * own clients. The board is sorted by the reply date; a row opens the case drawer (summary, reply
 * draft, documents, stage). "Read a notice" uploads a notice, reads it and opens a case after the
 * person checks the fields. `?case=<id>` opens a case directly (the escalation emails link there).
 */
export function NoticesPage({ basePath }: { basePath: string }) {
  const q = useNotices();
  const { user, engagements } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const [view, setView] = useState<View>('open');
  const [client, setClient] = useState('');
  const [authority, setAuthority] = useState<'' | NoticeAuthority>('');
  const [intake, setIntake] = useState(false);
  const [openId, setOpenId] = useState<string | null>(params.get('case'));
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const id = params.get('case');
    if (id) setOpenId(id);
  }, [params]);

  const items = useMemo(() => q.data ?? [], [q.data]);
  const clients = useMemo(() => [...new Map(items.map((i) => [i.engagementId, i.companyName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [items]);
  const authorities = useMemo(() => [...new Set(items.map((i) => i.authority))], [items]);
  const scoped = items.filter((i) => (!client || i.engagementId === client) && (!authority || i.authority === authority));
  const shown = scoped.filter((i) => view === 'all' || (view === 'open' ? i.open : !i.open));
  const open = items.filter((i) => i.open);
  const overdue = open.filter((i) => i.daysLeft !== null && i.daysLeft < 0).length;
  const week = open.filter((i) => i.daysLeft !== null && i.daysLeft >= 0 && i.daysLeft <= 7).length;
  const demand = open.reduce((sum, i) => sum + (i.demandAmount ? Number(i.demandAmount) : 0), 0);
  const selected: NoticeCase | null = items.find((i) => i.id === openId) ?? null;

  const closeCase = () => {
    setOpenId(null);
    if (params.get('case')) router.replace(basePath);
  };

  return (
    <PageTransition>
      <SEO title="Notices — VCFO Suite" description="Tax, GST, TDS and MCA notices across your clients." path={basePath} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <DashHero
          title="Notices"
          subtitle="GST, income tax, TDS and MCA notices across your clients"
          stats={[
            { label: 'Overdue replies', icon: AlertTriangle, value: overdue, hot: overdue > 0, onClick: () => setView('open') },
            { label: 'Due within 7 days', icon: CalendarClock, value: week, onClick: () => setView('open') },
            { label: 'Open cases', icon: FileWarning, value: open.length, onClick: () => setView('open') },
            { label: 'Open demand', icon: IndianRupee, value: rupees(demand), onClick: () => setView('open') },
          ]}
        />
        <DashSection
          title="Notice board"
          meta={q.isLoading ? undefined : `${shown.length} of ${items.length}`}
          right={
            <span className="flex flex-wrap items-center gap-2">
              {clients.length > 1 ? (
                <FilterSelect
                  aria-label="Client"
                  options={[{ value: '', label: 'All my clients' }, ...clients.map(([value, label]) => ({ value, label }))]}
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                />
              ) : null}
              {authorities.length > 1 ? (
                <FilterSelect
                  aria-label="Authority"
                  options={[{ value: '', label: 'Every authority' }, ...authorities.map((a) => ({ value: a, label: NOTICE_AUTHORITY_LABEL[a] }))]}
                  value={authority}
                  onChange={(e) => setAuthority(e.target.value as '' | NoticeAuthority)}
                />
              ) : null}
              <SpectrumTabs
                label="Cases"
                items={[
                  { key: 'open', label: 'Open', count: scoped.filter((i) => i.open).length },
                  { key: 'done', label: 'Submitted or closed', count: scoped.filter((i) => !i.open).length },
                  { key: 'all', label: 'All', count: scoped.length },
                ]}
                value={view}
                onChange={(v) => setView(v as View)}
              />
              <Button size="sm" onClick={() => setIntake(true)}>
                <Plus size={14} aria-hidden /> Read a notice
              </Button>
            </span>
          }
        >
          {flash ? (
            <p role="status" className="mb-2 text-[13px] text-positive">
              {flash}
            </p>
          ) : null}
          {q.isLoading ? (
            <SkeletonRows rows={5} />
          ) : q.isError ? (
            <EmptyState title="The notice board did not load." action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Try again</Button>} />
          ) : shown.length === 0 ? (
            <EmptyState
              title={items.length === 0 ? 'No notices yet. Read a notice here, or drop one into Ask VCFO, to open a case.' : 'No case matches these filters.'}
              action={items.length === 0 ? <Button size="sm" variant="outline" onClick={() => setIntake(true)}>Read a notice</Button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-[14px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12.5px] text-ink-muted">
                    <th scope="col" className="py-2 pr-3 font-medium">Client</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Notice</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Reply due</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Stage</th>
                    <th scope="col" className="py-2 font-medium">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((item) => (
                    <tr
                      key={item.id}
                      className="cursor-pointer border-b border-line align-top last:border-0 hover:bg-hover"
                      onClick={() => setOpenId(item.id)}
                    >
                      <td className="py-2.5 pr-3">
                        <b className="block font-medium text-ink">{item.companyName}</b>
                        <span className="block text-[12.5px] text-ink-muted">{NOTICE_AUTHORITY_LABEL[item.authority]}</span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <button type="button" className="text-left text-ink hover:underline" onClick={() => setOpenId(item.id)}>
                          {item.label}
                        </button>
                        <span className="block text-[12.5px] text-ink-muted">
                          {[item.din ? `DIN ${item.din}` : null, item.demandAmount ? rupees(Number(item.demandAmount)) : null].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-3">
                        <span className="block font-mono text-[13px] text-ink">{item.responseDueOn ?? '—'}</span>
                        <span className={cn('block text-[12.5px]', DUE_CLASS[dueTone(item)])}>{dueLabel(item)}</span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <Chip tone={STAGE_TONE[item.stage]} raw fixed>
                          {NOTICE_STAGE_LABEL[item.stage]}
                        </Chip>
                      </td>
                      <td className="py-2.5 text-ink-2">{item.ownerName ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DashSection>
      </div>
      <NoticeIntake
        open={intake}
        onOpenChange={setIntake}
        engagements={engagements.map((e) => ({ id: e.id, name: e.companyName }))}
        onOpened={(summary) => setFlash(summary)}
      />
      <NoticeDrawer item={selected} role={user?.role ?? 'intern'} onClose={closeCase} onDone={(message) => setFlash(message)} />
    </PageTransition>
  );
}
