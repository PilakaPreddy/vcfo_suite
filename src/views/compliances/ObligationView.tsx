'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, FileSpreadsheet } from 'lucide-react';
import { WhatsThisButton } from '@/components/ask/WhatsThisButton';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { CompanyPicker } from '@/components/admin/CompanyPicker';
import { Button } from '@/components/ui/button';
import { AreaPill } from '@/components/ui/spectrum-chip';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { filingStatus, financialYearLabel, rowsInFinancialYear, todayIST, type FilingRow } from '@/lib/compliance/filings';
import { cn } from '@/lib/utils';
import {
  ALL_COMPANIES,
  normaliseCompanyParam,
  rowsForCompany,
  type ComplianceScope,
} from '@/views/compliances/compliance-scope';
import { areaLabel, daysUntil, filingWord, isIdentifier, plainDate } from '@/lib/compliance/spectrum-status';
import { Fact, FlowCard, HeadRing, RailCard, WordChip } from '@/views/compliances/spectrum-parts';
import { areaOf, focusNodes, portalFor } from '@/lib/client-portal/compliances';
import { AssistCard } from '@/components/compliances/AssistParts';
import { StaffFromClientCard, StaffSbcFieldsCard } from '@/views/compliances/input-cards';
import { BeforeFilingCard, FilingThreadCard } from '@/views/compliances/record-cards';
import { obligationChecklist } from '@/data/before-filing';
import { FilingProofCell, FilingWindowCell } from '@/views/compliances/filing-actions';
import { ObligationAboutCards } from '@/views/compliances/obligation-about-cards';
import { useMayWriteFilings, useRegister } from '@/views/compliances/use-register';
import { statHref } from '@/views/compliances/tasks/task-list';
import {
  dueWithinSoon,
  flowCounts,
  groupObligations,
  waitingOnClient,
} from '@/lib/compliance/obligation-groups';

const RISK_WORD: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/**
 * OBLIGATION RECORD — one statutory obligation across the clients in view.
 *
 * The head carries the facts that the register holds (area, authority,
 * frequency, the period that needs attention, how many clients have filed
 * it, how many are late, the penalty risk), then a T1 grid of each client's
 * instance for that period with the window and proof actions, and a second
 * grid of every period on record. `?company=` narrows the page to one client.
 * The rail closes with About, Why it applies and If filed late from the scoped
 * obligation read (G-04). With one client's period in view the page adds From the client,
 * Filled by SBC and File with VCFO Assist (migration 0029). Everything comes from the scoped register; nothing is invented.
 */
export function ObligationView({
  basePath,
  scope,
  obligationId,
}: {
  basePath: string;
  scope: ComplianceScope;
  obligationId: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const now = useMemo(() => new Date(), []);
  const mayWrite = useMayWriteFilings();
  const register = useRegister(now);

  const instances = useMemo(() => register.rows.filter((r) => r.obligationId === obligationId), [register.rows, obligationId]);
  const clients = useMemo(() => {
    const ids = new Set(instances.map((r) => r.engagementId));
    return scope.engagements.filter((e) => ids.has(e.id));
  }, [instances, scope.engagements]);
  const companyId = clients.length === 1 ? clients[0]!.id : normaliseCompanyParam(params.get('company'), clients);
  const scoped = useMemo(() => rowsForCompany(instances, companyId), [instances, companyId]);
  const group = useMemo(() => groupObligations(scoped, register.details, now)[0], [scoped, register.details, now]);

  if (register.isPending) {
    return (
      <div className="surface p-4" aria-busy="true" aria-label="Loading obligation">
        <SkeletonRows rows={6} />
      </div>
    );
  }
  if (!group) {
    return (
      <EmptyState
        title="This obligation has no filings for your clients"
        action={
          <Button size="sm" variant="secondary" asChild>
            <Link href={`${basePath}/obligations`}>Open obligations</Link>
          </Button>
        }
      />
    );
  }

  const showClient = companyId === ALL_COMPANIES && clients.length > 1;
  const late = group.rows.filter((r) => r.status === 'overdue').length;
  const fyRows = rowsInFinancialYear(scoped, register.fyStartYear);
  const fyFiled = fyRows.filter((r) => r.filedOn).length;
  const risk = group.rows.map((r) => r.detail?.penaltyRisk).find(Boolean);
  const flow = flowCounts(group.rows.map((r) => r.row), register.details);
  const soon = scoped.filter((r) => dueWithinSoon(r, now)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const waiting = scoped.filter((r) => waitingOnClient(r, register.details.get(r.id), now));
  const companyQuery = companyId !== ALL_COMPANIES && clients.length > 1 ? `&company=${encodeURIComponent(companyId)}` : '';
  const ref = (row: FilingRow) => register.details.get(row.id)?.acknowledgementNo?.trim() || null;

  const setCompany = (id: string) => {
    const search = new URLSearchParams(params.toString());
    if (id === ALL_COMPANIES) search.delete('company');
    else search.set('company', id);
    const q = search.toString();
    router.replace(`${basePath}/obligations/${encodeURIComponent(obligationId)}${q ? `?${q}` : ''}`, { scroll: false });
  };

  const refCell = (row: FilingRow) => {
    const value = ref(row);
    return value ? <span className={cn(isIdentifier(value) && 'font-mono text-[13px]')}>{value}</span> : <span className="text-ink-faint">—</span>;
  };

  const periodCols: EFilingColumn<FilingRow>[] = [
    ...(showClient ? [{ key: 'client', header: 'Client', width: '20%', render: (row: FilingRow) => <span className="font-medium text-ink">{row.companyName}</span> }] : []),
    {
      key: 'period',
      header: 'Period',
      width: '16%',
      // The period opens that client's statutory detail page (COMPLIANCE-MODEL.md 4.2).
      render: (row) => (
        <Link href={statHref(basePath, obligationId, row.id)} className="font-medium text-brand-text hover:underline">
          {row.periodLabel ?? row.fyLabel ?? '—'}
        </Link>
      ),
    },
    {
      key: 'due',
      header: 'Due',
      width: '104px',
      render: (row) => (
        <span className={filingStatus(row, now) === 'overdue' ? 'font-medium text-danger' : ''}>{plainDate(row.dueDate, now)}</span>
      ),
    },
    { key: 'filed', header: 'Filed on', width: '104px', render: (row) => <span className={row.filedOn ? 'text-ink' : 'text-ink-muted'}>{plainDate(row.filedOn, now)}</span> },
    { key: 'ref', header: 'Reference', width: '18%', render: refCell },
    {
      key: 'owner',
      header: 'Owner',
      width: '14%',
      render: (row) => register.details.get(row.id)?.ownerName ?? <span className="text-ink-faint">—</span>,
    },
    { key: 'status', header: 'Status', width: '128px', render: (row) => <WordChip filing word={filingWord(row, now)} /> },
    { key: 'window', header: 'Window', width: '176px', render: (row) => <FilingWindowCell row={row} mayWrite={mayWrite} /> },
    {
      key: 'proof',
      header: 'Proof',
      width: '120px',
      align: 'right',
      render: (row) => <FilingProofCell row={row} detail={register.details.get(row.id)} mayWrite={mayWrite} now={now} />,
    },
  ];

  const historyCols: EFilingColumn<FilingRow>[] = [
    ...(showClient ? [{ key: 'client', header: 'Client', width: '22%', render: (row: FilingRow) => <span className="font-medium text-ink">{row.companyName}</span> }] : []),
    {
      key: 'period',
      header: 'Period',
      width: '20%',
      render: (row) => (
        <Link href={statHref(basePath, obligationId, row.id)} className="hover:text-brand-text hover:underline">
          {row.periodLabel ?? row.fyLabel ?? '—'}
        </Link>
      ),
    },
    { key: 'due', header: 'Due', width: '120px', render: (row) => plainDate(row.dueDate, now) },
    {
      key: 'filed',
      header: 'Filed on',
      width: '140px',
      render: (row) => (
        <span className={row.filedOn ? 'text-ink' : 'text-ink-muted'}>
          {plainDate(row.filedOn, now)}
          {row.filedOn && row.filedOn.slice(0, 10) > row.dueDate.slice(0, 10) ? (
            <span className="ml-1.5 text-[12.5px] font-medium text-warning">Filed late</span>
          ) : null}
        </span>
      ),
    },
    { key: 'ref', header: 'Reference', render: refCell },
    { key: 'status', header: 'Status', width: '128px', render: (row) => <WordChip filing word={filingWord(row, now)} /> },
  ];
  const history = [...scoped].sort((a, b) => b.dueDate.localeCompare(a.dueDate) || a.companyName.localeCompare(b.companyName));
  const dueDays = daysUntil(group.dueDate, now);
  // The head ring: for one client, the four workflow steps of this period (the same steps the
  // client portal shows); across clients, how many have filed this period.
  const oneRow = group.rows.length === 1 ? group.rows[0]! : null;
  const steps = oneRow?.detail ? focusNodes(oneRow.detail, oneRow.row.companyName, todayIST(now)) : null;
  const ringDone = steps ? steps.filter((n) => n.st === 'done').length : group.filed;
  const ringTotal = steps ? steps.length : group.total;
  const ringLate = group.status === 'overdue' && dueDays !== null ? -dueDays : 0;
  const ringLabel = steps
    ? `${ringDone} of ${ringTotal} steps done`
    : `${group.filed} of ${group.total} clients filed`;
  // One client in view: the head names it, as the prototype's "GSTR-1 · Northwind".
  const oneClient = companyId !== ALL_COMPANIES ? clients.find((c) => c.id === companyId) : clients.length === 1 ? clients[0] : undefined;
  const kbHref = `${basePath.replace(/\/compliances$/, '')}/knowledge-bank?q=${encodeURIComponent(group.name)}`;

  return (
    <PageTransition>
      <SEO title={`${group.name} — VCFO Suite`} description={`${group.name}: each client's filing status.`} path={`${basePath}/obligations/${obligationId}`} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {/* R-02 plain head: the date tile, the 28px name, a muted meta line, the facts and the links. */}
        <header className="grid gap-3" aria-label="Obligation">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex min-w-0 flex-[1_1_320px] items-center gap-3.5">
              <HeadRing done={ringDone} total={ringTotal} lateDays={ringLate} label={ringLabel} />
              <div className="min-w-0">
                <h1 className="flex min-w-0 items-center gap-1.5 text-[28px] font-medium leading-9 tracking-[-0.01em] text-ink">
                  <span className="truncate">
                    {group.name}
                    {oneClient ? ` · ${oneClient.companyName}` : ''}
                  </span>
                  <WhatsThisButton compact kind="compliance" refId={group.obligationId} label={group.name} />
                </h1>
                <p className="flex flex-wrap items-center gap-2 text-[13.5px] text-ink-muted">
                  <AreaPill area={areaLabel(group.area)} />
                  <span>
                    {group.authority} · <span className="capitalize">{group.frequency}</span>
                  </span>
                </p>
              </div>
            </div>
            {clients.length > 1 ? (
              <CompanyPicker engagements={clients} value={companyId} allLabel="All my clients" allHint="Every client with this filing" onChange={setCompany} />
            ) : null}
            <Button size="sm" variant="secondary" asChild>
              <Link href={`${basePath}/calendar?date=${group.dueDate}${companyQuery}`}>
                <CalendarDays aria-hidden />
                Calendar
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href={`${basePath}/filings?area=${encodeURIComponent(group.area)}${companyQuery}`}>
                <FileSpreadsheet aria-hidden />
                Open filings
              </Link>
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <Fact k="Next due" className={group.status === 'overdue' ? 'text-danger' : undefined}>
              {plainDate(group.dueDate, now)}
              {dueDays !== null && group.status !== 'filed' ? (
                <span className="ml-1.5 text-[13px] font-normal text-ink-muted">
                  {dueDays < 0 ? `${-dueDays}d late` : dueDays === 0 ? 'today' : `in ${dueDays}d`}
                </span>
              ) : null}
            </Fact>
            <Fact k="This period">
              {group.filed} of {group.total} filed
            </Fact>
            <Fact k="Late" className={late ? 'text-danger' : undefined}>
              {late} client{late === 1 ? '' : 's'}
            </Fact>
            <Fact k={financialYearLabel(register.fyStartYear)}>
              {fyFiled} of {fyRows.length} filed
            </Fact>
            {risk ? <Fact k="Penalty risk">{RISK_WORD[risk] ?? risk}</Fact> : null}
          </div>
        </header>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid min-w-0 gap-4">
            <DashSection title="Clients" meta={`Due ${plainDate(group.dueDate, now)}`} bodyClassName="p-0">
              <EFilingGrid
                caption={`${group.name} · clients`}
                columns={periodCols}
                rows={group.rows.map((r) => r.row)}
                rowKey={(row) => row.id}
                pageSize={20}
                minWidth={showClient ? 1100 : 960}
                empty="No clients"
              />
            </DashSection>
            {oneRow ? (
              <>
                {/* S-774, S-773: one client's period — what the client gave, SBC's values and VCFO Assist (migration 0029). */}
                <StaffFromClientCard engagementId={oneRow.row.engagementId} kind="obligation" subjectKey={oneRow.row.id} clientName={oneRow.row.companyName} />
                <StaffSbcFieldsCard engagementId={oneRow.row.engagementId} kind="obligation" subjectKey={oneRow.row.id} locked={Boolean(oneRow.row.filedOn)} />
                <AssistCard
                  engagementId={oneRow.row.engagementId}
                  kind="filing"
                  subjectKey={oneRow.row.id}
                  portal={portalFor({ area: areaOf(group.authority, group.area), name: group.name })[0]}
                  form={group.name}
                  mayStart={!oneRow.row.filedOn}
                />
              </>
            ) : null}
            <FilingThreadCard
              instanceIds={group.rows.map((r) => r.row.id)}
              companyOf={showClient ? new Map(group.rows.map((r) => [r.row.id, r.row.companyName])) : undefined}
            />
            <DashSection title="Past periods" meta={`${history.length}`} bodyClassName="p-0">
              <EFilingGrid
                caption={`${group.name} · every period`}
                columns={historyCols}
                rows={history}
                rowKey={(row) => row.id}
                pageSize={12}
                minWidth={720}
                empty="No periods"
              />
            </DashSection>
          </div>
          <div className="grid min-w-0 gap-3">
            <FlowCard
              title="Progress"
              steps={[
                { label: 'Data from client', value: flow.data },
                { label: 'Prepared', value: flow.prepared },
                { label: 'Filed', value: flow.filed },
                { label: 'Acknowledged', value: flow.acknowledged },
              ]}
            />
            <RailCard
              title="Due in the next 15 days"
              items={soon.slice(0, 5).map((r) => ({ key: r.id, title: r.companyName, sub: r.periodLabel ?? group.name, right: plainDate(r.dueDate, now) }))}
            />
            <RailCard
              title="Waiting on client"
              items={waiting.slice(0, 5).map((r) => ({
                key: r.id,
                title: r.companyName,
                sub: r.periodLabel ?? group.name,
                right: plainDate(r.dueDate, now),
                rightClass: cn('font-medium', filingStatus(r, now) === 'overdue' ? 'text-danger' : 'text-waiting'),
              }))}
            />
            {oneRow ? (
              <BeforeFilingCard
                engagementId={oneRow.row.engagementId}
                kind="obligation"
                subjectKey={oneRow.row.id}
                lines={obligationChecklist(group.obligationId, group.area)}
              />
            ) : null}
            <ObligationAboutCards obligationId={group.obligationId} kbHref={kbHref} />
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
