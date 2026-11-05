'use client';

/**
 * Audit — prototype AuditScreen (2c978c5), on the real client-safe projection from
 * `/api/client/audit` (staff by name and role only, facts in plain words, 14-day
 * summary, keyset "Load older"); CSV from `/api/client/audit/export` with the current
 * filters. One grid card: search, Area and Who selects and Export in the head; When,
 * Event, Area, Who and Result columns; ten rows a page. A row opens the side panel with
 * the facts and the Before and After change; a date opens that day's events.
 */
import { sep } from '@/lib/date-format';
import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { AuditResult, ClientAuditEvent, ClientAuditPage } from '@/lib/client-portal/audit';
import type { ChipTone } from '@/components/ui/spectrum-chip';
import { usePortal } from '../../PortalProvider';
import {
  CardHead,
  CloseBtn,
  Dialog,
  Empty,
  HeadSelect,
  KeyValue,
  P,
  Pager,
  PanelSection,
  SArea,
  SChip,
  Seg,
  SidePanel,
  Svg,
  api,
  useIsPhone,
  useScrollAfterClose,
  useSkeleton,
} from './common';
import '../../css/team-00-contract.css';
import '../../css/team-audit.css';

// C-787: "Sign-in" lists the company's sign-ins (written by the Auth.js sign-in).
const CATS = ['Documents', 'Milestones', 'Team', 'Email', 'Credentials', 'Sign-in'] as const;
const RESULT_TONE: Record<AuditResult, ChipTone> = { Done: 'ok', 'Sent back': 'warn', Failed: 'bad', Denied: 'bad' };
const PAGE = 10;
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayParts(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  return {
    n: String(d.getUTCDate()),
    m: sep(d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })),
    long: `${LONG_DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${LONG_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
  };
}

/** Facts with a Before and After pair show the change as one row (prototype `Facts`). */
function Facts({ e }: { e: ClientAuditEvent }) {
  const before = e.facts.find((f) => f.k === 'Before');
  const after = e.facts.find((f) => f.k === 'After');
  const rest = e.facts.filter((f) => f !== before && f !== after);
  return (
    <>
      {before && after ? (
        <PanelSection title="Change">
          <div className="tb-chg">
            <div className="tb-chg-b">
              <div className="cap">Before</div>
              <div className="tb-chg-v">{before.v}</div>
            </div>
            <Svg d={P.arrowR} size={16} sw={1.6} style={{ color: 'oklch(var(--ink-faint))' }} />
            <div className="tb-chg-a">
              <div className="cap">After</div>
              <div className="tb-chg-v">{after.v}</div>
            </div>
          </div>
        </PanelSection>
      ) : null}
      {rest.length ? (
        <PanelSection title="Details">
          <KeyValue rows={rest.map((f) => ({ k: f.k, v: f.v }))} />
        </PanelSection>
      ) : null}
    </>
  );
}

export function AuditPage() {
  const { shell, go, toast } = usePortal();
  const companyShort = shell?.companyShort ?? 'you';
  const isPhone = useIsPhone();
  const scrollAfter = useScrollAfterClose();
  const q = useInfiniteQuery({
    queryKey: ['client-portal', 'audit'],
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      api<ClientAuditPage>(`/api/client/audit?limit=60${pageParam ? `&before=${encodeURIComponent(pageParam)}` : '&summary=1'}`),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const sk = useSkeleton(q.isLoading);
  const [cat, setCat] = useState('all');
  const [who, setWho] = useState('all');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pick, setPick] = useState<ClientAuditEvent | null>(null);
  const [dd, setDd] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setSearch(text.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => setPage(1), [cat, who, search]);

  const E = useMemo(() => q.data?.pages.flatMap((p) => p.events) ?? [], [q.data]);
  const summary = q.data?.pages[0]?.summary;

  const fw = (e: ClientAuditEvent) => who === 'all' || e.who.side === who;
  const fs = (e: ClientAuditEvent) => !search || `${e.action} ${e.subject} ${e.who.name}`.toLowerCase().includes(search);
  const fc = (e: ClientAuditEvent) => cat === 'all' || e.cat === cat;
  const rows = E.filter((e) => fc(e) && fw(e) && fs(e));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages);
  const slice = rows.slice((cur - 1) * PAGE, cur * PAGE);
  const exportHref = () => {
    const p = new URLSearchParams();
    if (cat !== 'all') p.set('cat', cat);
    if (who !== 'all') p.set('who', who);
    if (search) p.set('q', search);
    return `/api/client/audit/export${p.toString() ? `?${p}` : ''}`;
  };
  const filteredOn = cat !== 'all' || who !== 'all' || !!search;
  const clear = () => {
    setCat('all');
    setWho('all');
    setText('');
  };
  /** The day drill-down covers the 14 summary days that have events; an older When opens that event. */
  const hasDay = (day: string) => Boolean(summary?.days.some((b) => b.day === day && b.count > 0));

  return (
    <div className="cp-team">
      <main className="pg tb-wrap tp-audit">
        <section className="sx-card" aria-labelledby="au-t">
          <CardHead id="au-t" d={P.clock} tone="violet" title="Audit" meta={q.data ? `${rows.length} ${rows.length === 1 ? 'event' : 'events'}` : undefined}>
            <label className="tb-srch">
              <span className="tb-srch-i">
                <Svg d={P.search} join={false} size={14} sw={1.8} />
              </span>
              <input className="inp" aria-label="Search the audit log" placeholder="Search" value={text} onChange={(e) => setText(e.target.value)} />
            </label>
            <HeadSelect
              label="Area"
              value={cat}
              onChange={setCat}
              options={[{ value: 'all', label: 'All areas' }, ...CATS.map((c) => ({ value: c, label: `${c} · ${E.filter((e) => e.cat === c).length}` }))]}
            />
            <HeadSelect
              label="Who"
              value={who}
              onChange={setWho}
              options={[
                { value: 'all', label: 'Everyone' },
                { value: 'sbc', label: 'SBC' },
                { value: 'client', label: companyShort === 'you' ? 'Client' : companyShort },
              ]}
            />
            <a className="btn btn-o btn-sm" href={exportHref()} download onClick={() => toast('Download started · audit log (CSV)')}>
              <Svg d={P.download} sw={1.8} />
              Export
            </a>
          </CardHead>
          {q.isError ? (
            <Empty
              role="alert"
              action={
                <button type="button" className="btn btn-o btn-sm" onClick={() => void q.refetch()}>
                  Try again
                </button>
              }
            >
              Could not load the audit log
            </Empty>
          ) : !q.isLoading && rows.length === 0 ? (
            <div className="tb-faint" role="status">
              {E.length ? 'No events match these filters' : 'No events'}
              {E.length && filteredOn ? (
                <button type="button" className="btn btn-g btn-sm" style={{ marginLeft: 8 }} onClick={clear}>
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : (
            <div className="tb-tw">
              <table className="sx-t1 tb-events">
                <thead>
                  <tr>
                    <th scope="col" style={{ width: 120 }}>
                      When
                    </th>
                    <th scope="col">Event</th>
                    <th scope="col" style={{ width: 124 }}>
                      Area
                    </th>
                    <th scope="col" style={{ width: 150 }}>
                      Who
                    </th>
                    <th scope="col" style={{ width: 124 }}>
                      Result
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {q.isLoading
                    ? sk
                      ? [0, 1, 2, 3, 4].map((i) => (
                          <tr key={i} aria-hidden="true">
                            {[72, 180, 88, 96, 88].map((w, j) => (
                              <td key={j}>
                                <span className="sk" style={{ display: 'block', width: w, maxWidth: '100%', height: 12, borderRadius: 4 }} />
                              </td>
                            ))}
                          </tr>
                        ))
                      : null
                    : slice.map((e) => {
                        const p = dayParts(e.day);
                        const label = `${p.n} ${p.m} ${e.time}`;
                        return (
                          <tr
                            key={e.id}
                            className={pick?.id === e.id ? 'on' : undefined}
                            tabIndex={0}
                            aria-label={`${e.action} · ${e.subject}`}
                            onClick={() => setPick(e)}
                            onKeyDown={(ev) => {
                              if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) {
                                ev.preventDefault();
                                setPick(e);
                              }
                            }}
                          >
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <button
                                type="button"
                                className="tb-when"
                                aria-label={hasDay(e.day) ? `Show all events on ${p.n} ${p.m}` : `Open ${e.action}, ${p.n} ${p.m}`}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  if (hasDay(e.day)) setDd(e.day);
                                  else setPick(e);
                                }}
                              >
                                {label}
                              </button>
                            </td>
                            <td>
                              <span style={{ display: 'block', minWidth: 180 }}>
                                <span style={{ display: 'block', fontWeight: 500, color: 'oklch(var(--ink))' }}>{e.action}</span>
                                <span className="cap tb-sub">{e.subject}</span>
                              </span>
                            </td>
                            <td>
                              <SArea area={e.cat} />
                            </td>
                            <td>
                              <span style={{ display: 'block', minWidth: 0 }}>
                                <span style={{ display: 'block', fontWeight: 500, color: 'oklch(var(--ink))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {e.who.name}
                                </span>
                                <span className="cap" style={{ display: 'block' }}>
                                  {e.who.role}
                                </span>
                              </span>
                            </td>
                            <td>
                              <SChip tone={RESULT_TONE[e.result]}>{e.result}</SChip>
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          )}
          {!q.isError && (q.isLoading || rows.length > 0 || q.hasNextPage) ? (
            <Pager total={rows.length} page={cur} pageSize={PAGE} setPage={setPage}>
              {filteredOn ? (
                <button type="button" className="btn btn-g btn-sm" onClick={clear}>
                  Clear filters
                </button>
              ) : null}
              {q.hasNextPage ? (
                <button type="button" className="btn btn-o btn-sm" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                  {q.isFetchingNextPage ? 'Loading…' : 'Load older'}
                </button>
              ) : null}
            </Pager>
          ) : null}
        </section>
      </main>

      {pick ? (
        <SidePanel
          labelledBy="au-p"
          tp="tp-audit"
          onClose={() => setPick(null)}
          title={pick.action}
          eyebrow={
            <span>
              {dayParts(pick.day).long} · {pick.time}
            </span>
          }
          sub={
            <>
              <SArea area={pick.cat} />
              <SChip tone={RESULT_TONE[pick.result]}>{pick.result}</SChip>
            </>
          }
          footer={
            pick.cta ? (
              <a
                href={pick.cta.href}
                className="btn btn-n"
                onClick={(ev) => {
                  ev.preventDefault();
                  const href = pick.cta!.href;
                  setPick(null);
                  go(href);
                }}
              >
                {pick.cta.label}
              </a>
            ) : undefined
          }
        >
          <PanelSection>
            <KeyValue
              cols={1}
              rows={[
                { k: 'Target', v: pick.subject },
                { k: 'By', v: `${pick.who.name} · ${pick.who.role}` },
              ]}
            />
          </PanelSection>
          <Facts e={pick} />
        </SidePanel>
      ) : null}

      {dd !== null && summary ? (
        <DayDrill
          days={summary.days}
          day={dd}
          setDay={setDd}
          sheet={isPhone}
          onLink={() => {
            setDd(null);
            scrollAfter(280);
          }}
          onOpen={(e) => {
            setDd(null);
            setPick(e);
          }}
        />
      ) : null}
    </div>
  );
}

function DayDrill({
  days,
  day,
  setDay,
  sheet,
  onLink,
  onOpen,
}: {
  days: Array<{ day: string; count: number }>;
  day: string;
  setDay: (d: string | null) => void;
  sheet: boolean;
  onLink: () => void;
  onOpen: (e: ClientAuditEvent) => void;
}) {
  const q = useQuery({ queryKey: ['client-portal', 'audit-day', day], queryFn: () => api<{ events: ClientAuditEvent[] }>(`/api/client/audit?day=${day}`) });
  /* the seven most recent days with events, newest first (prototype `days.slice(0, 7)`) */
  const tabs = days.filter((b) => b.count > 0).reverse().slice(0, 7);
  const pos = Math.max(
    tabs.findIndex((b) => b.day === day),
    0,
  );
  const n = q.data?.events.length ?? days.find((b) => b.day === day)?.count ?? 0;
  return (
    <Dialog labelledBy="ab-t" width={760} sheet={sheet} onClose={() => setDay(null)} tp="tp-audit">
      <div className="dlg-h">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id="ab-t" style={{ margin: 0 }}>
            {dayParts(day).long}
          </h2>
          <div className="cap">
            {n} {n === 1 ? 'event' : 'events'}
          </div>
        </div>
        <CloseBtn onClick={() => setDay(null)} />
      </div>
      {tabs.length > 1 ? (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid oklch(var(--line-soft))' }}>
          <Seg
            tabs={tabs.map((b) => {
              const x = dayParts(b.day);
              return { label: `${x.n} ${x.m}`, cnt: b.count };
            })}
            active={pos}
            onPick={(k) => setDay(tabs[k].day)}
            label="Pick a day"
            grid={false}
          />
        </div>
      ) : null}
      <div style={{ maxHeight: 'min(420px,52dvh)', overflow: 'auto' }}>
        {q.isLoading ? (
          <div style={{ padding: '10px 16px' }} aria-hidden="true">
            <div className="sk" style={{ height: 44 }} />
          </div>
        ) : (
          (q.data?.events ?? []).map((e) => (
            <button key={e.id} type="button" className="row tb-drow" onClick={() => onOpen(e)}>
              <span className="cap" style={{ width: 48, flex: 'none' }}>
                {e.time}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="tb-sub" style={{ fontWeight: 500, color: 'oklch(var(--ink))' }}>
                  {e.action}
                </span>
                <span className="cap tb-sub">
                  {e.subject} · {e.who.name}
                </span>
              </span>
              <span className="tb-d">
                <SArea area={e.cat} />
              </span>
            </button>
          ))
        )}
      </div>
      <div className="dlg-f">
        <button type="button" className="btn btn-n" onClick={() => onLink()}>
          Show in the Audit log
        </button>
      </div>
    </Dialog>
  );
}
