'use client';

/**
 * Home pop-up boards: the step pop-up (v7p_step) and the compliance pop-up
 * (v7p_compliance). Dimmed backdrop oklch(20% .05 258 / .55), white dialog,
 * radius 12, Esc / backdrop / × close, focus returns to the opener.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { VisorHead } from '@/components/ask/Visor';
import { LinkButton } from '@/components/client-portal/LinkButton';
import { portalHref, stepHref } from '@/components/client-portal/routes';
import { extractItemResponses, getClientResponseFields } from '@/lib/checklist/checklist-responses';
import { isReviewAccepted } from '@/lib/checklist/checklist-item-review';
import type { PortalStep } from '@/lib/client-portal/step-model';
import { Ico, InfoPopover, Seg } from './ui';
import type { HomeData } from './useHome';
import {
  BUCKET_LABEL,
  BUCKET_TONE,
  bucketOf,
  dLong,
  dShort,
  days,
  fileType,
  groupOf,
  solid,
  type DocItem,
  type NeedRow,
} from './derive';

function Dialog({
  onClose,
  label,
  width,
  top,
  children,
  style,
}: {
  onClose: () => void;
  label: string;
  width: number;
  top?: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const last = document.activeElement as HTMLElement | null;
    // First focus goes to the close button, never to an (i) trigger — its
    // popover opens on focus and would cover the tabs (HM-12).
    const t = setTimeout(() => {
      const root = ref.current;
      const first = root?.querySelector<HTMLElement>('button[aria-label="Close"]') ?? root?.querySelector<HTMLElement>('button:not(.info>button),[href],input,textarea');
      first?.focus({ preventScroll: true });
    }, 30);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('.info.open')) {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input,textarea,[tabindex="0"]')];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1]!.focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0]!.focus();
        }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', key, true);
      last?.focus?.({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <div
      role="presentation"
      style={{ position: 'fixed', inset: 0, zIndex: 2147481000, background: 'oklch(20% 0.05 258 / 0.55)', display: 'flex', justifyContent: 'center', alignItems: top != null ? 'flex-start' : 'center', padding: top != null ? `${top}px 12px 12px` : 12, overflowY: 'auto' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{ width: `min(${width}px, 100%)`, display: 'flex', flexDirection: 'column', background: 'var(--panel)', borderRadius: 12, boxShadow: 'var(--shadow-float)', fontFamily: 'var(--font-sans),system-ui,sans-serif', color: 'var(--fg)', fontSize: 13, ...style }}
      >
        {children}
      </div>
    </div>
  );
}

const X = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/* ------------------------------------------------------------- step pop-up */

export type Stage = { name: string; meta: string; info: string; state: 'done' | 'now' | 'next' };

export function stagesOf(h: HomeData, s: PortalStep): Stage[] {
  const sl = s.slice;
  const submitted = Boolean(sl?.clientSubmittedAt);
  const reviewed = isReviewAccepted(sl) || s.kind === 'done';
  const started = s.kind !== 'up' && s.kind !== 'next';
  const who = s.owner === 'client' ? h.company : 'SBC';
  const out: Stage[] = [
    {
      name: 'Started',
      meta: s.windowFrom ? dShort(s.windowFrom) : started ? 'Open' : '—',
      info: started ? `This step opened${s.windowFrom ? ` on ${dLong(s.windowFrom)}` : ''}.` : 'This step opens when the step before it is done.',
      state: started ? 'done' : 'next',
    },
    {
      name: 'Submitted',
      meta: submitted ? dShort(sl?.clientSubmittedAt?.slice(0, 10)) : s.due ? `Due ${dShort(s.due)}` : '—',
      info: submitted
        ? `Submitted on ${dLong(sl?.clientSubmittedAt?.slice(0, 10))}.`
        : `Waiting for ${who}.${s.due ? ` Due ${dLong(s.due)}, ${days(h.today, s.due) >= 0 ? `in ${days(h.today, s.due)} days` : `${-days(h.today, s.due)} days late`}.` : ''}`,
      state: submitted || s.kind === 'done' ? 'done' : started ? 'now' : 'next',
    },
    {
      name: 'Reviewed',
      meta: reviewed && sl?.reviewedAt ? dShort(sl.reviewedAt.slice(0, 10)) : h.lead ?? 'Project Lead',
      info: `${h.lead ?? 'Your project lead'}, Project Lead, checks the documents.`,
      state: reviewed ? 'done' : submitted ? 'now' : 'next',
    },
    {
      name: 'Completed',
      meta: s.kind === 'done' && s.doneOn ? dShort(s.doneOn) : h.manager ?? 'Project Manager',
      info: `${h.manager ?? 'Your project manager'}, Project Manager, signs off.`,
      state: s.kind === 'done' ? 'done' : reviewed ? 'now' : 'next',
    },
  ];
  return out;
}

function StageChip({ st }: { st: Stage }) {
  const base: CSSProperties = { flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8 };
  const look: CSSProperties =
    st.state === 'done'
      ? { background: 'var(--ok-light)', color: 'var(--ok-text)', border: '1px solid oklch(56% 0.13 168 / .35)' }
      : st.state === 'now'
        ? { background: 'var(--navy)', color: '#fff', border: '1px solid var(--navy)', boxShadow: '0 0 0 4px oklch(37.9% 0.146 266 / .14)' }
        : { background: 'var(--panel)', color: 'var(--muted)', border: '1px solid var(--border)' };
  return (
    <div role="listitem" style={{ ...base, ...look }}>
      {st.state === 'done' ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
          <path d="M7 12.5l3 3 7-7" />
        </svg>
      ) : st.state === 'now' ? (
        <span className="pulse" style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--gold)' }} />
      ) : (
        <span style={{ width: 8, height: 8, borderRadius: 99, border: '1.5px solid var(--subtle)' }} />
      )}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 12.5, fontWeight: 700 }}>
          {st.name}
          <InfoPopover askAbout={st.name}>{st.info}</InfoPopover>
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: st.state === 'done' ? 'var(--ok-text)' : st.state === 'now' ? 'oklch(100% 0 0 / .72)' : 'var(--subtle)' }}>{st.meta}</div>
      </div>
    </div>
  );
}

function Connector({ a, b }: { a: Stage; b: Stage }) {
  const bg =
    a.state === 'done' && b.state === 'done'
      ? 'var(--ok)'
      : a.state === 'done' && b.state === 'now'
        ? 'linear-gradient(90deg,var(--ok),var(--navy-deep,var(--navy)))'
        : 'repeating-linear-gradient(90deg,var(--border) 0 5px,transparent 5px 9px)';
  return <span aria-hidden="true" style={{ flex: 1, minWidth: 16, height: 2, borderRadius: 2, background: bg }} />;
}

function Section({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <h3 className="lbl" style={{ margin: 0, color: 'var(--navy-ink,var(--navy))' }}>{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function StepPopup({
  h,
  step,
  onClose,
  onUpload,
  onOpenDocs,
}: {
  h: HomeData;
  step: PortalStep;
  onClose: () => void;
  onUpload: (n: NeedRow) => void;
  onOpenDocs: (docs: DocItem[], i: number) => void;
}) {
  const s = step;
  const { company, portal } = h;
  const [msg, setMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const docsQ = useQuery({
    queryKey: ['client-home', 'step-docs', h.engagementId, s.id],
    enabled: Boolean(h.engagementId),
    queryFn: async () => {
      const res = await fetch(`/api/documents?engagementId=${encodeURIComponent(h.engagementId!)}`);
      if (!res.ok) return [] as DocItem[];
      const body = (await res.json()) as { documents?: { id: string; fileName: string; contentType: string | null; sizeBytes: number | null; stepId: string | null; createdAt: string; uploadedBy: string | null }[] };
      return (body.documents ?? [])
        .filter((d) => d.stepId === s.id)
        .map<DocItem>((d) => ({ id: d.id, name: d.fileName.replace(/\.[a-z0-9]{2,5}$/i, ''), type: fileType(d.fileName, d.contentType), date: d.createdAt.slice(0, 10), from: 'firm', kind: 'doc', ref: d.id, contentType: d.contentType, sizeBytes: d.sizeBytes, stepId: d.stepId }));
    },
  });
  const docs = docsQ.data ?? [];
  const needs = h.needs.filter((n) => n.stepId === s.id && n.kind === 'upload');
  const stages = stagesOf(h, s);
  const spice = s.phaseNo <= 2;
  const eyebrow = spice ? `Step ${s.n} of ${h.model.spice.total} · Part ${s.phaseNo === 1 ? 'A' : 'B'}` : `Step ${s.n} of ${h.model.steps.length} · ${h.model.phases[s.phaseNo - 1]?.name ?? ''}`;
  const status =
    s.kind === 'done'
      ? { t: 'Completed', k: 'ok' as const }
      : s.kind === 'you'
        ? { t: `Waiting on ${company}`, k: 'due' as const }
        : s.kind === 'with'
          ? { t: s.owner === 'mca' ? 'With MCA' : 'With SBC', k: 'prog' as const }
          : s.kind === 'prog'
            ? { t: 'In progress', k: 'prog' as const }
            : { t: 'Upcoming', k: 'up' as const };
  const dueIn = s.due ? days(h.today, s.due) : null;
  const fields = getClientResponseFields(s.item).filter((f) => f.type !== 'file').slice(0, 8);
  const resp = extractItemResponses(s.item, s.slice ?? null);
  const send = async () => {
    if (!msg?.trim()) return;
    setSending(true);
    const res = await fetch('/api/client/handoff', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: msg.trim(), context: `Step ${s.n} · ${s.title}` }),
    }).catch(() => null);
    setSending(false);
    if (res?.ok) {
      setMsg(null);
      portal.toast(`Sent to ${h.lead ?? 'your project lead'}. You will get a reply by email within 1 working day.`);
    } else portal.toast('Could not send the message. Try again.');
  };
  return (
    <Dialog onClose={onClose} label={s.title} width={760} top={24}>
      <div style={{ position: 'relative', padding: '16px 20px 14px', background: 'linear-gradient(115deg,var(--navy-deep,var(--navy)),var(--navy-2-deep,var(--navy-2)) 70%,var(--navy-3-deep,var(--navy-3)))', color: '#fff', borderRadius: '12px 12px 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: '.06em', color: 'var(--gold)' }}>{eyebrow}</span>
          <button type="button" aria-label="Close" onClick={onClose} style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 6, border: 0, background: 'oklch(100% 0 0 / 0.12)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {X}
          </button>
        </div>
        <h2 className="metric" style={{ margin: '2px 0 8px', fontSize: 24, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
          {s.title}
          {s.item.description ? (
            <span style={{ color: '#fff' }}>
              <InfoPopover askAbout={s.title}>{s.item.description}</InfoPopover>
            </span>
          ) : null}
        </h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="chip" style={{ ...solid(status.k), minWidth: 116, justifyContent: 'center' }}>{status.t}</span>
          {s.due && s.kind !== 'done' && dueIn != null ? (
            <span className="chip" style={solid(dueIn < 0 || dueIn <= 3 ? 'over' : 'due')}>
              Due {dShort(s.due)} · {dueIn < 0 ? `${-dueIn} days late` : `${dueIn} days`}
            </span>
          ) : null}
          <span className="chip" style={{ background: 'oklch(100% 0 0 / 0.16)', color: '#fff' }}>Owner · {s.owner === 'client' ? company : s.owner === 'mca' ? 'MCA' : 'SBC'}</span>
        </div>
      </div>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Section title="Timeline">
          <div role="list" aria-label="Step timeline" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {stages.map((st, i) => [i > 0 ? <Connector key={`c${i}`} a={stages[i - 1]!} b={st} /> : null, <StageChip key={st.name} st={st} />])}
          </div>
        </Section>
        {needs.length ? (
          <Section title={`Needed from ${company}`} extra={<span className="chip" style={{ ...solid('due'), minWidth: 116, justifyContent: 'center' }}>{needs.length}</span>}>
            <div style={{ border: '1px solid oklch(66% 0.17 48 / 0.35)', borderRadius: 8, padding: '0 12px', background: 'var(--due-light)' }}>
              {needs.map((n, i) => (
                <div key={n.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? '1px solid oklch(66% 0.17 48 / 0.2)' : 0 }}>
                  <span className="box" style={{ borderColor: 'var(--due)' }} />
                  <span className="rt" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {n.title}
                    <InfoPopover askAbout={n.title}>
                      {[n.sub, n.askedBy ? `Asked by ${n.askedBy}` : null, n.due ? `Due ${dShort(n.due)}` : null].filter(Boolean).join(' · ')}
                    </InfoPopover>
                  </span>
                  <LinkButton
                    className="btn btn-o hover:!text-[color:var(--primary-dark)]"
                    onClick={() => onUpload(n)}
                    style={{ height: 30, minWidth: 88, justifyContent: 'center', fontSize: 12 }}
                  >
                    <Ico n="upload" size={13} />
                    Upload
                  </LinkButton>
                </div>
              ))}
            </div>
          </Section>
        ) : null}
        <Section title="Documents">
          {docs.map((d, i) => (
            // the whole row is a mouse shortcut for its own Preview button, which is the keyboard path
            <div
              key={d.id}
              role="presentation"
              title="Open preview"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button,.info')) return;
                onOpenDocs(docs, i);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--hair)', cursor: 'pointer' }}
            >
              <span className="idm" style={{ width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700, flex: 'none', background: d.type === 'PDF' ? 'var(--over-light)' : 'var(--prog-light)', color: d.type === 'PDF' ? 'var(--over-text)' : 'var(--prog-text)' }}>
                {d.type}
              </span>
              <span className="rt" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                {d.name}
                <InfoPopover askAbout={d.name}>Uploaded on {dLong(d.date)}.</InfoPopover>
              </span>
              <span className="chip" style={{ ...solid('ok'), minWidth: 116, justifyContent: 'center' }}>Uploaded</span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button type="button" aria-label="Preview" title="Preview" onClick={() => onOpenDocs(docs, i)} style={iconBtn}>
                  <Ico n="eye" size={14} sw={1.8} />
                </button>
              </span>
            </div>
          ))}
          {needs.map((n) => (
            <div key={`m-${n.key}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', background: 'var(--raised)', color: 'var(--subtle)' }}>
                <Ico n="file" size={16} />
              </span>
              <span className="rt" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                {n.title}
                <InfoPopover askAbout={n.title}>{n.sub}</InfoPopover>
              </span>
              <span className="chip" style={solid('over')}>Missing</span>
              <span style={{ width: 62 }} />
            </div>
          ))}
          {!docs.length && !needs.length ? <div className="cap" style={{ padding: '8px 0', borderTop: '1px solid var(--hair)' }}>{docsQ.isPending ? 'Loading…' : 'No documents on this step yet.'}</div> : null}
        </Section>
        {fields.length ? (
          <Section title="What was provided">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', columnGap: 20 }}>
              {fields.map((f, i) => {
                const v = resp[f.id]?.trim();
                const wide = (v?.length ?? 0) > 40 || (i === 0 && fields.length % 2 === 1);
                return (
                  <div key={f.id} style={{ ...(wide ? { gridColumn: 'span 2' } : {}), display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 0', borderTop: '1px solid var(--hair)' }}>
                    <span className="lbl" style={{ fontSize: 10 }}>{f.label}</span>
                    {v ? (
                      <span className="rt" style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{v}</span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--subtle)', fontWeight: 600 }}>
                        —<InfoPopover askAbout={f.label}>Not given yet. {company} adds this when the step is completed.</InfoPopover>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        ) : null}
        {msg != null ? (
          <Section title={`Message ${h.lead ?? 'your project lead'}`}>
            <textarea
              rows={3}
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              aria-label="Message"
              style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', font: '500 13px var(--font-sans),sans-serif', resize: 'vertical', background: 'var(--panel)', color: 'var(--fg)' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-o" onClick={() => setMsg(null)}>Cancel</button>
              <button type="button" className="btn btn-p" disabled={sending || !msg.trim()} onClick={() => void send()}>Send to lead</button>
            </div>
          </Section>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--raised)', borderRadius: '0 0 12px 12px', flexWrap: 'wrap' }}>
        <a
          className="btn btn-p"
          href={stepHref(s.id)}
          onClick={(e) => {
            e.preventDefault();
            onClose();
            portal.go(stepHref(s.id));
          }}
        >
          {s.owner === 'client' && s.kind !== 'done' ? 'Continue step' : 'Open step'} <Ico n="arrow" size={14} sw={2} />
        </a>
        <LinkButton
          className="btn btn-o hover:!text-[color:var(--primary-dark)]"
          style={{ gap: 6 }}
          onClick={() => {
            onClose();
            portal.openChat(`Tell me about ${s.title}`);
          }}
        >
          <span style={{ width: 18, height: 18, display: 'inline-flex', overflow: 'hidden' }} aria-hidden="true">
            <VisorHead style={{ width: 18, height: 22, marginTop: 1 }} />
          </span>
          Ask VCFO about this step
        </LinkButton>
        <LinkButton className="btn btn-o hover:!text-[color:var(--primary-dark)]" onClick={() => setMsg((m) => (m == null ? `About ${s.title}: ` : m))}>
          <Ico n="msg" size={14} />
          Message {h.lead?.split(' ')[0] ?? 'your lead'} (lead)
        </LinkButton>
      </div>
    </Dialog>
  );
}

const iconBtn: CSSProperties = { width: 28, height: 28, flex: 'none', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };

/* ------------------------------------------------------- compliance pop-up */

export function CompliancePopup({ h, tab: initial, onClose }: { h: HomeData; tab: number; onClose: () => void }) {
  const [tab, setTab] = useState(initial);
  const keys = ['filed', 'dueSoon', 'overdue', 'upcoming'] as const;
  const all = h.filings;
  const list = all.filter((f) => tab === 0 || bucketOf(f, h.today) === keys[tab - 1]);
  const order = { overdue: 0, dueSoon: 1, filed: 2, upcoming: 3 } as const;
  const shown = [...list].sort((a, b) => order[bucketOf(a, h.today)] - order[bucketOf(b, h.today)] || a.dueDate.localeCompare(b.dueDate)).slice(0, 10);
  const fy = h.home?.filings.fyLabel ?? '';
  return (
    <Dialog onClose={onClose} label={`Compliances · ${fy}`} width={760} style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ font: '600 15px var(--font-sans),sans-serif', color: 'var(--navy-ink,var(--navy))', display: 'flex', alignItems: 'center', gap: 4 }}>
            Compliances · {fy}
            <InfoPopover askAbout="compliances">As of {dLong(h.today)}</InfoPopover>
          </div>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div style={{ padding: '16px 18px', maxHeight: 'calc(100dvh - 200px)', overflow: 'auto' }}>
        <Seg full wrap label="Compliance status" value={tab} onChange={setTab} tabs={[{ label: 'All', cnt: all.length }, ...keys.map((k) => ({ label: BUCKET_LABEL[k], cnt: h.buckets[k] }))]} />
        <div className="vh-x" style={{ '--tmin': '560px' } as CSSProperties}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 12 }}>
            <thead>
              <tr>
                <th>Filing</th>
                <th>Period</th>
                <th>Area</th>
                <th style={{ textAlign: 'right' }}>Due / filed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((f) => {
                const b = bucketOf(f, h.today);
                return (
                  <tr key={f.id}>
                    <td className="rt" style={{ padding: '7px 8px' }}>{f.title}</td>
                    <td className="cap" style={{ padding: '7px 8px' }}>{f.periodLabel ?? f.fyLabel ?? '—'}</td>
                    <td style={{ padding: '7px 8px' }}>{groupOf(f)}</td>
                    <td className="mono" style={{ padding: '7px 8px', textAlign: 'right', fontSize: 12 }}>{b === 'filed' && f.filedOn ? `Filed ${dLong(f.filedOn)}` : dLong(f.dueDate)}</td>
                    <td style={{ padding: '7px 8px' }}>
                      <span className="chip" style={solid(BUCKET_TONE[b])}>{BUCKET_LABEL[b]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="cap" style={{ marginTop: 8 }}>{shown.length < list.length ? `Showing ${shown.length} of ${list.length} · full list in Filings` : `Showing all ${list.length}`}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--border)', background: 'var(--raised)' }}>
        <a
          className="btn btn-o"
          href={portalHref('filings')}
          onClick={(e) => {
            e.preventDefault();
            onClose();
            h.portal.go('filings');
          }}
          style={{ height: 30, padding: '0 10px', fontSize: 12 }}
        >
          Open Filings
        </a>
      </div>
    </Dialog>
  );
}
