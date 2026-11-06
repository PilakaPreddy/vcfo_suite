'use client';

/**
 * Notifications — prototype s/team/notif_redesign.dc.html (+ notif_drill, notif_empty).
 * Rows: `/api/client/notifications` (own history incl. cleared); read / unread /
 * read-all through the same route (Undo restores exactly the ids it changed).
 * Channel card: `/api/account/profile` (WhatsApp opt-in).
 * VCFO Spectrum: type tiles and status chips, "This month" as a total, one stacked
 * bar and rows that open the drill-down (R-25), a dashed empty state (R-48).
 */
import { sep } from '@/lib/date-format';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppNotification } from '@/lib/checklist/checklist-notifications';
import { usePortal, PORTAL_SHELL_KEY } from '../../PortalProvider';
import { portalHref } from '../../routes';
import type { ChipTone } from '@/components/ui/spectrum-chip';
import { stepNumbers } from '@/lib/client-portal/documents';
import {
  CardHead,
  CloseBtn,
  Dialog,
  Empty,
  KeyValue,
  P,
  PanelSection,
  SChip,
  STag,
  Seg,
  SidePanel,
  Svg,
  Tile,
  api,
  useIsPhone,
  useScrollAfterClose,
  useSkeleton,
  useTabFlash,
  type TileTone,
} from './common';
import '../../css/team-00-contract.css';
import '../../css/team-notif.css';

const NOTIF_KEY = ['client-portal', 'notifications'] as const;
export const PROFILE_KEY = ['client-portal', 'profile'] as const;

type Ty = 'doc' | 'back' | 'step' | 'time' | 'deadline' | 'mail' | 'ann' | 'team';
type Grp = 'Documents' | 'Steps' | 'Deadlines' | 'Messages';

/* VCFO Spectrum: each type shows the shared 28 px icon tile (R-16) and a status chip (R-13). */
const K: Record<'document' | 'step' | 'deadline' | 'email' | 'announcement' | 'team', { p1: string; tone: TileTone }> = {
  document: {
    p1: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M10 9H8 M16 13H8 M16 17H8',
    tone: 'brand',
  },
  step: { p1: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0 M16 9l-5.5 5.5L8 12', tone: 'green' },
  deadline: {
    p1: 'M16 14v2.2l1.6 1 M16 2v3 M21 7.338V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h2.338 M3 9h5.859 M8 2v3 M10 16a6 6 0 1 0 12 0a6 6 0 1 0 -12 0',
    tone: 'amber',
  },
  email: { p1: 'M22 7l-8.991 5.727a2 2 0 0 1-2.009 0L2 7 M4 4H20a2 2 0 0 1 2 2V18a2 2 0 0 1 -2 2H4a2 2 0 0 1 -2 -2V6a2 2 0 0 1 2 -2z', tone: 'violet' },
  announcement: {
    p1: 'M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14 M8 6v8',
    tone: 'amber',
  },
  team: {
    p1: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3.128a4 4 0 0 1 0 7.744 M22 21v-2a4 4 0 0 0-3-3.87 M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0',
    tone: 'brand',
  },
};
const T: Record<Ty, [keyof typeof K, Grp, string, ChipTone, string]> = {
  doc: ['document', 'Documents', 'Request', 'warn', 'Document request'],
  back: ['document', 'Documents', 'Sent back', 'bad', 'Document sent back · fix needed'],
  step: ['step', 'Steps', 'Step', 'ok', 'Step done'],
  time: ['step', 'Steps', 'Timeline', 'prog', 'Timeline changed'],
  deadline: ['deadline', 'Deadlines', 'Deadline', 'warn', 'Deadline coming up'],
  mail: ['email', 'Messages', 'Email', 'prog', 'Email sent'],
  ann: ['announcement', 'Messages', 'Announcement', 'warn', 'Announcement'],
  team: ['team', 'Messages', 'Team', 'prog', 'Team change'],
};

/** "This month" bar colours per group (the prototype's BAR_TONE). */
const BAR: Record<Grp, string> = {
  Documents: 'oklch(var(--warning-mid))',
  Steps: 'oklch(var(--brand))',
  Deadlines: 'oklch(var(--danger-mid))',
  Messages: 'oklch(var(--waiting-mid))',
};

/** Real notification kinds → the board's eight types. */
function typeOf(n: AppNotification): Ty {
  const k = String(n.kind);
  const t = `${n.title} ${n.body}`.toLowerCase();
  // An official update can mention a due date or a schedule, which says nothing about the client's own work.
  if (k === 'watch.update') return 'ann';
  if (k.startsWith('email.')) return 'mail';
  if (k.startsWith('team.')) return 'team';
  if (k === 'request.created' || k === 'docs.share') return 'doc';
  if (k === 'request.sent_back' || ((k === 'checklist.review' || k === 'request.uploaded') && /sent back|reject|changes|fix|re-?upload/.test(t))) return 'back';
  if (k === 'request.uploaded') return 'doc';
  if (k.startsWith('timeline.') || /timeline|end date|moved to|schedule/.test(t)) return 'time';
  if (k.startsWith('compliance.') || /\bdue (in|on|today|tomorrow)\b|deadline/.test(t)) return 'deadline';
  if (k.startsWith('announcement.')) return 'ann';
  return 'step';
}

function istDay(iso: string): string {
  return new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);
}
function groupOf(iso: string, today: string, monday: string): 0 | 1 | 2 {
  const d = istDay(iso);
  if (d === today) return 0;
  if (d >= monday) return 1;
  return 2;
}
function whenText(iso: string, g: number): string {
  const dt = new Date(iso);
  if (g === 0) return dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
  if (g === 1) return sep(dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })).replace(',', '');
  return sep(dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }));
}

/** Only portal pages are followed; anything else falls back to the type's own page. */
function targetOf(n: AppNotification, ty: Ty): string {
  if (n.href && n.href.startsWith('/app/client')) return n.href;
  if (ty === 'doc' || ty === 'back') return portalHref('documents');
  if (ty === 'deadline') return portalHref('filings');
  if (ty === 'mail') return portalHref('settings') + '#notifications';
  if (ty === 'ann') return portalHref('announcements');
  if (ty === 'team') return `${portalHref('settings')}#team`;
  return portalHref('incorporation');
}

/**
 * Who sent it (prototype "Arjun Mehta · 10:42"). The notifications table has no
 * actor column, so: an SBC team member named in the title/body, else the
 * system ("VCFO Suite") for automatic mails, deadlines and invite reminders,
 * else "SBC" for staff actions (requests, reviews, announcements).
 */
function whoOf(n: AppNotification, ty: Ty, staff: string[]): { who: string; person: boolean } {
  // C-759: the stored sender first; older rows fall back to a name found in the text.
  if (n.actorName?.trim()) return { who: n.actorName.trim(), person: true };
  const text = `${n.title} ${n.body}`;
  const hit = staff.find((name) => name && text.includes(name));
  if (hit) return { who: hit, person: true };
  if (ty === 'mail' || ty === 'deadline' || ty === 'team') return { who: 'VCFO Suite', person: false };
  return { who: 'SBC', person: false };
}

/** The body's deep link (prototype `.nb a`): where the row leads, in words. */
const LINK_LABEL: Record<Ty, string> = {
  doc: 'Open the document',
  back: 'Open the document',
  step: 'Open the step',
  time: 'See the timeline',
  deadline: 'Open the filing',
  mail: 'Email settings',
  ann: 'Read it',
  team: 'Open the team',
};

/** The step a notification links to (`/app/client/incorporation/step/<id>`), with its number. */
function linkedStep(href: string): { id: string; n: number; title: string } | null {
  const m = href.match(/\/app\/client\/incorporation\/step\/([^/?#]+)/);
  if (!m) return null;
  const id = decodeURIComponent(m[1]);
  const s = stepNumbers()[id];
  return s ? { id, n: s.n, title: s.title } : null;
}

export function NotificationsPage() {
  const { go, toast, shell } = usePortal();
  const qc = useQueryClient();
  const isPhone = useIsPhone();
  const scrollAfter = useScrollAfterClose();
  const q = useQuery({
    queryKey: NOTIF_KEY,
    queryFn: () => api<{ notifications: AppNotification[] }>('/api/client/notifications'),
    refetchInterval: 30_000,
  });
  const profile = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: () => api<{ profile: { whatsappOptIn: boolean; phoneE164: string | null } }>('/api/account/profile'),
  });
  const sk = useSkeleton(q.isLoading);
  const [tab, setTabRaw] = useState(0);
  const [flash, startFlash] = useTabFlash();
  const setTab = (i: number) => {
    if (i !== tab) startFlash();
    setTabRaw(i);
  };
  const [drill, setDrill] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const today = istDay(new Date().toISOString());
  const monday = useMemo(() => {
    const d = new Date(`${today}T00:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0 (DECISIONS: week starts Monday)
    d.setUTCDate(d.getUTCDate() - dow);
    return d.toISOString().slice(0, 10);
  }, [today]);

  const staffKey = (shell?.team ?? []).filter((c) => !c.support).map((c) => c.name).join('|');
  const staff = useMemo(() => (staffKey ? staffKey.split('|') : []), [staffKey]);
  const N = useMemo(
    () =>
      (q.data?.notifications ?? []).map((n) => {
        const ty = typeOf(n);
        const g = groupOf(n.createdAt, today, monday);
        const by = whoOf(n, ty, staff);
        return { n, ty, g, grp: T[ty][1], w: whenText(n.createdAt, g), href: targetOf(n, ty), who: by.who, person: by.person };
      }),
    [q.data, today, monday, staff],
  );
  type Item = (typeof N)[number];

  const setRead = (ids: string[], read: boolean) => {
    const set = new Set(ids);
    qc.setQueryData<{ notifications: AppNotification[] }>(NOTIF_KEY, (o) =>
      o ? { notifications: o.notifications.map((n) => (set.has(n.id) ? { ...n, read } : n)) } : o,
    );
  };
  const refreshBadges = () => void qc.invalidateQueries({ queryKey: PORTAL_SHELL_KEY });
  const markRead = (it: Item) => {
    if (it.n.read) return;
    setRead([it.n.id], true);
    void api('/api/client/notifications', { method: 'POST', json: { action: 'read', ids: [it.n.id] } }).then(refreshBadges, () => setRead([it.n.id], false));
  };
  /** The arrow and the title open the detail side panel; its main button goes to the page. */
  const open = (it: Item) => {
    markRead(it);
    setDetailId(it.n.id);
  };
  const unreadIds = N.filter((x) => !x.n.read).map((x) => x.n.id);
  const markAll = async () => {
    if (!unreadIds.length) return;
    const before = unreadIds;
    setRead(before, true);
    try {
      const r = await api<{ ids: string[] }>('/api/client/notifications', { method: 'POST', json: { action: 'read_all' } });
      refreshBadges();
      const changed = r.ids.length ? r.ids : before;
      toast('All marked read', {
        undo: () => {
          setRead(changed, false);
          void api('/api/client/notifications', { method: 'POST', json: { action: 'unread', ids: changed } }).then(refreshBadges);
        },
      });
    } catch {
      setRead(before, false);
      toast('Could not mark all read');
    }
  };

  const TABS: Array<[string, (x: Item) => boolean]> = [
    ['All', () => true],
    ['Unread', (x) => !x.n.read],
    ['Documents', (x) => x.grp === 'Documents'],
    ['Steps', (x) => x.grp === 'Steps'],
    ['Deadlines', (x) => x.grp === 'Deadlines'],
    ['Messages', (x) => x.grp === 'Messages'],
  ];
  const shown = N.filter(TABS[tab][1]);
  const GL = ['Today', 'Earlier this week', 'Earlier'];
  const groups = GL.map((label, gi) => ({ label, items: shown.filter((x) => x.g === gi) })).filter((g) => g.items.length);

  // "This month": total, one stacked bar and a row per group (IST month)
  const month = today.slice(0, 7);
  const M = N.filter((x) => istDay(x.n.createdAt).startsWith(month));
  const DT: Array<'All' | Grp> = ['All', 'Documents', 'Steps', 'Deadlines', 'Messages'];
  const cnt = (k: Grp) => M.filter((x) => x.grp === k).length;
  const tot = M.length;
  const waOn = profile.data?.profile.whatsappOptIn ?? false;
  const company = shell?.companyShort ?? 'You';
  const teamHref = `${portalHref('settings')}#team`;
  const detail = detailId ? (N.find((x) => x.n.id === detailId) ?? null) : null;
  const detailStep = detail ? linkedStep(detail.href) : null;

  const whoEl = (x: Item) =>
    x.person ? (
      <a
        href={teamHref}
        className="nwho"
        onClick={(e) => {
          e.preventDefault();
          go(teamHref);
        }}
      >
        {x.who}
      </a>
    ) : (
      x.who
    );

  const icon = (ty: Ty, big = false) => {
    const k = K[T[ty][0]];
    return (
      <span className="nic" role="img" aria-label={T[ty][4]} data-tip={T[ty][4]}>
        <Tile d={k.p1} tone={k.tone} big={big} />
      </span>
    );
  };

  return (
    <div className="cp-team">
      <main className="pg tb-wrap tp-notif">
        <div className="tb-g12">
          <section className="sx-card tb-s9" aria-label="Notifications">
            {/* R-09: no card title that repeats the sidebar; the filter heads the card */}
            <div className="sx-head tb-hd">
              <Seg
                tabs={TABS.map(([l, f]) => ({ label: l, cnt: N.filter(f).length }))}
                active={tab}
                onPick={setTab}
                label="Filter notifications"
                grid={false}
                md
              />
              {unreadIds.length > 0 ? (
                <button type="button" className="btn btn-g btn-sm tb-mark" onClick={() => void markAll()}>
                  Mark all read
                </button>
              ) : null}
            </div>
            {q.isLoading || flash ? (
              sk || flash ? (
                [0, 1, 2, 3].map((i) => (
                  <div key={i} className="row" aria-hidden="true">
                    <span className="sk" style={{ width: 28, height: 28, borderRadius: 6 }} />
                    <div style={{ flex: 1 }}>
                      <div className="sk" style={{ width: '45%', height: 12 }} />
                      <div className="sk" style={{ width: '70%', height: 10, marginTop: 6 }} />
                    </div>
                  </div>
                ))
              ) : null
            ) : groups.length === 0 ? (
              <Empty
                action={
                  <button type="button" className="btn btn-o btn-sm" onClick={() => setTab(0)}>
                    See all
                  </button>
                }
              >
                {tab === 1 || tab === 0 ? 'Nothing unread' : `No ${TABS[tab][0].toLowerCase()} yet`}
              </Empty>
            ) : (
              groups.map((g, gi) => (
                <div key={g.label}>
                  <div className="lbl tb-glbl">
                    {g.label}
                    {gi === 0 && unreadIds.length > 0 ? (
                      /* phone: "Mark all read" rides on the first group label, the header keeps only the switch */
                      <button type="button" className="tb-m tb-markm" onClick={() => void markAll()}>
                        Mark all read
                      </button>
                    ) : null}
                  </div>
                  {g.items.map((x) => {
                    const u = !x.n.read;
                    const [, , kind, tone] = T[x.ty];
                    const on = detailId === x.n.id;
                    return (
                      <div key={x.n.id} className={`row tb-nrow${u ? ' unread' : ''}${on ? ' on' : ''}`}>
                        {icon(x.ty, true)}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span className="tb-tl">
                            <a
                              href={x.href}
                              className="rt nt"
                              style={{ fontWeight: u ? 500 : 400, color: u ? 'oklch(var(--ink))' : 'oklch(var(--ink-2))' }}
                              onClick={(e) => {
                                e.preventDefault();
                                open(x);
                              }}
                            >
                              {x.n.title}
                            </a>
                          </span>
                          <span className="nb">
                            {x.n.body ? <>{x.n.body} · </> : null}
                            <a
                              href={x.href}
                              onClick={(e) => {
                                e.preventDefault();
                                open(x);
                              }}
                            >
                              {LINK_LABEL[x.ty]}
                            </a>
                          </span>
                          <span className="cap tb-m tb-flex" style={{ marginTop: 2, gap: 4 }}>
                            {whoEl(x)} · {x.w}
                          </span>
                        </div>
                        <span className="nkind">
                          <SChip tone={tone}>{kind}</SChip>
                        </span>
                        <span className="cap tb-d" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {whoEl(x)} · {x.w}
                        </span>
                        {u ? (
                          <button type="button" className="tb-ud" aria-label="Unread · mark as read" data-tip="Mark as read" onClick={() => markRead(x)}>
                            <span className="udot" />
                          </button>
                        ) : (
                          <span style={{ width: 20, flex: 'none' }} />
                        )}
                        <a
                          href={x.href}
                          className="ibtn"
                          aria-label={`Open ${x.n.title}`}
                          onClick={(e) => {
                            e.preventDefault();
                            open(x);
                          }}
                        >
                          <Svg d={P.go} sw={1.8} />
                        </a>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </section>

          <div className="tb-s3">
            <section className="sx-card" aria-labelledby="nt-month">
              <CardHead id="nt-month" d={P.grid} title="This month" />
              <button type="button" className="tb-total" onClick={() => setDrill(0)} aria-label={`Show all ${tot} notifications`}>
                <span className="metric">{tot}</span>
                <span className="cap">this month</span>
              </button>
              <div className={tot > 0 ? 'tb-stack' : 'tb-stack empty'} aria-hidden="true">
                {tot > 0
                  ? (DT.slice(1) as Grp[]).map((g) => (cnt(g) ? <span key={g} style={{ width: `${(cnt(g) / tot) * 100}%`, background: BAR[g] }} /> : null))
                  : null}
              </div>
              <div style={{ paddingBottom: 4 }}>
                {[1, 2, 3, 4].map((i) => (
                  <button key={i} type="button" className="sx-row tb-leg" onClick={() => setDrill(i)}>
                    <span style={{ flex: 1 }}>{DT[i]}</span>
                    <span style={{ fontWeight: 500 }}>{cnt(DT[i] as Grp)}</span>
                    <Svg d={P.next} size={14} sw={1.8} style={{ color: 'oklch(var(--ink-faint))' }} />
                  </button>
                ))}
              </div>
            </section>
            <section className="sx-card" aria-labelledby="nt-by">
              <CardHead id="nt-by" d={P.grid} title={`${company} gets these by`} />
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <STag tone="prog">✓ Email</STag>
                  {waOn ? <STag tone="ok">✓ WhatsApp</STag> : null}
                </div>
                <a
                  href={`${portalHref('settings')}#notifications`}
                  className="tb-setlink"
                  onClick={(e) => {
                    e.preventDefault();
                    go(`${portalHref('settings')}#notifications`);
                  }}
                >
                  Change in Settings ›
                </a>
              </div>
            </section>
          </div>
        </div>
      </main>

      {drill !== null ? (
        <NotifDrill
          drill={drill}
          setDrill={setDrill}
          items={M}
          icon={icon}
          sheet={isPhone}
          onOpen={(x) => {
            setDrill(null);
            open(x);
          }}
          isPhone={isPhone}
          onLink={(where) => {
            setDrill(null);
            if (where) go(where);
            else scrollAfter(200);
          }}
        />
      ) : null}

      {detail ? (
        <SidePanel
          labelledBy="nt-p"
          tp="tp-notif"
          onClose={() => setDetailId(null)}
          title={detail.n.title}
          eyebrow={
            <>
              <Svg d={P.bell} size={14} sw={1.6} />
              {T[detail.ty][4]}
            </>
          }
          sub={<STag tone={T[detail.ty][3]}>{T[detail.ty][2]}</STag>}
          footer={
            <a
              href={detail.href}
              className="btn btn-n"
              onClick={(e) => {
                e.preventDefault();
                setDetailId(null);
                go(detail.href);
              }}
            >
              {LINK_LABEL[detail.ty]}
            </a>
          }
        >
          <PanelSection>
            <KeyValue
              rows={[
                { k: 'From', v: detail.who },
                { k: 'When', v: detail.w },
                { k: 'Area', v: detail.grp },
              ]}
            />
            {detail.n.body ? <p className="tb-sp-p">{detail.n.body}</p> : null}
          </PanelSection>
          {detailStep ? (
            <PanelSection title="Linked step">
              <a
                href={detail.href}
                className="tb-lstep"
                onClick={(e) => {
                  e.preventDefault();
                  setDetailId(null);
                  go(detail.href);
                }}
              >
                <span className="tb-lstep-n">{detailStep.n}</span>
                <span className="tb-lstep-t">{detailStep.title}</span>
              </a>
            </PanelSection>
          ) : null}
        </SidePanel>
      ) : null}
    </div>
  );
}

function NotifDrill<I extends { n: AppNotification; ty: Ty; grp: Grp; w: string; href: string; who: string }>({
  drill,
  setDrill,
  items,
  icon,
  sheet,
  onOpen,
  onLink,
  isPhone,
}: {
  isPhone: boolean;
  drill: number;
  setDrill: (d: number | null) => void;
  items: I[];
  icon: (t: Ty, big?: boolean) => React.ReactNode;
  sheet: boolean;
  onOpen: (x: I) => void;
  onLink: (where: string) => void;
}) {
  const DT: Array<'All' | Grp> = ['All', 'Documents', 'Steps', 'Deadlines', 'Messages'];
  /* where each group lives: the footer button opens it (the list itself for "All") */
  const LINK: Array<[string, string]> = [
    ['Show in the list', ''],
    ['Open Documents', portalHref('documents')],
    ['Open Incorporation', portalHref('incorporation')],
    ['Open Filings', portalHref('filings')],
    ['Open Announcements', portalHref('announcements')],
  ];
  const L = LINK[drill];
  const list = items.filter((x) => drill === 0 || x.grp === DT[drill]);
  const tabs = (
    <Seg
      tabs={DT.map((l, i) => ({ label: l, cnt: i === 0 ? items.length : items.filter((x) => x.grp === l).length }))}
      active={drill}
      onPick={(i) => setDrill(i)}
      label="Filter by type"
      grid={false}
    />
  );
  return (
    <Dialog labelledBy="nd-t" width={760} sheet={sheet} onClose={() => setDrill(null)} tp="tp-notif" dlgStyle={{ display: 'flex', flexDirection: 'column' }}>
      <div className="dlg-h">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id="nd-t" style={{ margin: 0 }}>
            This month
          </h2>
          <div className="cap">
            {list.length} {list.length === 1 ? 'notification' : 'notifications'}
          </div>
        </div>
        {!isPhone ? tabs : null}
        <CloseBtn onClick={() => setDrill(null)} />
      </div>
      {isPhone ? <div style={{ padding: '8px 16px', borderBottom: '1px solid oklch(var(--line-soft))' }}>{tabs}</div> : null}
      <div style={{ padding: '4px 0 8px', maxHeight: 'min(420px,52dvh)', overflow: 'auto' }}>
        {list.length === 0 ? (
          <Empty>None this month</Empty>
        ) : (
          list.map((x) => (
            <a
              key={x.n.id}
              href={x.href}
              className="row"
              style={{ color: 'inherit', fontWeight: 'inherit', padding: '8px 16px' }}
              onClick={(e) => {
                e.preventDefault();
                onOpen(x);
              }}
            >
              {icon(x.ty)}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="rt" style={{ display: 'block', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {x.n.title}
                </span>
                <span className="cap">
                  {x.who} · {x.w}
                </span>
              </span>
              <span className="tb-d">
                <SChip tone={T[x.ty][3]}>{T[x.ty][2]}</SChip>
              </span>
            </a>
          ))
        )}
      </div>
      <div className="dlg-f">
        <button
          type="button"
          className="btn btn-n"
          onClick={() => {
            onLink(L[1]);
          }}
        >
          {L[0]}
        </button>
      </div>
    </Dialog>
  );
}
