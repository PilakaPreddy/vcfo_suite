'use client';

/**
 * Library (/app/client/library) — prototype `knowledge-bank`:
 * bookshelf s/docs/lib_shelf_a.dc.html (category pill, books chip, Monthly
 * status brief, PDF brief, search, Recently read strip, shelves with planks,
 * books that lift and tilt, blue "Updated" ribbon, no-match bubble), the
 * recently-read drill (lib_recent_drill) and the empty library (lib_empty).
 * VCFO Spectrum (C-0110, R-10, R-48): the shelf filter is a dropdown, the shelves sit in
 * a plain white card, and the empty and no-match states are dashed areas with the action
 * (no mascot).
 * Data: saved items GET /api/client/library (not behind the Ask VCFO flag), reading progress
 * GET /api/client/library/reads (NEW), suggestions GET /api/client/library/topic.
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePortal, usePortalOptional } from '@/components/client-portal/PortalProvider';
import type { LibraryItemView } from '@/hooks/ask/ask-api';
import LegacyClientLibrary from '@/views/client/ask/ClientLibrary';
import { PagePortal, useDelayedLoading } from '../shared-ui';
import { LinkButton } from '@/components/client-portal/LinkButton';
import { portalHref } from '@/components/client-portal/routes';
import { catOf, fetchLibrary, fetchReads, LIBRARY_KEY, libraryExportHref, readerHref, readTip, READS_KEY, SHELF_CATS, type LibraryRead } from './library-model';
import '../../../css/library-shelf.css';

export function LibraryPage() {
  const portal = usePortalOptional();
  if (!portal) return <LegacyClientLibrary />;
  return <LibraryInner />;
}

/** The 28 px icon tile before the library card title (R-16). */
function LibTile() {
  return (
    <span className="sx-tile" data-tone="violet" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5.5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4Z M20 5.5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6Z" />
      </svg>
    </span>
  );
}

function LibraryInner() {
  const { shell } = usePortal();
  const company = shell?.companyShort ?? 'Your company';
  const lib = useQuery({ queryKey: LIBRARY_KEY, queryFn: fetchLibrary });
  const reads = useQuery({ queryKey: READS_KEY, queryFn: fetchReads });
  const items = useMemo(() => lib.data?.items ?? [], [lib.data]);
  const [c, setC] = useState(0);
  const [q, setQ] = useState('');
  const [drill, setDrill] = useState<number | null>(null);
  const skeleton = useDelayedLoading(lib.isLoading);

  const cats = useMemo(() => SHELF_CATS.filter((x) => x.id !== 'labour' || items.some((i) => i.category === 'labour')), [items]);
  const ql = q.trim().toLowerCase();
  const active = c === 0 ? null : cats[c - 1];
  const shelves = cats
    .map((cat) => ({
      cat,
      books: items.filter((b) => (b.category === cat.id || (!SHELF_CATS.some((s) => s.id === b.category) && cat.id === 'your-project')) && (!active || active.id === cat.id) && (!ql || b.title.toLowerCase().includes(ql))),
    }))
    .filter((s) => s.books.length);
  const shownIds = shelves.flatMap((s) => s.books.map((b) => b.id));
  const recent = reads.data ?? [];
  const engagementId = shell?.engagementId;

  if (lib.isLoading) {
    return (
      <div className="cp-library">
        <div className="vlib">
          <div className="vlib-col">
            <main className="vlib-main" aria-busy="true">
              {skeleton ? (
                <>
                  <div className="sx-card vlib-shelves">
                    <div className="sx-head vlib-head" aria-hidden="true">
                      <span className="lsk" style={{ width: 28, height: 28 }} />
                      <span className="lsk" style={{ width: 160, height: 14 }} />
                      <span style={{ flex: 1 }} />
                      <span className="lsk" style={{ width: 200, height: 36 }} />
                      <span className="lsk" style={{ width: 110, height: 36 }} />
                    </div>
                    <div className="vlib-search" aria-hidden="true">
                      <span className="lsk" style={{ height: 40 }} />
                    </div>
                    {[0, 1].map((sh) => (
                      <section key={sh} aria-hidden="true">
                        <div className="vlib-sh">
                          <span className="lsk" style={{ width: 10, height: 10, borderRadius: 3 }} />
                          <span className="lsk" style={{ width: 120, height: 12 }} />
                        </div>
                        <div className="shelf">
                          {[0, 1, 2, 3].map((b) => (
                            <span key={b} className="lsk" style={{ width: 128, height: 172, borderRadius: '2px 6px 6px 2px', flex: 'none' }} />
                          ))}
                        </div>
                        <div className="plank" style={{ margin: '0 16px' }} />
                      </section>
                    ))}
                  </div>
                </>
              ) : null}
            </main>
          </div>
        </div>
      </div>
    );
  }

  if (lib.isError) {
    return (
      <div className="cp-library">
        <div className="vlib">
          <div className="vlib-col">
            <main className="vlib-main">
              <div className="lerr" role="alert">
                <span style={{ flex: 1 }}>Could not load your library</span>
                <button type="button" className="sx-btn sm" onClick={() => void lib.refetch()}>
                  Try again
                </button>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  if (!items.length) return <EmptyLibrary company={company} />;

  return (
    <div className="cp-library">
      <div className="vlib">
        <div className="vlib-col">
          <main className="vlib-main">
            {/* The controls sit above the shelves, as in the prototype. */}
            <div className="vlib-tools">
              <label className="sx-in sm">
                <select aria-label="Shelf" value={c} onChange={(e) => setC(Number(e.target.value))}>
                  {[null, ...cats].map((cat, i) => {
                    const cnt = cat ? items.filter((b) => b.category === cat.id).length : items.length;
                    return (
                      <option key={cat?.id ?? 'all'} value={i}>
                        {cat ? `${cat.tab(company)} · ${cnt}` : `All shelves · ${cnt}`}
                      </option>
                    );
                  })}
                </select>
              </label>
              <div className="vlib-acts">
                {engagementId && lib.data?.features?.statusBrief ? (
                  <a className="sx-btn" href={`/api/ask/brief?engagementId=${encodeURIComponent(engagementId)}`}>
                    Monthly status brief
                  </a>
                ) : null}
                <a className="sx-btn" href={libraryExportHref(shownIds)} aria-disabled={!shownIds.length}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 4v11 M7.5 10.5 12 15l4.5-4.5 M5 19.5h14" />
                  </svg>
                  PDF brief
                </a>
              </div>
            </div>
            <div className="vlib-search">
              <label className="sx-in">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M11 4.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13Z M16 16l4 4" />
                </svg>
                <input type="search" aria-label="Search books" placeholder="Search books" value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
            </div>
            {recent.length ? (
              <section className="vlib-recent">
                <h2>Recently read</h2>
                {recent.map((r) => {
                  const cat = catOf(r.category);
                  const tip = readTip(r);
                  return (
                    <div key={r.ref} className="mini" style={{ ['--bc' as string]: cat.color }}>
                      <span className="cv" style={cat.gold ? { boxShadow: 'inset 4px 0 0 var(--gold)' } : undefined} />
                      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                        <Link href={readerHref(r)}>
                          {r.title}
                        </Link>
                        {/* the extra utilities carry over what `.vlib-recent .mini a` gave this control as an anchor */}
                        <LinkButton
                          className="pbar tip w-full [overflow-wrap:anywhere] max-[767px]:!flex max-[767px]:items-center max-[767px]:!min-h-[40px]"
                          data-tip={tip}
                          aria-label={`${tip}. Open the reading list`}
                          onClick={() => setDrill(r.progressPct >= 100 ? 2 : 1)}
                        >
                          <span className={`bar${r.progressPct >= 100 ? ' done' : ''}`}>
                            <span style={{ width: `${r.progressPct}%` }} />
                          </span>
                        </LinkButton>
                      </span>
                    </div>
                  );
                })}
              </section>
            ) : null}

            <section className="sx-card vlib-shelves" aria-label="Shelves">
              {shelves.map(({ cat, books }) => (
                <section key={cat.id} aria-label={cat.title(company)}>
                  <div className="vlib-sh" style={{ ['--bc' as string]: cat.color }}>
                    <i aria-hidden="true" />
                    <h2>{cat.title(company)}</h2>
                    <span>{books.length}</span>
                  </div>
                  <div className="shelf">
                    {books.map((b) => (
                      <Book key={b.id} b={b} company={company} />
                    ))}
                  </div>
                  <div className="plank" style={{ margin: '0 24px' }} />
                </section>
              ))}
              {shelves.length === 0 ? (
                <div className="sx-empty" role="status">
                  <span>{ql ? <>No book matches “{q.trim()}”</> : 'No books on this shelf'}</span>
                  <button
                    type="button"
                    className="sx-btn sm"
                    onClick={() => {
                      setQ('');
                      setC(0);
                    }}
                  >
                    Clear search
                  </button>
                </div>
              ) : null}
            </section>
          </main>
        </div>
      </div>
      {drill != null ? <RecentDrill reads={reads.data ?? []} tab={drill} onClose={() => setDrill(null)} /> : null}
    </div>
  );
}

function Book({ b, company }: { b: LibraryItemView; company: string }) {
  const cat = catOf(b.category);
  return (
    <Link className="book" href={`/app/client/library/${encodeURIComponent(b.id)}`} style={{ ['--bc' as string]: cat.color }} aria-label={`Open ${b.title}${b.updated ? ' (updated since you saved it)' : ''}`}>
      <span className="bk-band" />
      {b.updated ? <span className="rib" role="img" aria-label="Updated since you saved it" data-tip="Updated since you saved it" /> : null}
      <span className="bk-ic">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={cat.icon} />
        </svg>
      </span>
      <span className="bk-t">{b.title}</span>
      <span className="bk-c">{cat.short(company)}</span>
    </Link>
  );
}

function RecentDrill({ reads, tab, onClose }: { reads: LibraryRead[]; tab: number; onClose: () => void }) {
  const { go } = usePortal();
  const [t, setT] = useState(tab);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const k = (r: LibraryRead) => (r.progressPct >= 100 ? 2 : 1);
  const list = reads.filter((r) => t === 0 || k(r) === t);
  const close = useCallback(() => {
    onClose();
    (opener.current as HTMLElement | null)?.focus?.();
  }, [onClose]);
  useEffect(() => {
    opener.current = document.activeElement;
    const tm = setTimeout(() => closeRef.current?.focus(), 40);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      clearTimeout(tm);
      document.removeEventListener('keydown', key, true);
    };
  }, [close]);
  return (
    <PagePortal page="library">
      <div className="ld-root">
        <div className="ld-scrim" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div role="dialog" aria-modal="true" aria-label="Recently read" className="dlg" style={{ width: 600, maxWidth: '100%', overflow: 'hidden', fontFamily: 'var(--font-sans),system-ui,sans-serif', fontSize: 13 }}>
            <div className="ld-head">
              <h2>Recently read</h2>
              <div className="seg" role="tablist" aria-label="Reading status">
                {['All', 'In progress', 'Finished'].map((l, i) => (
                  <button key={l} type="button" role="tab" aria-selected={t === i} className={t === i ? 'on' : ''} onClick={() => setT(i)}>
                    {l}
                    <span className="c">{i === 0 ? reads.length : reads.filter((r) => k(r) === i).length}</span>
                  </button>
                ))}
              </div>
              <button ref={closeRef} type="button" className="ib" aria-label="Close" onClick={close}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div>
              {list.map((r) => {
                const cat = catOf(r.category);
                return (
                  <Link key={r.ref} className="row" href={readerHref(r)} onClick={() => onClose()}>
                    <span className="cv" style={{ background: cat.color, ...(cat.gold ? { boxShadow: 'inset 4px 0 0 var(--gold)' } : {}) }} />
                    <span className="ld-title">{r.title}</span>
                    <span className={`bar${r.progressPct >= 100 ? ' done' : ''}`} role="img" aria-label={readTip(r)}>
                      <span style={{ width: `${r.progressPct}%` }} />
                    </span>
                    <span className="ld-pct">{r.progressPct >= 100 ? 'Done' : `${r.progressPct}%`}</span>
                  </Link>
                );
              })}
              {list.length === 0 ? <div className="sx-empty">None</div> : null}
            </div>
            <div className="ld-foot">
              <a
                className="sx-btn"
                href={portalHref('knowledge-bank')}
                onClick={(e) => {
                  e.preventDefault();
                  close();
                  go('knowledge-bank');
                }}
              >
                Open Library
              </a>
            </div>
          </div>
        </div>
      </div>
    </PagePortal>
  );
}

function EmptyLibrary({ company }: { company: string }) {
  const { openChat } = usePortal();
  const sugg = useQuery({
    queryKey: ['client-portal', 'library-suggestions'],
    queryFn: async () => {
      const res = await fetch('/api/client/library/topic');
      if (!res.ok) return [] as Array<{ slug: string; title: string; question: string }>;
      return ((await res.json()) as { suggestions: Array<{ slug: string; title: string; question: string }> }).suggestions;
    },
  });
  return (
    <div className="cp-library">
      <div className="vlib le-root">
        <div className="vlib-col">
          <main className="vlib-main">
            <section className="sx-card" aria-label={`${company}’s library`}>
              <div className="sx-head">
                <LibTile />
                <h2>{company}’s library</h2>
              </div>
              <div className="sx-empty" role="status" style={{ minHeight: 320 }}>
                <span>No saved answers yet</span>
                <button type="button" className="sx-btn p" onClick={() => openChat()}>
                  Ask VCFO
                </button>
                {sugg.data?.length ? (
                  <div className="le-q">
                    {sugg.data.map((sg) => (
                      <Link key={sg.slug} className="sx-btn sm" href={`/app/client/learn/${encodeURIComponent(sg.slug)}`}>
                        {sg.question}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
