'use client';

/**
 * Announcements — prototype s/team/ann_redesign.dc.html (+ ann_detail, ann_empty).
 * List: `/api/announcements` (live head poll, `useAnnouncements`); read state:
 * NEW `announcement_reads` via `/api/client/announcements/reads`; portals:
 * `VCFO_PORTAL_TASKS`. VCFO Spectrum: white card heads, kinds are status chips or
 * area pills (R-13, R-43), no bot in the empty state (R-04).
 */
import { sep } from '@/lib/date-format';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAnnouncements } from '@/hooks/use-announcements';
import { ANNOUNCEMENT_KIND_LABEL, type Announcement } from '@/lib/notifications/announcements';
import { VCFO_PORTAL_TASKS, type VcfoPortalTask } from '@/lib/notifications/announcement-portals';
import type { Regulator } from '@/lib/ui/regulator';
import { usePortal } from '../../PortalProvider';
import { LinkButton } from '../../LinkButton';
import {
  CardHead,
  CloseBtn,
  Dialog,
  Empty,
  P,
  SArea,
  SChip,
  STag,
  Seg,
  Svg,
  api,
  avatarTint,
  contactHref,
  dayMonth,
  initialsOf,
  useIsPhone,
  useSkeleton,
  useTabFlash,
} from './common';
import '../../css/team-00-contract.css';
import '../../css/team-ann.css';

const READS_KEY = ['client-portal', 'announcement-reads'] as const;
const UNREAD_KEY = ['client-portal', 'announcements-unread'] as const;

/** R-43: kinds that name a regulator show its swatch. */
const KIND_REG: Partial<Record<Announcement['kind'], Regulator>> = { 'post-incorp': 'mca', incorp: 'mca', mca: 'mca', gst: 'gst', tax: 'it' };

/** R-13 / R-43: one 104 px mark per row, so the titles line up. A deadline is a status chip; other kinds are area pills. */
function KindMark({ a }: { a: Announcement }) {
  if (a.kind === 'deadline') return <SChip tone="warn">{ANNOUNCEMENT_KIND_LABEL[a.kind]}</SChip>;
  return <SArea area={ANNOUNCEMENT_KIND_LABEL[a.kind]} reg={KIND_REG[a.kind]} />;
}
/** "Thu 8 Oct 2026" for the date tile tooltip. */
function longDate(iso: string): string {
  return sep(new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })).replace(/,/g, '');
}
const imp = (a: Announcement) => a.kind === 'deadline' || a.kind === 'compliance';
const host = (a: Announcement): string => {
  if (a.sourceUrl) {
    try {
      return new URL(a.sourceUrl).hostname.replace(/^www\./, '');
    } catch {
      /* fall through */
    }
  }
  return a.sourceName ?? '';
};

const SETUP_HEADS = ['Incorporation', 'Registrations', 'FEMA', 'Customs', 'Foreign Trade', 'Labour', 'Local Compliance', 'IP/Brand'];
const RECUR: Record<string, string> = {
  'Monthly Compliances': 'Monthly',
  'Quarterly Compliances': 'Quarterly',
  'Half-yearly Compliances': 'Half-yearly',
  'Yearly Compliances': 'Yearly',
};

export function AnnouncementsPage() {
  const { shell, go, openChat } = usePortal();
  const qc = useQueryClient();
  const list = useAnnouncements();
  const reads = useQuery({
    queryKey: READS_KEY,
    queryFn: () => api<{ readIds: string[] }>('/api/client/announcements/reads'),
  });
  const sk = useSkeleton(list.isLoading);
  const isPhone = useIsPhone();
  const [tab, setTabRaw] = useState(0);
  const [flash, startFlash] = useTabFlash();
  const setTab = (i: number) => {
    if (i !== tab) startFlash();
    setTabRaw(i);
  };
  const [pt, setPt] = useState(0);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const all = useMemo(() => list.data?.announcements ?? [], [list.data]);
  const readSet = useMemo(() => new Set(reads.data?.readIds ?? []), [reads.data]);
  const isUnread = (a: Announcement) => reads.isSuccess && !readSet.has(a.id);
  const F = [() => true, imp, (a: Announcement) => !imp(a)];
  const rows = all.filter(F[tab]);

  const markRead = (ids: string[]) => {
    const fresh = ids.filter((id) => !readSet.has(id));
    if (!fresh.length) return;
    qc.setQueryData<{ readIds: string[] }>(READS_KEY, (o) => ({ readIds: [...(o?.readIds ?? []), ...fresh] }));
    void api('/api/client/announcements/reads', { method: 'POST', json: { action: 'read', ids: fresh } })
      .then(() => qc.invalidateQueries({ queryKey: UNREAD_KEY }))
      .catch(() => qc.invalidateQueries({ queryKey: READS_KEY }));
  };

  // portals (real task list; a row needs at least one official link)
  const tasks = VCFO_PORTAL_TASKS.filter((t) => t.portalUrl || t.circularUrl);
  const setup = tasks.filter((t) => SETUP_HEADS.includes(t.head));
  const recurring = tasks.filter((t) => RECUR[t.head]);
  const plist = pt === 0 ? setup : recurring;
  const groups = plist.reduce<Array<{ h: string; rows: VcfoPortalTask[] }>>((acc, t) => {
    const h = RECUR[t.head] ?? t.head;
    const g = acc.find((x) => x.h === h);
    if (g) g.rows.push(t);
    else acc.push({ h, rows: [t] });
    return acc;
  }, []);

  const openAt = (i: number) => {
    setOpenIdx(i);
    const a = rows[i];
    if (a) markRead([a.id]);
  };

  return (
    <div className="cp-team">
      <main className="pg tb-wrap tp-ann">
        <div className="tb-g12">
          <section className="sx-card tb-s8" aria-labelledby="ann-latest">
            <CardHead id="ann-latest" d={P.grid} title="Latest">
              <Seg
                tabs={['All', 'Important', 'General'].map((l, i) => ({ label: l, cnt: all.filter(F[i]).length }))}
                active={tab}
                onPick={setTab}
                label="Filter announcements"
                grid={false}
              />
            </CardHead>
            {list.isLoading || flash ? (
              sk || flash ? (
                [0, 1, 2, 3].map((i) => (
                  <div key={i} className="row" aria-hidden="true">
                    <span className="sk" style={{ width: 44, height: 44, borderRadius: 6 }} />
                    <div style={{ flex: 1 }}>
                      <div className="sk" style={{ width: '30%', height: 12 }} />
                      <div className="sk" style={{ width: '70%', height: 14, marginTop: 8 }} />
                    </div>
                  </div>
                ))
              ) : null
            ) : rows.length === 0 ? (
              <Empty
                action={
                  <button type="button" className="btn btn-o btn-sm" onClick={() => setTab(0)}>
                    See all
                  </button>
                }
              >
                None
              </Empty>
            ) : (
              rows.map((a, i) => {
                const unread = isUnread(a);
                const dm = dayMonth(a.publishedAt);
                const feed = a.origin === 'feed';
                const h = host(a);
                return (
                  <LinkButton
                    key={a.id}
                    className={unread ? 'row unread w-full' : 'row w-full'}
                    style={{ color: 'inherit', fontWeight: 'inherit', textDecoration: 'none', minHeight: 72 }}
                    onClick={() => openAt(i)}
                  >
                    <div className={a.kind === 'deadline' ? 'dtile tb-dt-warn' : 'dtile tb-dt'} data-tip={longDate(a.publishedAt)}>
                      <span className="d">{dm.d}</span>
                      <span className="m">{dm.m}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px 8px', flexWrap: 'wrap' }}>
                        <KindMark a={a} />
                        <span className="cap">{feed ? 'Official feed' : `From ${a.authorName.split('@')[0]}`}</span>
                        {feed && h ? (
                          <span className="cap tb-m tb-iflex">{h}</span>
                        ) : null}
                      </div>
                      <div className="rt tb-ttl" style={{ marginTop: 6, fontWeight: unread ? 500 : 400, color: unread ? 'oklch(var(--ink))' : 'oklch(var(--ink-2))' }}>
                        {a.title}
                      </div>
                    </div>
                    {feed && h ? (
                      <span className="tb-d">
                        <STag>{h}</STag>
                      </span>
                    ) : null}
                    {unread ? <span className="udot" role="img" aria-label="Unread" data-tip="Unread" /> : <span style={{ width: 8, flex: 'none' }} />}
                  </LinkButton>
                );
              })
            )}
          </section>

          <section className="sx-card tb-s4" aria-labelledby="ann-portals">
            <CardHead id="ann-portals" d={P.landmark} title="Official portals" />
            <div style={{ padding: '12px var(--cp-card-x) 4px' }}>
              <Seg
                tabs={[
                  { label: 'Setup', cnt: setup.length },
                  { label: 'Recurring', cnt: recurring.length },
                ]}
                active={pt}
                onPick={setPt}
                label="Portal groups"
                wrap={false}
                grid={false}
              />
            </div>
            <div style={{ padding: '0 var(--cp-card-x) 12px', display: 'flex', flexDirection: 'column' }}>
              {groups.map((g) => (
                <div key={g.h}>
                  <div className="lbl tb-ghead">{g.h}</div>
                  {g.rows.map((r) => (
                    <div key={r.task} className="tb-prow">
                      <span className="rt" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.task}>
                        {r.task}
                      </span>
                      {r.portalUrl ? (
                        <a href={r.portalUrl} target="_blank" rel="noopener noreferrer" className="ibtn" aria-label={`Open portal for ${r.task}`} data-tip={`Open portal for ${r.task}`}>
                          <Svg d={P.ext} size={14} sw={1.8} />
                        </a>
                      ) : (
                        <span className="ibtn tb-islot" aria-hidden="true" />
                      )}
                      {r.circularUrl ? (
                        <a href={r.circularUrl} target="_blank" rel="noopener noreferrer" className="ibtn" aria-label={`Read circular for ${r.task}`} data-tip={`Read circular for ${r.task}`}>
                          <Svg d={P.circular} size={14} sw={1.8} />
                        </a>
                      ) : (
                        <span className="ibtn tb-islot" aria-hidden="true" />
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      {openIdx !== null && rows[openIdx] ? (
        <AnnDetail
          a={rows[openIdx]}
          index={openIdx}
          total={rows.length}
          team={shell?.team ?? []}
          sheet={isPhone}
          onClose={() => setOpenIdx(null)}
          onStep={(d) => {
            const n = openIdx + d;
            if (n >= 0 && n < rows.length) openAt(n);
          }}
          openChat={openChat}
          go={go}
        />
      ) : null}
    </div>
  );
}

function AnnDetail({
  a,
  index,
  total,
  team,
  sheet,
  onClose,
  onStep,
  openChat,
  go,
}: {
  a: Announcement;
  index: number;
  total: number;
  sheet: boolean;
  team: Array<{ id: string; name: string; role: string; email?: string; phoneE164?: string; whatsappE164?: string }>;
  onClose: () => void;
  onStep: (d: number) => void;
  openChat: (q?: string) => void;
  go: (href: string) => void;
}) {
  const feed = a.origin === 'feed';
  const link = a.linkPath?.trim() || '';
  const author = team.find((t) => t.id === a.authorId);
  const authorName = author?.name ?? a.authorName.split('@')[0];
  const roleLabel = author?.role ?? (a.authorRole === 'manager' ? 'Project Manager' : a.authorRole === 'intern' ? 'Project Lead' : 'SBC');
  const when = sep(new Date(a.publishedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }));
  const h = host(a);
  const wa = author ? contactHref('wa', author) : null;
  const em = author ? contactHref('email', author) : null;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft' && index > 0) onStep(-1);
      if (e.key === 'ArrowRight' && index < total - 1) onStep(1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onStep, index, total]);
  return (
    <Dialog labelledBy="ad-t" width={560} sheet={sheet} onClose={onClose} tp="tp-ann">
      <div className="dlg-h" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id="ad-t" className="tb-adt" style={{ margin: 0 }}>
            {a.title}
          </h2>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
            <STag tone={a.kind === 'deadline' ? 'warn' : 'idle'}>{ANNOUNCEMENT_KIND_LABEL[a.kind]}</STag>
            {imp(a) ? <STag tone="bad">Important</STag> : null}
            <span className="cap">{when}</span>
          </div>
        </div>
        <CloseBtn onClick={onClose} />
      </div>
      <div className="dlg-b" style={{ fontSize: 14, lineHeight: 1.6, color: 'oklch(var(--ink))' }}>
        <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{a.body?.trim() || a.title}</p>
        {feed ? (
          <div className="tb-by">
            <div style={{ flex: 1 }}>
              <div className="rt" style={{ fontWeight: 500 }}>Official feed</div>
              <div className="cap">
                {h || a.sourceName} · {when}
              </div>
            </div>
            {a.sourceUrl ? (
              <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-o btn-sm">
                {h || 'Source'}
                <Svg d={P.ext} size={14} sw={1.8} />
                <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}> (opens in a new tab)</span>
              </a>
            ) : null}
          </div>
        ) : (
          <div className="tb-by">
            <span className="av" style={{ width: 36, height: 36, fontSize: 12, ...avatarTint(a.authorId ?? authorName) }}>
              {initialsOf(authorName)}
            </span>
            <div style={{ flex: 1 }}>
              <div className="rt" style={{ fontWeight: 500 }}>{authorName}</div>
              <div className="cap">
                {roleLabel} · {when}
              </div>
            </div>
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="ibtn wa" aria-label={`WhatsApp ${authorName}`}>
                <Svg d={P.waShort} sw={1.8} />
              </a>
            ) : null}
            {em ? (
              <a href={em} className="ibtn" aria-label={`Email ${authorName}`}>
                <Svg d={P.mail} sw={1.8} />
              </a>
            ) : null}
          </div>
        )}
        <LinkButton
          className="ask"
          style={{ alignSelf: 'flex-start', fontSize: 13 }}
          onClick={() => {
            onClose();
            openChat(`Tell me about ${a.title}`);
          }}
        >
          Ask VCFO about this
        </LinkButton>
      </div>
      <div className="dlg-f" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="ibtn ghost" aria-label="Previous announcement" data-tip="Previous announcement" disabled={index === 0} onClick={() => onStep(-1)}>
            <Svg d={P.prev} join={false} />
          </button>
          <button type="button" className="ibtn ghost" aria-label="Next announcement" data-tip="Next announcement" disabled={index >= total - 1} onClick={() => onStep(1)}>
            <Svg d={P.next} join={false} />
          </button>
          <span className="cap" style={{ alignSelf: 'center' }}>
            {index + 1} / {total}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* C-741: the announcement points to a portal page. */}
          {link ? (
            <a
              href={link}
              className="btn btn-o"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                onClose();
                go(link);
              }}
            >
              Open
            </a>
          ) : null}
          <button type="button" className="btn btn-n" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </Dialog>
  );
}
