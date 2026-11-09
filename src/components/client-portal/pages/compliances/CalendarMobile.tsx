'use client';

/**
 * Compliances · Calendar on phones (< 700 px) — prototype #cal-mobile:
 * week nav · 3 KPI cards · area pill · week strip · agenda (DECISIONS: week
 * strip + agenda; no grid / donut / year / timeline on phones). The prototype's
 * own phone top bar is the shared portal phone top bar.
 * C-1 to C-4: the All · Statutory · Non-statutory switch sits above the area pill; the shared
 * tasks join the week strip, the agenda, the numbers and the rail on their end date.
 */
import { useMemo, useRef, useState } from 'react';
import { usePortal } from '../../PortalProvider';
import {
  AREAS,
  MON,
  addDays,
  byDate,
  countByStatus,
  dow,
  filterArea,
  fyLabelOf,
  fyStartOfMonth,
  sortByDue,
  statusOf,
  tileSub,
  tileInk,
  tileVar,
  weekOf,
  worstStatus,
  type PortalFiling,
} from '@/lib/client-portal/compliances';
import { useCompFilings } from './api';
import { AreaChip, Chip, I, Seg, usePageTips } from './bits';
import { useComp } from './ctx';
import { DetailModal } from './Detail';
import { Empty, Island } from './spectrum';
import { Rail, type useCalendarState } from './CalendarPage';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { portalHref } from '../../routes';
import { CategoryTabs, RowArea } from './task-marks';
import { taskHref, useTaskRows } from './task-api';
import { fyOfIso, isTaskRow, showStat, showTasks, taskHint } from './tasks';

export function CalendarMobile({ state, onOpenFilings }: { state: ReturnType<typeof useCalendarState>; onOpenFilings: (f: PortalFiling) => void }) {
  const { after, toast, go } = usePortal();
  const { today, openDrill } = useComp();
  const { area, set, nowKey, cat } = state;
  const statOn = showStat(cat);
  const tasksOn = showTasks(cat) && area === 'all';
  const allTasks = useTaskRows(after);
  const root = useRef<HTMLDivElement>(null);
  usePageTips(root);
  const [week0, setWeek0] = useState(() => weekOf(state.month === nowKey ? today : `${state.month}-01`)[0]!);
  const week = weekOf(week0);
  const [selDay, setSelDay] = useState<string | null>(null);

  const fyA = fyStartOfMonth(week[0]!.slice(0, 7));
  const fyB = fyStartOfMonth(week[6]!.slice(0, 7));
  const todayFy = fyStartOfMonth(nowKey);
  const qA = useCompFilings(fyA, after);
  const qB = useCompFilings(fyB, after && fyB !== fyA);
  const qT = useCompFilings(todayFy, after);
  const rows = useMemo(() => {
    if (!after) return [];
    const m = new Map<string, PortalFiling>();
    if (statOn) for (const r of [...(qA.data?.rows ?? []), ...(fyB !== fyA ? qB.data?.rows ?? [] : []), ...(qT.data?.rows ?? [])]) m.set(r.id, r);
    if (tasksOn) for (const r of allTasks) m.set(r.id, r);
    return sortByDue([...m.values()]);
  }, [after, statOn, tasksOn, allTasks, qA.data, qB.data, qT.data, fyA, fyB]);
  const statFy = useMemo(() => (after ? qT.data?.rows ?? [] : []), [after, qT.data]);
  const taskFy = useMemo(() => allTasks.filter((r) => fyOfIso(r.dueDate) === todayFy), [allTasks, todayFy]);
  const fyRows = useMemo(() => [...(statOn ? statFy : []), ...(tasksOn ? taskFy : [])], [statOn, tasksOn, statFy, taskFy]);
  const openRow = (r: PortalFiling) => (isTaskRow(r) ? go(taskHref(r.task.id, r.task.boardMeetingId)) : set({ filing: r.id }));
  const loading = after && (qA.isLoading || qT.isLoading);

  const c = countByStatus(fyRows, today);
  const fyPct = fyRows.length ? Math.round((c.ok / fyRows.length) * 100) : 0;
  const fyTitle = `Compliances · ${fyLabelOf(todayFy)}`;
  const areaRows = [...filterArea(rows.filter((r) => !isTaskRow(r)), area), ...rows.filter(isTaskRow)].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const dates = byDate(areaRows);
  const areaIdx = Math.max(0, AREAS.findIndex((a) => a.id === area));
  const statCount = statOn ? statFy : [];
  const areaCounts = AREAS.map((a) => (a.id === 'all' ? statCount.length : statCount.filter((r) => r.area === a.id).length));

  // agenda (CP-07): this week from Monday (filed and overdue included), then what follows;
  // in the current week every overdue filing from earlier weeks leads the list
  const thisWeek = week[0]! <= today && today <= week[6]!;
  const carried = thisWeek ? areaRows.filter((r) => r.dueDate < week[0]! && statusOf(r, today) === 'over') : [];
  const agenda = selDay ? dates.get(selDay) ?? [] : [...carried, ...areaRows.filter((r) => r.dueDate >= week[0]!).slice(0, 6)];
  const detail = state.filing ? rows.find((r) => r.id === state.filing && !isTaskRow(r)) ?? null : null;
  const mid = week[3]!;
  const label = `${MON[Number(mid.slice(5, 7)) - 1]} ${mid.slice(0, 4)}`;

  return (
    <div className="cp-comp-root cm-root" ref={root}>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              type="button"
              className="ibtn"
              style={{ border: 0 }}
              aria-label="Previous week"
              onClick={() => {
                setWeek0(addDays(week0, -7));
                setSelDay(null);
              }}
            >
              {I.chevL(15)}
            </button>
            <b style={{ font: "600 13px var(--font-sans)" }}>{label}</b>
            <button
              type="button"
              className="ibtn"
              style={{ border: 0 }}
              aria-label="Next week"
              onClick={() => {
                setWeek0(addDays(week0, 7));
                setSelDay(null);
              }}
            >
              {I.chevR(15)}
            </button>
          </span>
        </div>
        {after ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
            {(
              [
                [String(c.due), 'Due in 7 days', '--due', 'due'],
                [String(c.over), 'Overdue', '--over', 'over'],
                [`${fyPct}%`, 'FY filed', '--ok', 'ok'],
              ] as const
            ).map(([v, l, col, k]) => (
              <button
                key={l}
                type="button"
                data-tip={`${l} · ${v}`}
                aria-label={`${l} · ${v} · show the list`}
                onClick={() => openDrill({ kind: 'status', k, title: fyTitle, rows: fyRows })}
                style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', background: 'var(--panel)', border: '1.5px solid var(--border)', borderRadius: 6, padding: 10, borderTop: `3px solid var(${col}-mid)` }}
              >
                <div className="metric" style={{ fontSize: 22 }}>
                  {loading ? '–' : v}
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>{l}</div>
              </button>
            ))}
          </div>
        ) : null}
        {after ? (
          <Island className="max-w-full overflow-x-auto">
            <CategoryTabs allFirst value={cat} onChange={(c) => set({ cat: c, area: 'all' })} stat={statFy.length} ns={taskFy.length} />
          </Island>
        ) : null}
        <div className="cm-seg" style={cat === 'non-statutory' ? { display: 'none' } : undefined}>
          <div style={{ width: 'max-content' }}>
            <Seg
              opts={AREAS.map((a) => a.label)}
              on={areaIdx}
              counts={areaCounts}
              label="Area"
              onPick={(i) => set({ area: AREAS[i]!.id })}
              same={(i) => toast(`Already showing ${AREAS[i]!.label === 'All' ? 'all areas' : AREAS[i]!.label}`)}
            />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 4 }} role="group" aria-label="Week">
          {week.map((iso, i) => {
            const it = dates.get(iso) ?? [];
            const s = it.length ? worstStatus(it, today) : '';
            const bg = s ? tileVar(s) : 'var(--panel)';
            const t = iso === today;
            return (
              <button
                key={iso}
                type="button"
                className={`cm-day${selDay === iso ? ' sel' : ''}`}
                aria-pressed={selDay === iso}
                aria-label={`${dow(iso)} ${Number(iso.slice(8))} ${MON[Number(iso.slice(5, 7)) - 1]}, ${it.length} filings${t ? ', today' : ''}`}
                data-tip={it.length ? `${dow(iso)} ${Number(iso.slice(8))} ${MON[Number(iso.slice(5, 7)) - 1]} · ${it.length} filing${it.length > 1 ? 's' : ''}` : undefined}
                onClick={() => setSelDay(selDay === iso ? null : iso)}
                style={{
                  height: 58,
                  borderRadius: 6,
                  background: bg,
                  color: s ? tileInk(s) : 'var(--fg)',
                  border: `1.5px solid ${s ? 'transparent' : 'var(--border)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  ...(t ? { boxShadow: '0 0 0 2px var(--primary)' } : {}),
                }}
              >
                <small style={{ font: '800 11px var(--font-sans),sans-serif', opacity: 0.8 }}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</small>
                <b style={{ font: "600 16px var(--font-sans)" }}>{Number(iso.slice(8))}</b>
                {t ? (
                  <span className="pulse" />
                ) : (
                  <small style={{ fontSize: 11, lineHeight: '7px', height: 7, letterSpacing: -1 }}>{it.length ? '●'.repeat(Math.min(it.length, 3)) : ''}</small>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!after ? (
            <Island>
              <Empty className="m-0 md:mx-0">Starts after incorporation</Empty>
            </Island>
          ) : loading ? (
            [1, 2, 3].map((i) => <div key={i} className="sk-row" style={{ height: 62, borderRadius: 10 }} />)
          ) : qT.isError ? (
            <div role="alert" style={{ color: 'var(--over-text)', fontWeight: 700 }}>
              Could not load the register.
            </div>
          ) : agenda.length ? (
            agenda.map((r) => {
              const s = statusOf(r, today);
              return (
                <button
                  key={r.id}
                  type="button"
                  className="cm-ag"
                  aria-label={`${r.name} · ${isTaskRow(r) ? taskHint(r.task) : r.period} · open the details`}
                  title={isTaskRow(r) ? taskHint(r.task) : undefined}
                  data-notip=""
                  onClick={() => openRow(r)}
                  style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 56, background: 'var(--panel)', border: '1.5px solid var(--border)', borderRadius: 6, padding: 8 }}
                >
                  <div className="dtile" style={{ background: tileVar(s), color: tileInk(s), width: 40, height: 44 }}>
                    <b style={{ fontSize: 16 }}>{Number(r.dueDate.slice(8))}</b>
                    <small>{tileSub(r.dueDate, (week[3] ?? today).slice(0, 7))}</small>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 3 }}>
                      {isTaskRow(r) ? <span className="cp-tw inline-flex"><RowArea r={r} compact /></span> : <AreaChip a={r.area} compact />}
                      <Chip s={s} />
                    </div>
                  </div>
                  {I.chevR(15)}
                </button>
              );
            })
          ) : (
            <Island>
              <Empty className="m-0 md:mx-0">{selDay ? 'Nothing due on this day' : 'Nothing due this week'}</Empty>
            </Island>
          )}
        </div>
      </div>
      {/* C-338: the rail cards stack under the agenda, as on the desktop page; C-337: the Filings link stays. */}
      {/* The rail and the Filings link keep the page's 16px side gutter, like the agenda above them. */}
      <div style={{ marginTop: 12, padding: '0 16px' }}>
        <Rail
          after={after}
          loading={loading}
          monthAll={fyRows.filter((r) => r.dueDate.startsWith(nowKey))}
          month={nowKey}
          railRows={fyRows}
          nowKey={nowKey}
          onOpen={openRow}
          openDrill={openDrill}
        />
      </div>
      <Island className="mt-3 block px-4 pb-4">
        <Button asChild variant="secondary" className="h-10 w-full font-semibold text-ink">
          <a
            href={`${portalHref('filings')}?fy=${todayFy}`}
            onClick={(e) => {
              e.preventDefault();
              go(`${portalHref('filings')}?fy=${todayFy}`);
            }}
          >
            <FileText size={16} strokeWidth={1.6} aria-hidden /> Filings
          </a>
        </Button>
      </Island>
      {detail ? <DetailModal f={detail} onClose={() => set({ filing: null })} onOpenFilings={onOpenFilings} /> : null}
    </div>
  );
}
