'use client';

/**
 * Library reader (prototype s/docs/lib_reader.dc.html, mode `saved` for
 * /app/client/library/[id], `learn` for /app/client/learn/[slug]): head card
 * (white since VCFO Spectrum C-0110, R-02) with category / Reviewed by SBC / Updated chips, depth pill, read time,
 * official link; lead line; Focus-track timeline (or the answer's own
 * visual); facts grid at "More detail"; Why it matters; sources; actions
 * (Saved / Save to library, PDF brief, Ask a follow-up, Remove with Undo);
 * side cards In <Company>'s project · Related · Documents for this.
 * Reading progress is recorded per section (NEW client_library_reads).
 * Chips, file badges and step marks are the shared Spectrum parts, drawn in
 * `.cp-tw` islands; the not-available state is a plain-edged area (no mascot, R-04).
 */
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AnswerDepth, AnswerEnvelope, Visual } from '@/data/ask/schema';
import { usePortal, usePortalCrumbs, usePortalOptional } from '@/components/client-portal/PortalProvider';
import { usePortalIncorporation, todayIST } from '@/components/client-portal/hooks';
import { portalHref, stepHref } from '@/components/client-portal/routes';
import { VisualRenderer } from '@/components/ask/visuals/VisualRenderer';
import { Chip, Tag, type ChipTone } from '@/components/ui/spectrum-chip';
import { FileBadge, fileType, type FileType } from '@/components/ui/file-badge';
import { StepMark } from '@/components/ui/step-track';
import LegacyClientLibraryItem from '@/views/client/ask/ClientLibraryItem';
import LegacyClientLearnTopic from '@/views/client/ask/ClientLearnTopic';
import { DocViewer, type ViewerDoc } from '../DocViewer';
import { dayMonth, fileTag, MONTHS_SHORT } from '../file-types';
import { toViewerDoc, useClientDocuments } from '../shared-ui';
import type { DocStatus } from '@/lib/client-portal/documents';
import { catOf, categoryName, fetchLibrary, fetchLibraryItem, fetchTopicAnswer, LIBRARY_KEY, libraryItemExportHref, READS_KEY, saveToLibrary } from './library-model';
import '../../../css/library-reader.css';

/** Document status as a Spectrum chip tone (prototype STATUS_CHIP). */
const DOC_TONE: Record<DocStatus, ChipTone> = { Final: 'ok', Approved: 'ok', 'In review': 'prog', Replaced: 'idle', Missing: 'warn' };

/** The R-26 badge type for a document, from its file name or, failing that, its content type. */
function badgeType(n: { fileName: string; contentType?: string | null }): FileType {
  const t = fileTag(n.fileName, n.contentType);
  if (t === 'PDF' || t === 'JPG' || t === 'PNG' || t === 'DOCX') return t;
  if (t === 'DOC') return 'DOCX';
  return fileType(n.fileName);
}

/** A 28 px tinted icon tile before a card title (R-16). */
function HeadTile({ tone, d }: { tone?: string; d: string }) {
  return (
    <span className="sx-tile" data-tone={tone} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </span>
  );
}

const DEPTHS: Array<{ label: string; d: AnswerDepth }> = [
  { label: 'Simpler', d: 'simple' },
  { label: 'Normal', d: 'normal' },
  { label: 'More detail', d: 'detail' },
];

interface TopicMeta {
  slug: string;
  title: string;
  category: string;
  reviewed: boolean;
  reviewedAt: string | null;
  stepIds: string[];
  related: Array<{ slug: string; title: string; category: string }>;
  citations: Array<{ id: string; label: string; url?: string }>;
  obligationId: string | null;
}

const OFFICIAL: Array<[RegExp, string]> = [
  [/firms\.rbi\.org\.in/i, 'RBI FIRMS'],
  [/rbi\.org\.in/i, 'RBI'],
  [/mca\.gov\.in/i, 'MCA portal'],
  [/gst\.gov\.in/i, 'GST portal'],
  [/incometax\.gov\.in/i, 'Income-tax e-filing'],
  [/tdscpc\.gov\.in|traces/i, 'TRACES'],
  [/epfindia\.gov\.in/i, 'EPFO'],
  [/esic\.gov\.in/i, 'ESIC'],
  [/dgft\.gov\.in/i, 'DGFT'],
  [/udyamregistration\.gov\.in/i, 'Udyam'],
  [/ipindia\.gov\.in/i, 'IP India'],
  [/\.gov\.in|\.nic\.in/i, ''],
];

function officialLink(cites: Array<{ label: string; url?: string }>): { label: string; url: string } | null {
  for (const c of cites) {
    if (!c.url) continue;
    for (const [re, name] of OFFICIAL) {
      if (re.test(c.url)) {
        let host = name;
        if (!host) {
          try {
            host = new URL(c.url).hostname.replace(/^www\./, '');
          } catch {
            host = c.label;
          }
        }
        return { label: host, url: c.url };
      }
    }
  }
  return null;
}

function visualText(v?: Visual): string {
  if (!v) return '';
  return JSON.stringify(v).replace(/[{}[\]",:]/g, ' ');
}

function readMinutes(a: AnswerEnvelope): number {
  const words = `${a.line} ${a.why ?? ''} ${visualText(a.visual)}`.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function parseWhen(when: string, today: string): 'done' | 'future' | null {
  const m = when.match(/(\d{1,2}\s+[A-Za-z]{3,9}(?:\s+\d{4})?|\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  let s = m[1]!;
  if (!/\d{4}/.test(s)) s = `${s} ${today.slice(0, 4)}`;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10) <= today ? 'done' : 'future';
}

export function ReaderPage({ mode }: { mode: 'saved' | 'learn' }) {
  const portal = usePortalOptional();
  if (!portal) return mode === 'saved' ? <LegacyClientLibraryItem /> : <LegacyClientLearnTopic />;
  return <ReaderInner mode={mode} />;
}

function ReaderInner({ mode }: { mode: 'saved' | 'learn' }) {
  const params = useParams<{ id?: string; slug?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { shell, openChat, toast, go } = usePortal();
  const company = shell?.companyShort ?? 'Your company';
  const engagementId = shell?.engagementId ?? null;
  const { model } = usePortalIncorporation();
  const docsQ = useClientDocuments();
  const [viewer, setViewer] = useState<{ docs: ViewerDoc[]; i: number } | null>(null);

  const itemQ = useQuery({
    queryKey: ['ask', 'library', 'item', params?.id],
    queryFn: () => fetchLibraryItem(params!.id!),
    enabled: mode === 'saved' && !!params?.id,
    retry: false,
  });
  const item = itemQ.data?.item;
  const slug = mode === 'learn' ? params?.slug ?? '' : item?.topicSlug ?? '';
  const savedDepth = item?.answer.depth ?? 'normal';
  const [depth, setDepth] = useState<AnswerDepth | null>(null);
  const curDepth = depth ?? (mode === 'saved' ? savedDepth : 'normal');

  const topicQ = useQuery({
    queryKey: ['ask', 'topic', slug, curDepth, engagementId],
    queryFn: () => fetchTopicAnswer(slug, { depth: curDepth, engagementId }),
    enabled: !!slug && !!engagementId && (mode === 'learn' || (depth != null && depth !== savedDepth)),
    placeholderData: (p) => p,
    retry: false,
  });
  const metaQ = useQuery({
    queryKey: ['client-portal', 'topic-meta', slug],
    queryFn: async () => {
      const res = await fetch(`/api/client/library/topic?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) return null;
      return ((await res.json()) as { topic: TopicMeta }).topic;
    },
    enabled: !!slug,
  });
  const libQ = useQuery({ queryKey: LIBRARY_KEY, queryFn: fetchLibrary });
  const filingsQ = useQuery({
    queryKey: ['client-portal', 'filings-for-reader', engagementId],
    queryFn: async () => {
      const res = await fetch(`/api/filings${engagementId ? `?engagementId=${encodeURIComponent(engagementId)}` : ''}`);
      if (!res.ok) return [];
      return ((await res.json()) as { rows: Array<{ id: string; obligationId: string; particular: string; dueDate: string; filedOn: string | null; periodLabel: string | null }> }).rows;
    },
    enabled: !!metaQ.data?.obligationId,
  });

  const answer: AnswerEnvelope | undefined = (topicQ.data?.answer && (mode === 'learn' || depth != null)) ? topicQ.data.answer : item?.answer;
  const title = mode === 'learn' ? topicQ.data?.topic.title ?? metaQ.data?.title ?? '' : item?.title ?? '';
  usePortalCrumbs(['Library', title || 'Reading']);
  const category = mode === 'learn' ? topicQ.data?.topic.category ?? metaQ.data?.category ?? '' : item?.category ?? '';
  const savedItem = mode === 'learn' ? libQ.data?.items.find((x) => x.topicSlug === slug) : item;
  const loading = mode === 'saved' ? itemQ.isLoading : topicQ.isPending;
  const failed = mode === 'saved' ? itemQ.isError || (!itemQ.isLoading && !item) : topicQ.isError;

  /* ---------- reading progress ---------- */
  const sectionsRef = useRef<Array<HTMLElement | null>>([]);
  const seen = useRef<Set<number>>(new Set());
  const posted = useRef(0);
  useEffect(() => {
    if (!answer) return;
    seen.current = new Set();
    posted.current = 0;
    const els = sectionsRef.current.filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const total = els.length;
    const body = mode === 'saved' && item ? { itemId: item.id } : slug ? { topicSlug: slug } : null;
    if (!body) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (seen.current.size <= posted.current) return;
      posted.current = seen.current.size;
      void fetch('/api/client/library/reads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, sectionsRead: seen.current.size, sectionsTotal: total }),
      }).then(() => void qc.invalidateQueries({ queryKey: READS_KEY }));
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) seen.current.add(els.indexOf(e.target as HTMLElement));
        }
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, 800);
      },
      { threshold: 0.6 },
    );
    els.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
      flush();
    };
  }, [answer, item, slug, mode, qc]);

  /* ---------- actions ---------- */
  const [saving, setSaving] = useState(false);
  const save = useCallback(async () => {
    if (!engagementId || !answer || !slug) return;
    setSaving(true);
    try {
      const { item: saved } = await saveToLibrary({ engagementId, topicSlug: slug, answer });
      void qc.invalidateQueries({ queryKey: LIBRARY_KEY });
      toast('Saved to library');
      router.replace(`/app/client/library/${encodeURIComponent(saved.id)}`);
    } catch {
      toast('Could not save to your library');
    } finally {
      setSaving(false);
    }
  }, [engagementId, answer, slug, qc, toast, router]);

  const remove = useCallback(async () => {
    if (!item) return;
    const res = await fetch(`/api/client/library/${encodeURIComponent(item.id)}/remove`, { method: 'POST' });
    if (!res.ok) {
      toast('Could not remove this item');
      return;
    }
    void qc.invalidateQueries({ queryKey: LIBRARY_KEY });
    void qc.invalidateQueries({ queryKey: READS_KEY });
    toast('Removed from library', {
      undo: () => {
        void fetch(`/api/client/library/${encodeURIComponent(item.id)}/remove`, { method: 'DELETE' }).then(() => {
          void qc.invalidateQueries({ queryKey: LIBRARY_KEY });
          void qc.invalidateQueries({ queryKey: READS_KEY });
          router.push(`/app/client/library/${encodeURIComponent(item.id)}`);
        });
      },
    });
    go('knowledge-bank');
  }, [item, qc, toast, go, router]);

  /* ---------- side data ---------- */
  const meta = metaQ.data;
  const stepIds = meta?.stepIds ?? (answer?.target?.stepId ? [answer.target.stepId] : []);
  const projectCard = useMemo(() => {
    const today = todayIST();
    if (meta?.obligationId && filingsQ.data?.length) {
      const rows = filingsQ.data.filter((r) => r.obligationId === meta.obligationId).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const next = rows.find((r) => !r.filedOn) ?? rows[rows.length - 1];
      if (next) {
        const days = Math.round((Date.parse(next.dueDate) - Date.parse(today)) / 86_400_000);
        return {
          date: next.dueDate,
          title: `${next.particular}${next.periodLabel ? ` · ${next.periodLabel}` : ''}`,
          chip: next.filedOn ? { t: `Filed ${dayMonth(next.filedOn)}`, tone: 'ok' as ChipTone } : days < 0 ? { t: `${-days} days late`, tone: 'bad' as ChipTone } : { t: `${days} days left`, tone: 'warn' as ChipTone },
          owner: 'SBC files',
          link: { text: 'Open in Compliances', href: `${portalHref('filings')}?filing=${encodeURIComponent(next.id)}` },
          done: !!next.filedOn,
        };
      }
    }
    const steps = stepIds.map((id) => model.byId[id]).filter(Boolean);
    const s = steps.find((x) => x!.kind !== 'done') ?? steps[steps.length - 1];
    if (!s) return null;
    const date = s.kind === 'done' ? s.doneOn : s.due;
    const days = date ? Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000) : null;
    return {
      date,
      title: `Step ${s.n} · ${s.title}`,
      chip: s.kind === 'done' ? { t: 'Done', tone: 'ok' as ChipTone } : s.late ? { t: `${s.lateDays} days late`, tone: 'bad' as ChipTone } : days != null ? { t: `${days} days left`, tone: 'warn' as ChipTone } : null,
      owner: s.owner === 'client' ? `${company} does this` : s.owner === 'mca' ? 'MCA reviews' : 'SBC files',
      link: { text: 'Open in Incorporation', href: stepHref(s.id) },
      done: s.kind === 'done',
    };
  }, [meta, filingsQ.data, stepIds, model, company]);
  const relDocs = (docsQ.data?.nodes ?? []).filter((n) => n.stepId && stepIds.includes(n.stepId) && !n.replaced && n.status !== 'Missing' && n.ref);
  const related = (meta?.related ?? []).map((r) => {
    const saved = libQ.data?.items.find((x) => x.topicSlug === r.slug);
    return { ...r, href: saved ? `/app/client/library/${encodeURIComponent(saved.id)}` : `/app/client/learn/${encodeURIComponent(r.slug)}` };
  });

  if (loading) {
    return (
      <div className="cp-reader">
        <div className="vrd">
          <div className="vrd-col">
            <main className="vrd-main" aria-busy="true">
              <article className="vrd-art">
                <span className="lsk" style={{ height: 150 }} />
                <span className="lsk" style={{ height: 320 }} />
              </article>
              <aside className="vrd-side">
                <span className="lsk" style={{ height: 120 }} />
            </aside>
            </main>
          </div>
        </div>
      </div>
    );
  }
  if (failed || !answer) {
    return (
      <div className="cp-reader">
        <div className="vrd">
          <div className="vrd-col">
            <main className="vrd-main" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
              <section className="sx-card">
                <div className="sx-empty" role="alert" style={{ minHeight: 320 }}>
                  <span>{mode === 'saved' ? 'This book is not in your library any more' : 'This explanation is not available yet'}</span>
                  <Link className="sx-btn sm" href={portalHref('knowledge-bank')}>
                    Back to library
                  </Link>
                </div>
              </section>
            </main>
          </div>
        </div>
      </div>
    );
  }

  const di = DEPTHS.findIndex((d) => d.d === curDepth);
  const reviewed = answer.origin === 'reviewed' && !answer.draft;
  const official = officialLink(answer.citations);
  const timeline = answer.visual?.type === 'timeline' ? answer.visual : null;
  const facts = answer.visual?.type === 'keyFacts' ? answer.visual : null;
  const otherVisual = answer.visual && !timeline && !facts ? answer.visual : null;
  const today = todayIST();
  const tlKinds = timeline
    ? (() => {
        const k = timeline.events.map((e) => parseWhen(e.when, today));
        let cur = k.findIndex((x) => x !== 'done');
        if (cur < 0) cur = k.length - 1;
        return k.map((x, i) => (i < cur ? 'done' : i === cur ? 'now' : 'next'));
      })()
    : [];
  const secRef = (i: number) => (el: HTMLElement | null) => {
    sectionsRef.current[i] = el;
  };
  const showPill = !!slug;
  const updatedChip = mode === 'saved' && item?.updated;
  const updatedDate = meta?.reviewedAt ? dayMonth(meta.reviewedAt) : null;

  return (
    <div className="cp-reader">
      <div className="vrd">
        <div className="vrd-col">
          <main className="vrd-main">
            <article className="vrd-art">
              <section className="sx-card vrd-hero" aria-label={title}>
                <div className="vrd-chips cp-tw">
                  <Tag>{categoryName(category, company)}</Tag>
                  {reviewed ? <Chip tone="ok">Reviewed by SBC</Chip> : null}
                  {updatedChip ? (
                    <Chip tone="prog" title="Updated since you saved it">
                      {updatedDate ? `Updated ${updatedDate}` : 'Updated'}
                    </Chip>
                  ) : null}
                </div>
                <h1>{title}</h1>
                <div className="vrd-hrow">
                  {showPill ? (
                    <div className="sx-seg" role="group" aria-label="Depth">
                      {DEPTHS.map((d, i) => (
                        <button key={d.d} type="button" aria-pressed={di === i} aria-busy={topicQ.isFetching && di === i} onClick={() => setDepth(d.d)}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <span style={{ flex: 1 }} />
                  <span className="vrd-min">{readMinutes(answer)} min read</span>
                  {official ? (
                    <a className="sx-btn sm" href={official.url} target="_blank" rel="noopener noreferrer">
                      Official link · {official.label}
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M8 16L16 8 M9 8h7v7" />
                      </svg>
                      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}> (opens in a new tab)</span>
                    </a>
                  ) : null}
                </div>
              </section>

              <section className="sx-card vrd-body">
                <p ref={secRef(0)} className="vrd-lead">
                  {answer.line}
                </p>
                {timeline ? (
                  <div ref={secRef(1)} className="vrd-box">
                    <h2 className="sx-cap" style={{ margin: '0 0 14px' }}>
                      Timeline
                    </h2>
                    <div className="vrd-tl cp-tw">
                      {timeline.events.map((ev, i) => {
                        const k = tlKinds[i]!;
                        const solid = k === 'done' || (k === 'now' && tlKinds[i - 1] === 'done');
                        return (
                          <span key={`${ev.label}-${i}`} style={{ display: 'contents' }}>
                            {i > 0 ? <span className={`lnk${solid ? '' : ' dash'}`} aria-hidden="true" /> : null}
                            <div className="node">
                              <StepMark state={k as 'done' | 'now' | 'next'} label={k === 'done' ? 'Done' : k === 'now' ? 'Now' : 'Next'} />
                              <span className="vrd-tl-l">{ev.label}</span>
                              <span className="vrd-tl-w">{ev.when}</span>
                            </div>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : otherVisual ? (
                  <div ref={secRef(1)} className="vrd-visual">
                    <div className="cp-tw">
                      <VisualRenderer visual={otherVisual} />
                    </div>
                  </div>
                ) : null}
                {facts && curDepth === 'detail' ? (
                  <div className="vrd-facts">
                    {facts.facts.map((f) => (
                      <div key={f.k}>
                        <div className="vrd-fk">{f.k}</div>
                        <div className="vrd-fv">{f.v}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {answer.why ? (
                  <div ref={secRef(2)} className="vrd-why">
                    <HeadTile tone="amber" d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7Z" />
                    <div style={{ minWidth: 0 }}>
                      <h2>Why it matters to {company}</h2>
                      <p>{answer.why}</p>
                    </div>
                  </div>
                ) : null}
                {answer.citations.length ? (
                  <div ref={secRef(3)}>
                    <h2 className="sx-cap" style={{ margin: '0 0 8px' }}>
                      Sources
                    </h2>
                    <ul className="vrd-src" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {answer.citations.map((c) => (
                        <li key={c.id}>
                          {c.url ? (
                            <a href={c.url} target="_blank" rel="noopener noreferrer" className="vrd-srcc">
                              {c.label} ↗
                            </a>
                          ) : (
                            <span className="vrd-srcc">
                              {c.label}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="vrd-acts">
                  {savedItem ? (
                    <span className="vrd-saved">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M6.5 4h11v16l-5.5-4-5.5 4Z M9.5 10l1.8 1.8 3.2-3.3" />
                      </svg>
                      Saved to library
                    </span>
                  ) : (
                    <button type="button" className="sx-btn p" disabled={saving || !engagementId} onClick={() => void save()}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M6.5 4h11v16l-5.5-4-5.5 4Z" />
                      </svg>
                      Save to library
                    </button>
                  )}
                  {savedItem ? (
                    <a className="sx-btn" href={libraryItemExportHref(savedItem.id)}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 4v11 M7.5 10.5 12 15l4.5-4.5 M5 19.5h14" />
                      </svg>
                      PDF brief
                    </a>
                  ) : null}
                  <button type="button" className="sx-btn" onClick={() => openChat(`Tell me more about ${title}`)}>
                    Ask a follow-up
                  </button>
                  <span style={{ flex: 1 }} />
                  {mode === 'saved' && item ? (
                    <button type="button" className="sx-ib edge" aria-label="Remove from library" title="Remove from library" onClick={() => void remove()}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4.5 7h15 M9.5 7V4.5h5V7 M6.5 7l1 12.5h9l1-12.5" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              </section>
            </article>

            <aside className="vrd-side">
              {projectCard ? (
                <section className="sx-card" aria-label={`In ${company}’s project`}>
                  <div className="sx-head">
                    <HeadTile tone="teal" d="M4.5 6.5h15v13h-15Z M4.5 10.5h15 M8.5 4v4 M15.5 4v4" />
                    <h2>In {company}’s project</h2>
                  </div>
                  <div className="sx-row">
                    {projectCard.date ? (
                      <span className={`vrd-dt${projectCard.done ? ' done' : ''}`}>
                        <span>{MONTHS_SHORT[new Date(`${projectCard.date.slice(0, 10)}T00:00:00`).getMonth()]!}</span>
                        <b>{new Date(`${projectCard.date.slice(0, 10)}T00:00:00`).getDate()}</b>
                      </span>
                    ) : null}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="vrd-rt">{projectCard.title}</span>
                      <span className="cp-tw" style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        {projectCard.chip ? <Chip tone={projectCard.chip.tone}>{projectCard.chip.t}</Chip> : null}
                        <Tag>{projectCard.owner}</Tag>
                      </span>
                    </span>
                  </div>
                  <div className="vrd-foot">
                    <Link href={projectCard.link.href}>{projectCard.link.text}</Link>
                  </div>
                </section>
              ) : null}
              {related.length ? (
                <section className="sx-card" aria-label={`Related in ${company}’s library`}>
                  <div className="sx-head">
                    <HeadTile tone="teal" d="M4 5.5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4Z M20 5.5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6Z" />
                    <h2>Related in {company}’s library</h2>
                  </div>
                  {related.map((r) => {
                    const shelf = catOf(r.category);
                    return (
                      <Link key={r.slug} className="sx-row" href={r.href}>
                        {/* the row tile takes the shelf's cover tone and icon */}
                        <span className="sx-tile" aria-hidden="true" style={{ background: `color-mix(in oklch, ${shelf.color} 16%, transparent)`, color: shelf.color }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d={shelf.icon} />
                          </svg>
                        </span>
                        <span className="vrd-rt">{r.title}</span>
                      </Link>
                    );
                  })}
                </section>
              ) : null}
              {relDocs.length ? (
                <section className="sx-card" aria-label="Documents for this">
                  <div className="sx-head">
                    <HeadTile tone="amber" d="M6 3.5h8l4 4v13H6Z M14 3.5v4h4" />
                    <h2>Documents for this</h2>
                  </div>
                  {relDocs.map((n, i) => (
                    <button key={n.id} type="button" className="sx-row" onClick={() => setViewer({ docs: relDocs.map((x) => toViewerDoc(x)), i })}>
                      <span className="cp-tw" style={{ display: 'inline-flex' }}>
                        <FileBadge type={badgeType(n)} />
                      </span>
                      <span className="vrd-rt">{n.label}</span>
                      <span className="cp-tw" style={{ display: 'inline-flex' }}>
                        <Chip fixed tone={DOC_TONE[n.status]}>
                          {n.status}
                        </Chip>
                      </span>
                    </button>
                  ))}
                </section>
              ) : null}
            </aside>
          </main>
        </div>
      </div>
      {viewer ? <DocViewer docs={viewer.docs} index={viewer.i} onClose={() => setViewer(null)} onIndexChange={(i) => setViewer((v) => (v ? { ...v, i } : v))} /> : null}
    </div>
  );
}
