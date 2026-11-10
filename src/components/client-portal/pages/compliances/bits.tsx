'use client';

/**
 * Compliances board atoms: icons `I`, the Spectrum status and area chips (R-13, R-43) as
 * inline Tailwind islands for the legacy board markup, the portal ↗ (rule 15), the proof
 * chip, the segmented switch (R-11), the ST5 focus track, and the page-wide [data-tip]
 * tooltip wiring (rule 14/17).
 */
import {
  useEffect,
  useRef,
  type CSSProperties,
  type RefObject,
} from 'react';
import { Paperclip } from 'lucide-react';
import { usePortal } from '../../PortalProvider';
import { Chip as SChip } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { StepMark } from '@/components/ui/step-track';
import {
  AREA_FULL,
  ST_TIP,
  type AreaCode,
  type CompStatus,
  type PortalFiling,
  type TrackNode,
} from '@/lib/client-portal/compliances';
import { AreaTag, StatusChip } from './spectrum';

/* ---------------------------------------------------------------- icons */

function sv(p: string, s = 16, w = 2, style?: CSSProperties) {
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
      dangerouslySetInnerHTML={{ __html: p }}
    />
  );
}
const P = {
  cal: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  file: '<path d="M7 3.5h7l4 4V20.5H7Z M14 3.5v4h4 M9.5 12.5h6 M9.5 16h6"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.8v.2"/>',
  chevL: '<path d="M15 6l-6 6 6 6"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 7.5v6M12 16.8v.2"/><circle cx="12" cy="12" r="9"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  down: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/>',
  ext: '<path d="M14 5h5v5M19 5l-8 8M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  clip: '<path d="M15.5 7.5 9 14a2 2 0 0 0 2.8 2.8l7-7a4 4 0 0 0-5.6-5.6l-7 7a6 6 0 0 0 8.5 8.5l5.8-5.8"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  bell: '<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4.5 1.8 6.5 1.8 6.5H4.7S6.5 14.5 6.5 10Z M10 19.5a2.2 2.2 0 0 0 4 0"/>',
};
export const I = {
  cal: (s = 16) => sv(P.cal, s),
  file: (s = 16) => sv(P.file, s),
  info: (s = 16) => sv(P.info, s),
  chevL: (s = 16) => sv(P.chevL, s),
  chevR: (s = 16) => sv(P.chevR, s),
  chevD: (s = 16) => sv(P.chevD, s),
  x: (s = 16) => sv(P.x, s),
  check: (s = 16) => sv(P.check, s, 2.6),
  alert: (s = 16) => sv(P.alert, s, 2.4),
  clock: (s = 16) => sv(P.clock, s),
  eye: (s = 16) => sv(P.eye, s),
  down: (s = 16) => sv(P.down, s),
  arrow: (s = 16) => sv(P.arrow, s),
  user: (s = 16) => sv(P.user, s),
  ext: (s = 14) => sv(P.ext, s, 2),
  clip: (s = 12) => sv(P.clip, s, 2),
  bell: (s = 16) => sv(P.bell, s),
  gear: (s = 17) => sv(P.gear, s, 2),
};

/* ------------------------------------------- status and area chips (R-13, R-43) */

/** Status chip in the six words (spectrum.tsx WORD), as an inline Tailwind island for the legacy board markup. */
export function Chip({ s }: { s: CompStatus }) {
  return (
    <span className="cp-tw inline-flex align-middle" data-tip={ST_TIP[s]}>
      <StatusChip s={s} />
    </span>
  );
}

/** Area pill (R-43). `compact` is the short tag used in the calendar rail, the day pop-over and on phones. */
export function AreaChip({ a, compact }: { a: AreaCode; compact?: boolean }) {
  return (
    <span className="cp-tw inline-flex align-middle" aria-label={AREA_FULL[a]}>
      <AreaTag a={a} compact={compact} />
    </span>
  );
}

/* ------------------------------------------------- rule 15 · ↗ and proof */

export function ProofChip({ f, onOpen }: { f: PortalFiling; onOpen: (f: PortalFiling) => void }) {
  if (!f.filedOn) return null;
  if (f.proofCount === 0)
    return (
      <span className="cp-tw inline-flex align-middle" data-tip="SBC will upload the proof">
        <SChip tone="warn" aria-label="Proof pending · SBC will upload the proof">
          Proof pending
        </SChip>
      </span>
    );
  return (
    <span className="cp-tw inline-flex align-middle">
      <button
        type="button"
        data-tip="Open proof"
        aria-label={`Open proof · ${f.name} · ${f.period}`}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(f);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        className="inline-flex h-6 items-center gap-1 rounded-md border-1.5 border-line bg-surface-raised px-2 text-[12px] font-medium text-ink-2 hover:border-brand-line hover:text-brand-text"
      >
        <Paperclip size={12} strokeWidth={1.8} aria-hidden />
        Proof
      </button>
    </span>
  );
}

/* ------------------------------------------------- segmented switch (R-11, N5) */

/**
 * The board's filter switch, drawn by the shared SpectrumTabs (a quiet track, the picked option
 * blurple with white text). The arrow keys move the pick, and picking the current option
 * again calls `same` (the "Already showing" toast).
 */
export function Seg({
  opts,
  on,
  onPick,
  counts,
  label,
  className,
  style,
  same,
}: {
  opts: string[];
  on: number;
  onPick: (i: number) => void;
  counts?: (number | null)[];
  /** Kept for callers; status colours stay out of filter switches (R-25). */
  dots?: (string | null)[];
  label?: string;
  className?: string;
  style?: CSSProperties;
  /** Clicking the already-selected tab (prototype P:288). */
  same?: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pick = (i: number) => (i === on ? same?.(i) : onPick(i));
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- arrow keys move the pick inside the tab list
    <div
      ref={ref}
      className={`cp-tw inline-flex max-w-full${className ? ` ${className}` : ''}`}
      style={style}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const n = (on + (e.key === 'ArrowRight' ? 1 : opts.length - 1)) % opts.length;
        onPick(n);
        requestAnimationFrame(() => ref.current?.querySelectorAll<HTMLElement>('[role="tab"]')[n]?.focus());
      }}
    >
      <SpectrumTabs
        label={label}
        value={String(on)}
        onChange={(k) => pick(Number(k))}
        items={opts.map((o, i) => ({ key: String(i), label: o, count: counts && counts[i] != null ? counts[i]! : undefined }))}
      />
    </div>
  );
}

/* ------------------------------------------------ flow E · focus track (ST5) */

/**
 * The four workflow steps of a filing as ST5 marks (R-22, prototype FilingTrack): 20px marks, done
 * steps a green square with a tick and their date, the live step a ring, later steps an outlined
 * square. A step that is not done says who holds it: the client in amber, SBC in blue.
 */
export function FocusTrack({ nodes }: { nodes: TrackNode[] }) {
  const total = nodes.length;
  return (
    <ol className="cp-tw grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
      {nodes.map((n, i) => {
        const now = n.st === 'cur';
        const done = n.st === 'done';
        const client = n.icon === 'file' || n.icon === 'person' || /\bapprove|send data/i.test(n.label);
        return (
          <li key={i} className="grid min-w-0 grid-cols-[20px_minmax(0,1fr)] gap-x-2" data-tip={n.tip}>
            <StepMark size={20} state={done ? 'done' : now ? 'now' : 'next'} tone={now && client ? 'teal' : 'prog'} label={now ? `Now · ${i + 1} of ${total}` : done ? 'Done' : 'Upcoming'} />
            <span className="min-w-0">
              <span className={`block truncate text-[13px] font-medium ${n.st === 'next' ? 'text-ink-muted' : 'text-ink'}`}>{n.label}</span>
              {n.sub ? <span className={`block truncate text-[12px] ${done ? 'text-ink-muted' : client ? 'text-warning' : 'text-info'}`}>{n.sub}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
/* ------------------------------------------- page-wide [data-tip] tips */

/**
 * The prototype's `.tipb`: one navy tooltip for every `[data-tip]` in the page
 * (hover after 120 ms, keyboard focus too), drawn by the portal's #vp-tip so
 * it is never clipped by the calendar's overflow.
 */
export function usePageTips(root: RefObject<HTMLElement | null>) {
  const { tipAt } = usePortal();
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cur: Element | null = null;
    const hide = () => {
      if (timer) clearTimeout(timer);
      cur = null;
      tipAt(0, 0, null);
    };
    const show = (t: Element | null) => {
      const target = t?.closest?.('[data-tip]') ?? null;
      if (!target || !el.contains(target)) return hide();
      if (target === cur) return;
      cur = target;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const r = target.getBoundingClientRect();
        tipAt(r.left + r.width / 2, r.top + 8, target.getAttribute('data-tip'));
      }, 120);
    };
    const over = (e: Event) => show(e.target as Element);
    const focus = (e: Event) => {
      if ((e.target as HTMLElement).matches?.(':focus-visible')) show(e.target as Element);
    };
    el.addEventListener('mouseover', over);
    el.addEventListener('mouseleave', hide);
    el.addEventListener('focusin', focus);
    el.addEventListener('focusout', hide);
    el.addEventListener('pointerdown', hide, true);
    window.addEventListener('scroll', hide, true);
    return () => {
      el.removeEventListener('mouseover', over);
      el.removeEventListener('mouseleave', hide);
      el.removeEventListener('focusin', focus);
      el.removeEventListener('focusout', hide);
      el.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('scroll', hide, true);
      if (timer) clearTimeout(timer);
      tipAt(0, 0, null);
    };
  }, [root, tipAt]);
}

/** Count-up 0 → n over 700 ms easeOutCubic (G-07), skipped under reduced motion. */
export function CountUp({ n, svg = false }: { n: number; svg?: boolean }) {
  const ref = useRef<HTMLSpanElement & SVGTSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = String(n);
      return;
    }
    let s: number | null = null;
    let raf = 0;
    const step = (ts: number) => {
      s = s ?? ts;
      const k = Math.min(1, (ts - s) / 700);
      el.textContent = String(Math.round(n * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [n]);
  return svg ? <tspan ref={ref}>{n}</tspan> : <span ref={ref}>{n}</span>;
}

/** Esc + outside-click close for pop-overs. */
export function useDismiss(open: boolean, ref: RefObject<HTMLElement | null>, closeFn: () => void, ignore?: (t: Element) => boolean) {
  const closeRef = useRef(closeFn);
  const ignoreRef = useRef(ignore);
  useEffect(() => {
    closeRef.current = closeFn;
    ignoreRef.current = ignore;
  });
  useEffect(() => {
    if (!open) return;
    const close = () => closeRef.current();
    const ignore = ignoreRef.current;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    const down = (e: PointerEvent) => {
      const t = e.target as Element;
      if (ref.current && !ref.current.contains(t) && !(ignore && ignore(t))) close();
    };
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', down, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', down, true);
    };
  }, [open, ref]);
}

/** Focus trap + Esc for modal dialogs; returns focus to the opener on close. */
export function useModal(ref: RefObject<HTMLElement | null>, closeFn: () => void) {
  const closeRef = useRef(closeFn);
  useEffect(() => {
    closeRef.current = closeFn;
  });
  useEffect(() => {
    const close = () => closeRef.current();
    const last = document.activeElement as HTMLElement | null;
    // focus the dialog itself (not its first button): a focused ↗ portal button
    // would open its tooltip over the title the moment the dialog appears (CP-13)
    const t = setTimeout(() => {
      const box = ref.current;
      if (!box) return;
      if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1');
      (box.querySelector<HTMLElement>('[data-autofocus]') ?? box).focus({ preventScroll: true });
    }, 30);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const f = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex="0"],input,select')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0]!;
      const lastEl = f[f.length - 1]!;
      if (document.activeElement === ref.current) {
        e.preventDefault();
        (e.shiftKey ? lastEl : first).focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', key, true);
      last?.focus?.({ preventScroll: true });
    };
  }, [ref]);
}
