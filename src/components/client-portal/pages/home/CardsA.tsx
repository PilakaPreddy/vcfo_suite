'use client';

/**
 * Home cards (VCFO Spectrum, prototype src/screens/client/HomeScreen.tsx and home-parts.tsx):
 * the home card (R-17, R-18), Needs from <company>, Who holds it now, Important alerts
 * (R-20), What SBC is doing, Recent documents and Recent activity. Every number and row comes
 * from `useHome` (the step model, ClientOverview and `/api/client/home`).
 */
import { Check, ChevronRight, Download, FileText, Upload } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { FileBadge, type FileType } from '@/components/ui/file-badge';
import { DashHero, DashHeroCompanyTile, type DashHeroStat } from '@/components/dash/DashHero';
import { portalHref, stepHref } from '@/components/client-portal/routes';
import type { DrillConfig, DrillRow } from '@/components/client-portal/PortalProvider';
import type { UploadRow } from '@/lib/client-portal/multi-upload';
import { exactDate } from '@/lib/relative-due';
import { tileTrend, useHomeTrends } from '@/hooks/use-home-trends';
import { Bar, DateTile, Empty, HeadLink, ListRow, SCard, type BarTone } from '../incorporation/spectrum';
import type { HomeData } from './useHome';
import { DueWords } from './ui';
import {
  alertsDrill,
  chipBg,
  dShort,
  days,
  docGroup,
  complianceDrill,
  isOverdueNeed,
  needsDrill,
  postIncDrill,
  regsDrill,
  sortNeeds,
  spiceStepsDrill,
  type AlertRow,
  type DocItem,
  type NeedRow,
} from './derive';

function plural(n: number, w: string) {
  return `${n} ${w}${n === 1 ? '' : 's'}`;
}

/** "Today", "In 3 days", "Overdue 2 days" (the prototype's attention chips). */
function whenWord(today: string, iso: string): string {
  const n = days(today, iso);
  if (n < 0) return `Overdue ${plural(-n, 'day')}`;
  if (n === 0) return 'Today';
  return `In ${plural(n, 'day')}`;
}

/** "Due 9 Oct" in amber within a week, blurple later; "Overdue 3d" in red (C-058). */
function NeedDue({ iso, today }: { iso: string; today: string }) {
  const n = days(today, iso);
  if (n < 0) return <span className="text-danger" title={exactDate(iso)}>{`Overdue ${-n}d`}</span>;
  return <span className={n <= 7 ? 'text-warning' : 'text-brand-text'} title={exactDate(iso)}>{`Due ${dShort(iso)}`}</span>;
}

/** "84 KB", "1.2 MB". */
function sizeOf(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** The India calendar day of a timestamp, `YYYY-MM-DD`. */
function istDate(at: string): string {
  const t = Date.parse(at);
  return Number.isFinite(t) ? new Date(t + 5.5 * 3_600_000).toISOString().slice(0, 10) : at.slice(0, 10);
}

/** "14:05", India time. */
function istTime(at: string): string {
  const t = Date.parse(at);
  return Number.isFinite(t) ? new Date(t + 5.5 * 3_600_000).toISOString().slice(11, 16) : '';
}

/* ------------------------------------------------------------ home card */

/**
 * The Overdue tile's count: needs that are sent back or past due (`isOverdueNeed`), late steps
 * that are not done, and after the COI the overdue filings. A step counts once.
 */
function overdueCount(h: HomeData): number {
  const ids = new Set<string>();
  for (const n of h.needs) if (isOverdueNeed(n, h.today)) ids.add(n.stepId ?? n.key);
  for (const s of h.model.steps) if (s.late && s.kind !== 'done') ids.add(s.id);
  if (h.after) return ids.size + h.buckets.overdue;
  return ids.size;
}

/**
 * "Upload document" ("Upload" on a phone) opens the upload dialog (C-059) with the open
 * requests. With no open request there is nothing to answer, so it opens Documents.
 */
function UploadButton({ h, onUpload }: { h: HomeData; onUpload: (n?: NeedRow) => void }) {
  const has = h.needs.some((n) => (n.kind === 'upload' || n.kind === 'correct') && n.requestId);
  return (
    <Button onClick={() => (has ? onUpload() : h.portal.go('documents'))}>
      <Upload size={16} strokeWidth={1.6} aria-hidden />
      <span className="sm:hidden">Upload</span>
      <span className="max-sm:hidden">Upload document</span>
    </Button>
  );
}

/**
 * The report download (`/api/ask/brief`): "Preparing…", then the PDF is fetched and saved, and
 * a second toast names the file (C-016). A failed fetch says so.
 */
async function downloadReport(h: HomeData) {
  if (!h.engagementId) return;
  h.portal.toast(`Preparing ${h.company}’s progress report (PDF)`);
  try {
    const res = await fetch(`/api/ask/brief?engagementId=${encodeURIComponent(h.engagementId)}`);
    if (!res.ok) throw new Error(String(res.status));
    const cd = res.headers.get('content-disposition') ?? '';
    const name = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)?.[1];
    const file = name ? decodeURIComponent(name) : `${h.company} progress report.pdf`;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = file;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    h.portal.toast(`Report downloaded · ${file}`);
  } catch {
    h.portal.toast('The report did not download. Try again.');
  }
}

/**
 * R-17 (H3 tight, D-17): the shared `DashHero`. The company tile, the name, the stage chip and
 * the step count on the left; five tiles with a note, the list or drill they open (E-05) and
 * how they are counted (E-04); Report and Upload on the right. The five tiles are fixed (B1):
 * before the COI Waiting on, Overdue, With SBC, Documents in and Steps done; after it Waiting
 * on, Overdue, Due soon, Registrations and Incorporated. Every count tile draws a line of the
 * last 30 days, one point per day, rebuilt from the step events, requests, uploads and filings
 * (B2, `client-home-history.ts`); the line starts on the engagement's creation day when that is
 * later. A tile with no past values draws a flat line and "No history yet". The Incorporated
 * date tile draws none (a date has no count to follow).
 */
export function HomeCard({ h, onUpload }: { h: HomeData; onUpload: (n?: NeedRow) => void }) {
  const { portal, after, model, company } = h;
  const post = model.phases[2];
  const openSteps = (tab: number) => portal.drill(spiceStepsDrill(model, company, tab));
  const overdue = overdueCount(h);
  const sbcStep = model.steps.find((s) => s.kind === 'with' && s.owner !== 'client');
  const lateNeed = sortNeeds(h.needs, h.today).find((n) => isOverdueNeed(n, h.today));
  const lateStep = model.steps.find((s) => s.late && s.kind !== 'done');
  const regsDone = h.regs.filter((r) => r.status === 'Registered').length;
  const req = h.home?.requestCounts;
  const toCoi = model.coiExpected ? days(h.today, model.coiExpected) : null;
  const incorporatedOn = h.overview?.engagement.incorporationDate;
  const sinceCoi = incorporatedOn ? days(incorporatedOn.slice(0, 10), h.today) : null;
  const oldestNeed = h.needs.map((n) => n.createdAt?.slice(0, 10)).filter((d): d is string => Boolean(d)).sort()[0];
  const oldest = oldestNeed ? days(oldestNeed, h.today) : null;
  const dueNext = h.filings.filter((f) => !f.filedOn && f.status !== 'filed' && f.dueDate >= h.today).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const firstOverdueFiling = h.filings.filter((f) => !f.filedOn && f.status !== 'filed' && (f.status === 'overdue' || f.dueDate < h.today)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  const trends = useHomeTrends('client', { engagementId: h.engagementId, enabled: Boolean(h.engagementId) });
  // Tiles that open a drill use the tile's own click (DashHero `onClick`).
  const openLate = () => portal.drill({ ...alertsDrill(h.alerts.hero, h.alerts.rows, h.today, after), active: 1 });

  const waiting: DashHeroStat = {
    label: `Waiting on ${company}`,
    value: h.needs.length,
    note: oldest != null && oldest > 0 ? `oldest ${plural(oldest, 'day')}` : undefined,
    how: `Uploads, details, corrections and approvals that SBC asked ${company} for and that are still open.`,
    ...tileTrend(trends, 'waiting', h.needs.length),
    trendTone: 'teal',
    onClick: after ? () => portal.drill(needsDrill(h.needs, h.today, company)) : () => openSteps(3),
  };
  const overdueStat: DashHeroStat = {
    label: 'Overdue',
    value: overdue,
    hot: overdue > 0,
    note: lateNeed?.title ?? lateStep?.title ?? (after ? firstOverdueFiling?.title : undefined),
    how: after
      ? `Items from ${company} past their due date or sent back, late steps and filings past their due date.`
      : `Items from ${company} past their due date or sent back, and steps past their planned date.`,
    ...tileTrend(trends, 'overdue', overdue, after ? 'filingsOverdue' : undefined),
    trendTone: 'bad',
    onClick: openLate,
  };
  // B1 (owner, 2026-10-30): five fixed tiles in a fixed order. An empty value reads "0" or
  // "Not yet"; a tile never drops out because its data is missing.
  const regsTotal = h.regs.length;
  const reqTotal = req?.total ?? 0;
  const reqIn = req?.fulfilled ?? 0;
  const stats: DashHeroStat[] = after
    ? [
        waiting,
        overdueStat,
        {
          label: 'Due soon',
          value: h.buckets.dueSoon,
          note: dueNext ? dueNext.title : undefined,
          how: 'Filings not yet filed that fall due in the next 15 days.',
          ...tileTrend(trends, 'dueSoon', h.buckets.dueSoon),
          trendTone: 'accent',
          onClick: () => portal.drill(complianceDrill(h.filings, h.today, h.home?.filings.fyLabel ?? '', 2)),
        },
        {
          label: 'Registrations',
          value: regsDone,
          of: regsTotal ? `/ ${regsTotal}` : undefined,
          bar: regsTotal ? Math.round((regsDone / regsTotal) * 100) : undefined,
          how: 'Registrations granted out of the ones planned for the company.',
          ...tileTrend(trends, 'regs', regsDone),
          trendTone: 'ok',
          onClick: () => portal.drill(regsDrill(h.regs)),
        },
        {
          label: 'Incorporated',
          value: incorporatedOn ? dShort(incorporatedOn) : 'Not yet',
          note: sinceCoi != null && sinceCoi > 0 ? `day ${sinceCoi}` : undefined,
          how: 'The date on the Certificate of Incorporation.',
          href: portalHref('incorporation'),
        },
      ]
    : [
        waiting,
        overdueStat,
        {
          label: 'With SBC',
          value: model.counts.with,
          note: sbcStep?.title,
          ...tileTrend(trends, 'withSbc', model.counts.with),
          how: 'Steps that SBC or MCA holds now.',
          onClick: () => openSteps(2),
        },
        {
          label: 'Documents in',
          value: reqIn,
          of: reqTotal ? `/ ${reqTotal}` : undefined,
          note: reqTotal > reqIn ? `${reqTotal - reqIn} to go` : undefined,
          bar: reqTotal ? Math.round((reqIn / reqTotal) * 100) : undefined,
          ...tileTrend(trends, 'docsIn', reqIn),
          trendTone: 'ok' as const,
          how: 'Document requests answered out of all the requests SBC has sent.',
          href: portalHref('documents'),
        },
        {
          label: 'Steps done',
          value: model.spice.done,
          of: `/ ${model.spice.total}`,
          bar: model.spice.pct,
          note: toCoi != null && toCoi > 0 ? `COI in ${plural(toCoi, 'day')}` : undefined,
          ...tileTrend(trends, 'stepsDone', model.spice.done),
          trendTone: 'ok' as const,
          how: 'SPICe+ steps done out of all the SPICe+ steps, up to the Certificate of Incorporation.',
          onClick: () => openSteps(1),
        },
      ];

  const ring = after
    ? { done: post?.done ?? 0, total: post?.total ?? 0, label: 'Setup', open: () => portal.drill(postIncDrill(h.post.open, h.post.done, 2)) }
    : { done: model.spice.done, total: model.spice.total, label: 'SPICe+', open: () => openSteps(1) };
  const pct = ring.total ? Math.round((ring.done / ring.total) * 100) : 0;

  return (
    <DashHero
      title={h.companyName || company}
      settings={false}
      lead={<DashHeroCompanyTile name={h.companyName || company} />}
      stage={
        // C-012: a plain 20px label, no status dot.
        <span className={cn('inline-flex h-5 items-center whitespace-nowrap rounded-[4px] px-[7px] text-[11.5px] font-medium', after ? 'bg-positive-soft text-positive' : 'bg-brand-soft text-brand-text')}>
          {after ? 'Incorporated' : 'Incorporating'}
        </span>
      }
      steps={
        <button
          type="button"
          onClick={ring.open}
          title={`${ring.label} · ${pct}%`}
          className="whitespace-nowrap text-brand-text underline-offset-2 hover:underline"
        >
          {after ? `${ring.done} of ${ring.total} done` : `${ring.done} of ${ring.total} steps`}
        </button>
      }
      stats={stats}
    >
      {h.engagementId ? (
        // M-30: on a phone Report is a 36px icon button, so the chip, the step count and the
        // actions share one line.
        <Button variant="secondary" onClick={() => void downloadReport(h)} title="Report" className="max-sm:w-9 max-sm:px-0">
          <Download size={16} strokeWidth={1.6} aria-hidden />
          <span className="max-sm:sr-only">Report</span>
        </Button>
      ) : null}
      <UploadButton h={h} onUpload={onUpload} />
    </DashHero>
  );
}

/* ------------------------------------------------------------------ needs */

const NEED_ACTION: Record<NeedRow['kind'], string> = { upload: 'Upload', fill: 'Fill', correct: 'Fix', sign: 'Sign' };

/** Needs from <company>: file tile, title, the due word and where it belongs, one action. */
export function NeedsCard({ h, onUpload, className }: { h: HomeData; onUpload: (n: NeedRow) => void; className?: string }) {
  // C-02: a sent-back or late item leads the list (it is also the Overdue tile's note).
  const rows = sortNeeds(h.needs, h.today);
  // R-12: one main button per card, on the most urgent row.
  const main = rows.find((n) => isOverdueNeed(n, h.today))?.key;
  const act = (n: NeedRow) => {
    if ((n.kind === 'upload' || n.kind === 'correct') && n.requestId) onUpload(n);
    else if (n.href) h.portal.go(n.href);
  };
  return (
    <SCard title={`Needs from ${h.company}`} meta={rows.length} flush className={className}>
      {rows.length === 0 ? (
        <Empty />
      ) : (
        rows.map((n) => {
          const sub = `${n.sub}${n.askedBy ? ` · asked by ${n.askedBy}` : ''}`;
          return (
            <ListRow key={n.key}>
              <span className="grid h-8 w-8 flex-none place-items-center rounded-md bg-surface-sunken text-ink-muted" aria-hidden>
                <FileText size={16} strokeWidth={1.6} />
              </span>
              <span className="min-w-0 flex-1">
                <button type="button" onClick={() => n.href && h.portal.go(n.href)} className="block max-w-full truncate text-left font-medium text-ink hover:underline">
                  {n.title}
                </button>
                <span className="block truncate text-[12.5px] text-ink-muted">
                  {/* C-058: "Due 9 Oct" (amber within a week, blurple later), "Overdue 3d" in red. */}
                  {n.kind === 'correct' ? (
                    <>
                      <span className="text-danger" title={n.due ? `Due ${exactDate(n.due)}` : undefined}>
                        Sent back
                      </span>{' '}
                      ·{' '}
                    </>
                  ) : n.due ? (
                    <>
                      <NeedDue iso={n.due} today={h.today} /> ·{' '}
                    </>
                  ) : null}
                  {sub}
                </span>
              </span>
              <Button size="sm" variant={n.key === main ? 'default' : 'secondary'} className="w-[72px]" onClick={() => act(n)}>
                {NEED_ACTION[n.kind]}
              </Button>
            </ListRow>
          );
        })
      )}
    </SCard>
  );
}

/* ------------------------------------------------------- who holds it now */

/** Who holds it now: one bar per holder. A row opens the step list on that holder's tab. */
export function HoldsCard({ h, className }: { h: HomeData; className?: string }) {
  const { model, company, portal } = h;
  const spice = model.steps.filter((s) => s.phaseNo <= 2);
  const groups = [
    { key: 'client', label: company, rows: spice.filter((s) => s.kind === 'you' || s.kind === 'prog'), fill: 'bg-waiting-mid', tab: 3 },
    { key: 'sbc', label: 'SBC', rows: model.steps.filter((s) => s.kind === 'with' && s.owner === 'sbc' && s.phaseNo <= 2), fill: 'bg-brand', tab: 2 },
    { key: 'mca', label: 'MCA', rows: model.steps.filter((s) => s.kind === 'with' && s.owner === 'mca'), fill: 'bg-identity-mid', tab: 0 },
  ];
  const max = Math.max(1, ...groups.map((g) => g.rows.length));
  return (
    <SCard title="Who holds it now" className={className} bodyClassName="grid gap-4">
      {groups.map((g) => {
        const n = g.rows.length;
        const meta = n === 0 ? '' : n === 1 ? g.rows[0]!.title : `${n} items`;
        return (
          <button
            key={g.key}
            type="button"
            onClick={() => portal.drill(spiceStepsDrill(model, company, g.tab))}
            className="-mx-2 grid gap-2 rounded-md px-2 py-1 text-left hover:bg-surface-sunken"
            aria-label={`${g.label} · ${n} · open the step list`}
          >
            <span className="flex items-baseline gap-3">
              <span className="flex-none text-[14px] font-medium text-ink">{g.label}</span>
              <span className="ml-auto min-w-0 truncate text-[12.5px] text-ink-muted">{meta}</span>
              <b className="w-5 flex-none text-right text-[14px] font-medium text-ink">{n}</b>
            </span>
            <span className="block h-1.5 overflow-hidden rounded-bar bg-surface-sunken" aria-hidden>
              <i className={cn('block h-full rounded-bar', g.fill)} style={{ width: `${(n / max) * 100}%` }} />
            </span>
          </button>
        );
      })}
    </SCard>
  );
}

/* ----------------------------------------------------------------- alerts */

/** R-20: full-width rows, 44px date tile, chip on the right, the urgent row soft red with a navy action. */
function AttentionRows({ h, hero, rows, onRow }: { h: HomeData; hero?: AlertRow; rows: AlertRow[]; onRow?: (a: AlertRow) => void }) {
  if (!hero && rows.length === 0) return <Empty />;
  const chipOf = (a: AlertRow): { label: string; tone: ChipTone } => {
    const n = days(h.today, a.date);
    if (n < 0 || a.tone === 'over') return { label: 'Overdue', tone: 'bad' };
    // C-064: within 15 days amber, 16 to 30 days blurple, later plain.
    return { label: whenWord(h.today, a.date), tone: a.tone === 'due' || n <= 15 ? 'warn' : n <= 30 ? 'prog' : 'idle' };
  };
  return (
    <ul>
      {hero ? (
        <li>
          <div className="flex items-center gap-3 bg-danger-soft px-4 py-3 md:px-5">
            <DateTile iso={hero.date} tint="bad" />
            {/* The 360 px rail cannot hold the title, a status chip and the action on one line, so the
                urgent row keeps the title and the action; its soft red already says overdue. */}
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[13.5px] font-medium text-ink">{hero.title}</span>
              {hero.meta ? <span className="block truncate text-[12.5px] text-ink-muted">{hero.meta}</span> : null}
            </span>
            <Button variant="strong" size="sm" onClick={() => h.portal.go(hero.href)}>
              {hero.action ?? 'Open'}
            </Button>
          </div>
        </li>
      ) : null}
      {rows.map((a) => {
        const chip = chipOf(a);
        return (
          <li key={a.key}>
            <button
              type="button"
              onClick={() => (onRow ? onRow(a) : h.portal.go(a.href))}
              className="flex w-full items-center gap-3 border-t border-line-soft px-4 py-3 text-left hover:bg-surface-sunken md:px-5"
            >
              <span title={exactDate(a.date)} className="flex-none">
                <DateTile iso={a.date} tint={chip.tone === 'bad' ? 'bad' : chip.tone === 'warn' ? 'warn' : chip.tone === 'prog' ? 'prog' : 'idle'} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">{a.title}</span>
                {/* E-11: the sub line starts with the relative due words. */}
                <span className="block truncate text-[12.5px] text-ink-muted">
                  <DueWords iso={a.date} today={h.today} />
                  {a.meta ? ` · ${a.meta}` : null}
                </span>
              </span>
              <Chip tone={chip.tone} fixed>
                {chip.label}
              </Chip>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function AlertsCard({ h, className }: { h: HomeData; className?: string }) {
  const { rows } = h.alerts;
  // C-02: the sent-back or late item already leads Needs and the Overdue tile, so the card does
  // not repeat it. A hero that is not a Needs row (an overdue filing, a late step in progress) stays.
  const hero = h.alerts.hero?.needKey && h.needs.some((n) => n.key === h.alerts.hero!.needKey) ? undefined : h.alerts.hero;
  const [tab, setTab] = useState('15');
  const in15 = rows.filter((a) => days(h.today, a.date) <= 15);
  const in30 = rows.filter((a) => days(h.today, a.date) <= 30);
  const extra = hero ? 1 : 0;
  return (
    <SCard
      title="Important alerts"
      flush
      className={className}
      right={
        <SpectrumTabs
          label="Important alerts window"
          items={[
            { key: '15', label: '15 days', count: in15.length + extra },
            { key: '30', label: '30 days', count: in30.length + extra },
          ]}
          value={tab}
          onChange={setTab}
        />
      }
    >
      <AttentionRows h={h} hero={hero} rows={tab === '15' ? in15 : in30} />
    </SCard>
  );
}

/* ---------------------------------------------------------- SBC is doing */

export interface SbcRow {
  key: string;
  title: string;
  info: string;
  pct: number | null;
  ready?: string;
  href: string;
  linkLabel: string;
}

function buildSbcRows(h: HomeData): SbcRow[] {
  const work = h.home?.work ?? [];
  if (work.length) {
    return work.map((w) => {
      const step = w.stepId ? h.model.byId[w.stepId] : undefined;
      return {
        key: w.id,
        title: w.title,
        info: [w.assigneeName ?? h.lead, step ? `Step ${step.n}` : 'SBC', w.readyOn ? `ready ${dShort(w.readyOn)}` : ''].filter(Boolean).join(' · '),
        pct: w.progressPct,
        ready: w.readyOn,
        href: step ? stepHref(step.id) : portalHref('incorporation'),
        linkLabel: step ? `Open Step ${step.n}` : 'Open Incorporation',
      };
    });
  }
  // No work items recorded yet: the steps the firm holds now (no % — not stored).
  return h.model.steps
    .filter((s) => s.kind === 'with' && s.owner !== 'client')
    .slice(0, 6)
    .map((s) => ({
      key: s.id,
      title: s.title,
      info: [h.lead, s.phaseNo === 4 ? 'Registrations' : `Step ${s.n}`, s.due ? `ready ${dShort(s.due)}` : ''].filter(Boolean).join(' · '),
      pct: null,
      ready: s.due,
      href: stepHref(s.id),
      linkLabel: s.phaseNo === 4 ? 'Open Registrations' : `Open Step ${s.n}`,
    }));
}

function sbcDrill(rows: SbcRow[], active: number, lead?: string): DrillConfig {
  const r = (x: SbcRow): DrillRow => ({ title: x.title, meta: x.pct ? `${x.pct}%${lead ? ` · ${lead}` : ''}` : x.pct === 0 ? 'Not started yet' : x.ready ? `ready ${dShort(x.ready)}` : 'With SBC', chip: x.pct === 0 ? 'Not started' : 'In progress', chipColor: chipBg(x.pct === 0 ? 'up' : 'prog'), href: x.href });
  return {
    title: 'What SBC is doing',
    active,
    tabs: [
      { label: 'In progress', rows: rows.filter((x) => x.pct !== 0).map(r) },
      { label: 'Not started', rows: rows.filter((x) => x.pct === 0).map(r) },
    ],
    link: { lead: 'These items live in Incorporation', text: 'Open Incorporation →', href: portalHref('incorporation'), where: 'Incorporation' },
  };
}

/** Bars in category colours (K-23). */
const SBC_TONES: BarTone[] = ['prog', 'violet', 'teal', 'idle'];

export function SbcCard({ h, className }: { h: HomeData; className?: string }) {
  const rows = buildSbcRows(h);
  return (
    <SCard title="What SBC is doing" flush className={className}>
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <ul>
          {rows.map((r, i) => (
            <li key={r.key} className="border-t border-line-soft first:border-t-0">
              <button type="button" onClick={() => h.portal.go(r.href)} className="block w-full px-4 pb-1 pt-3 text-left hover:bg-surface-sunken md:px-5" aria-label={`${r.title} · ${r.linkLabel}`}>
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{r.title}</span>
                  {r.pct != null ? <span className="text-[12.5px] text-ink-muted">{r.pct}%</span> : null}
                  <ChevronRight size={16} strokeWidth={1.6} className="text-ink-faint" aria-hidden />
                </span>
                {r.info ? <span className="block truncate text-[12.5px] text-ink-muted">{r.info}</span> : null}
              </button>
              {r.pct != null ? (
                <button
                  type="button"
                  onClick={() => h.portal.drill(sbcDrill(rows, r.pct === 0 ? 1 : 0, h.lead))}
                  className="block w-full px-4 pb-3 pt-1.5 md:px-5"
                  aria-label={`${r.title} · ${r.pct}% · open the list`}
                >
                  <Bar pct={r.pct} tone={r.pct === 0 ? 'idle' : SBC_TONES[i % SBC_TONES.length]} />
                </button>
              ) : (
                <span className="block pb-2" />
              )}
            </li>
          ))}
        </ul>
      )}
    </SCard>
  );
}

/* --------------------------------------------------------- recent docs */

const FILE_TYPES = new Set(['PDF', 'DOCX', 'XLSX', 'JPG', 'PNG', 'ZIP', 'CSV', 'TXT']);

/**
 * B-20 (U1): each file of a new upload is a row at the top of Recent documents, with its own
 * progress bar while it sends, then an Uploaded tick, or the reason it was refused.
 */
function UploadRows({ rows, busy, onCancel }: { rows: UploadRow[]; busy?: boolean; onCancel?: () => void }) {
  return (
    <ul aria-label="Recent uploads" aria-live="polite" className="border-b border-line-soft">
      {rows.map((u, i) => (
        <li key={`${u.name}:${i}`} className="flex items-center gap-3 border-t border-line-soft px-4 py-2.5 first:border-t-0 md:px-5">
          <FileText size={16} strokeWidth={1.6} className="flex-none text-ink-muted" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <b className="min-w-0 truncate text-[13.5px] font-medium text-ink">{u.name}</b>
              <span className="flex-none text-[12px] text-ink-muted">{Math.max(1, Math.round(u.size / 1024))} KB</span>
            </span>
            {u.state === 'done' ? (
              <span className="mt-0.5 flex items-center gap-1 text-[12.5px] text-positive">
                <Check size={13} strokeWidth={2} aria-hidden /> Uploaded
              </span>
            ) : u.state === 'failed' ? (
              <span role="alert" className="mt-0.5 block truncate text-[12.5px] text-danger">
                {u.error ?? 'Not uploaded'}
              </span>
            ) : (
              <span
                className="mt-1.5 flex items-center gap-2"
                role="progressbar"
                aria-label={`Uploading ${u.name}`}
                aria-valuenow={u.pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span className="block h-1.5 flex-1 overflow-hidden rounded-bar bg-surface-sunken">
                  <i className="block h-full rounded-bar bg-brand transition-[width] duration-200" style={{ width: `${u.pct}%` }} />
                </span>
                <span className="w-9 flex-none text-right text-[12px] tabular-nums text-ink-muted">{u.pct}%</span>
              </span>
            )}
          </span>
          {busy && i === 0 && onCancel ? (
            <button type="button" onClick={onCancel} className="flex-none text-[12.5px] font-medium text-brand-text hover:underline">
              Cancel
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function DocsCard({
  h,
  onOpen,
  onDownload,
  uploads = [],
  uploading,
  onCancelUpload,
  className,
}: {
  h: HomeData;
  onOpen: (i: number) => void;
  onDownload: (d: DocItem) => void;
  /** B-20: the per-file rows of the upload in flight or just finished. */
  uploads?: UploadRow[];
  uploading?: boolean;
  onCancelUpload?: () => void;
  className?: string;
}) {
  const groups: { label: string; docs: { d: DocItem; i: number }[] }[] = [];
  h.docs.forEach((d, i) => {
    const g = docGroup(h.today, d.date);
    const last = groups[groups.length - 1];
    if (last && last.label === g) last.docs.push({ d, i });
    else groups.push({ label: g, docs: [{ d, i }] });
  });
  return (
    <SCard title="Recent documents" flush className={className} right={<HeadLink onClick={() => h.portal.go('documents')}>Documents ›</HeadLink>}>
      {uploads.length > 0 ? <UploadRows rows={uploads} busy={uploading} onCancel={onCancelUpload} /> : null}
      {h.docs.length === 0 && uploads.length > 0 ? null : h.docs.length === 0 ? (
        <Empty />
      ) : (
        groups.map((g) => (
          <div key={g.label}>
            <p className="border-t border-line-soft bg-surface-sunken px-4 py-1.5 text-[11.5px] font-medium text-ink-faint first:border-t-0 md:px-5">{g.label}</p>
            <ul>
              {g.docs.map(({ d, i }) => {
                const who = d.from === 'client' ? h.company : 'SBC';
                return (
                  <li key={d.id} className="flex items-center gap-3 border-t border-line-soft px-4 py-2.5 hover:bg-surface-sunken md:px-5">
                    <button type="button" onClick={() => onOpen(i)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Open ${d.name}`}>
                      <FileBadge type={FILE_TYPES.has(d.type) ? (d.type as FileType) : 'TXT'} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink">{d.name}</span>
                        <span className="block truncate text-[12.5px] text-ink-muted">
                          <span className={cn(d.from === 'client' && 'text-warning')}>{who}</span>
                          <span className="mx-1.5 text-ink-faint">·</span>
                          {dShort(d.date)}
                          {d.sizeBytes ? (
                            <>
                              <span className="mx-1.5 text-ink-faint">·</span>
                              {sizeOf(d.sizeBytes)}
                            </>
                          ) : null}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownload(d)}
                      className="grid h-[30px] w-[30px] flex-none place-items-center rounded-md text-ink-muted hover:bg-surface-raised hover:text-ink"
                      aria-label={`Download ${d.name}`}
                      title="Download"
                    >
                      <Download size={16} strokeWidth={1.6} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </SCard>
  );
}

/* ------------------------------------------------------------ activity */

/** C1: the Recent activity card shows this many rows, then a link to the Audit page. */
const ACTIVITY_ROWS = 5;

export function ActivityCard({ h, className }: { h: HomeData; className?: string }) {
  const [tab, setTab] = useState('all');
  const all = h.home?.activity ?? [];
  const firm = all.filter((a) => a.actorKind === 'firm');
  const client = all.filter((a) => a.actorKind === 'client');
  const rows = tab === 'all' ? all : tab === 'sbc' ? firm : client;
  return (
    <SCard
      title="Recent activity"
      flush
      className={className}
      right={
        <SpectrumTabs
          label="Who did it"
          items={[
            { key: 'all', label: 'All', count: all.length },
            { key: 'sbc', label: 'SBC', count: firm.length },
            { key: 'us', label: h.company, count: client.length },
          ]}
          value={tab}
          onChange={setTab}
        />
      }
    >
      {/* C1 (owner, 2026-10-30): the latest five rows in a fixed height, then "View all". */}
      <div className="flex h-[264px] flex-col">
        {rows.length === 0 ? (
          <Empty />
        ) : (
          <ul className="min-h-0 flex-1 overflow-hidden">
            {rows.slice(0, ACTIVITY_ROWS).map((a) => (
              <li key={a.id} className="grid h-11 grid-cols-[64px_minmax(0,1fr)] items-center gap-3 border-t border-line-soft px-4 text-[13.5px] first:border-t-0 md:grid-cols-[64px_minmax(0,1fr)_110px] md:px-5">
                <span className="text-[12.5px] leading-tight text-ink-muted">
                  {dShort(istDate(a.at))}
                  {/* C-071: the time shows from 768px. */}
                  <span className="block font-mono text-[11.5px] text-ink-faint max-md:hidden">{istTime(a.at)}</span>
                </span>
                <span className="min-w-0 truncate text-ink" title={a.label}>
                  {a.label}
                </span>
                <span className="truncate text-[12.5px] text-ink-muted max-md:hidden md:text-right">{a.actorKind === 'client' ? h.company : a.actorName}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex justify-end border-t border-line-soft px-4 py-2.5 md:px-5">
          <HeadLink onClick={() => h.portal.go(portalHref('audit'))} label="View all activity on the Audit page">
            View all <ChevronRight size={14} strokeWidth={1.6} aria-hidden />
          </HeadLink>
        </div>
      </div>
    </SCard>
  );
}
