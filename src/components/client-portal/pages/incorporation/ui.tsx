'use client';

/**
 * Incorporation boards — the small pieces every page shares, ported 1:1 from
 * final-src/s/inc/*.html: icons (`ic`), status glyphs set A (`si`), owner chip
 * (`own`), status chip, mini robot (`bmini`), bot speech bubble (`botSay`), the
 * page tooltip `#ip-tt` (data-tt, 100 ms, flips below, long-press on touch),
 * the (i) pop-over `.ip-pop` and the L1 skeleton timer.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { usePortal, type WhatsThisAnswer } from '../../PortalProvider';
import { VisorHead } from '@/components/ask/Visor';
import { IC, type IcName } from './icons';
import '../../css/incorporation-pages.css';
import '../../css/incorporation-landing.css';
import '../../css/incorporation-extra.css';

/* ---------------- icons & glyphs ---------------- */

function Ic({ n, cls = 'ic', style }: { n: IcName; cls?: string; style?: CSSProperties }) {
  return (
    <svg
      className={cls}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
      dangerouslySetInnerHTML={{ __html: IC[n] }}
    />
  );
}

function Sic({ n, w }: { n: IcName; w: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: IC[n] }}
    />
  );
}

export type GlyphKind = 'done' | 'you' | 'prog' | 'with' | 'up' | 'late';

const GLY: Record<GlyphKind, ReactNode> = {
  done: <Sic n="check" w={3.6} />,
  you: <Sic n="user-round" w={3} />,
  prog: <Sic n="clock" w={2.8} />,
  with: <Sic n="trending-up" w={3} />,
  up: null,
  late: <Sic n="x" w={3.4} />,
};

/** Status glyph, set A (rule 18). `tip` makes it role=img with the rule-17 tooltip. */
function Si({ k, tip, cls, style }: { k: GlyphKind; tip?: string; cls?: string; style?: CSSProperties }) {
  return tip ? (
    <span className={`si ${k}${cls ? ` ${cls}` : ''}`} role="img" aria-label={tip} data-tt={tip} style={style}>
      {GLY[k]}
    </span>
  ) : (
    <span className={`si ${k}${cls ? ` ${cls}` : ''}`} aria-hidden="true" style={style}>
      {GLY[k]}
    </span>
  );
}

export type OwnKey = 'You' | 'SBC' | 'MCA';

function Own({ o, short }: { o: OwnKey; short: string }) {
  const L = o === 'You' ? short : o;
  return (
    <span className={`own ${o}`} role="img" aria-label={`Owner · ${L}`} data-tt={o === 'You' ? `${short} owns this step` : `${L} owns this step`}>
      {L}
    </span>
  );
}

const BOTI =
  '<rect x="15" y="2" width="2" height="5" rx="1" fill="#1e40af"/><circle cx="16" cy="3" r="2.2" fill="#2dd4bf"/><rect x="3" y="7" width="26" height="21" rx="9" fill="#2563eb"/><rect x="7" y="12" width="18" height="10" rx="5" fill="#0b1736"/><rect x="11" y="14.5" width="3" height="5" rx="1.5" fill="#7dd3fc"/><rect x="18" y="14.5" width="3" height="5" rx="1.5" fill="#7dd3fc"/>';

function Bmini({ style }: { style?: CSSProperties }) {
  return (
    <span className="bmini" aria-hidden="true" style={style}>
      <svg viewBox="0 0 32 32" aria-hidden="true" dangerouslySetInnerHTML={{ __html: BOTI }} />
    </span>
  );
}

/** Rule 16 — the robot says it (prototype `botSay`). */
function BotSay({
  text,
  btn,
  onBtn,
  aria,
}: {
  text: ReactNode;
  btn?: string;
  onBtn?: () => void;
  aria?: string;
}) {
  return (
    <div className="bot">
      <span className="bav" aria-hidden="true">
        <VisorHead />
      </span>
      <div className="bub">
        {text}
        {btn ? (
          <>
            <br />
            <button type="button" className="btn" aria-label={aria ?? btn} onClick={onBtn}>
              {btn}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- dates (prototype helpers, UTC calendar dates) ---------------- */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function pd(s: string): Date {
  const a = s.slice(0, 10).split('-');
  return new Date(Date.UTC(+a[0]!, +a[1]! - 1, +a[2]!));
}
function isoD(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addD(s: string, k: number): string {
  const d = pd(s);
  d.setUTCDate(d.getUTCDate() + k);
  return isoD(d);
}
export function fmt(s?: string): string {
  if (!s) return '—';
  const d = pd(s);
  return Number.isNaN(d.getTime()) ? '—' : `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}
export function fmtY(s?: string): string {
  return s ? `${fmt(s)} ${pd(s).getUTCFullYear()}` : '—';
}
export function fmtL(s?: string): string {
  if (!s) return '—';
  const d = pd(s);
  return `${d.getUTCDate()} ${MONL[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function fmtS(s?: string): string {
  if (!s) return '—';
  const d = pd(s);
  const m = MON[d.getUTCMonth()];
  return `${d.getUTCDate()} ${m} ${d.getUTCFullYear()}`;
}
export function wd(s: string): string {
  return DAY[pd(s).getUTCDay()]!;
}
export function days(a: string, b: string): number {
  return Math.round((pd(b).getTime() - pd(a).getTime()) / 864e5);
}
/** ISO timestamp → yyyy-mm-dd in India. */
export function istDay(v?: string | null): string | undefined {
  if (!v) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t + 330 * 60_000).toISOString().slice(0, 10);
}

export function kb(bytes?: number): string {
  if (bytes == null) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ---------------- page frame: tooltip, (i) pop-over, skeleton ---------------- */

export interface InfoSpec {
  title: string;
  text: string;
  /** What's this? answer card for "Ask VCFO about this". */
  answer?: WhatsThisAnswer;
}

interface IncFrameValue {
  openInfo: (btn: HTMLElement, spec: InfoSpec) => void;
  closeInfo: () => void;
}

const IncFrameCtx = createContext<IncFrameValue | null>(null);

function useIncFrame(): IncFrameValue {
  const v = useContext(IncFrameCtx);
  if (!v) throw new Error('useIncFrame outside IncFrame');
  return v;
}

const reduceMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export { reduceMotion };

/** (i) button (`.ibtn`, rule 7) that opens the page pop-over. */
function InfoBtn({ label, spec, style }: { label: string; spec: InfoSpec; style?: CSSProperties }) {
  const { openInfo } = useIncFrame();
  return (
    <button
      type="button"
      className="ibtn"
      aria-expanded="false"
      aria-label={label}
      data-tt={label}
      data-notip=""
      style={style}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openInfo(e.currentTarget, spec);
      }}
    >
      <Ic n="info" />
    </button>
  );
}

/**
 * The page root `.cp-incorporation` plus the board runtime: `#ip-tt`
 * tooltip for every `[data-tt]`, the `.ip-pop` (i) pop-over, and the L1
 * skeleton class (`sk`) while `pending` (shown after 150 ms, held ≥ 300 ms).
 */
export function IncFrame({ children, pending, title }: { children: ReactNode; pending: boolean; title: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ttRef = useRef<HTMLDivElement>(null);
  const { openChat } = usePortal();
  const sk = useSkeleton(pending);

  useEffect(() => {
    document.title = title;
  }, [title]);

  /* ---- tooltip (rules 14 + 17) ---- */
  useEffect(() => {
    const root = rootRef.current;
    const tt = ttRef.current;
    if (!root || !tt) return;
    let ttT: ReturnType<typeof setTimeout> | undefined;
    let lpT: ReturnType<typeof setTimeout> | undefined;
    const show = (el: Element, x?: number, y?: number) => {
      const t = el.getAttribute('data-tt');
      if (!t) return;
      tt.textContent = t;
      const r = el.getBoundingClientRect();
      const svg = el instanceof SVGElement && x != null;
      const cx = svg ? x! : r.left + r.width / 2;
      const top = svg ? y! - 10 : r.top;
      const w = tt.offsetWidth;
      const h = tt.offsetHeight;
      tt.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, cx - w / 2))}px`;
      const ty = top - h - 8;
      tt.style.top = `${ty < 4 ? (svg ? y! + 18 : r.bottom + 8) : ty}px`;
      clearTimeout(ttT);
      ttT = setTimeout(() => tt.classList.add('on'), 100);
    };
    const hide = () => {
      clearTimeout(ttT);
      tt.classList.remove('on');
    };
    const over = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tt]');
      if (el && root.contains(el)) show(el, e.clientX, e.clientY);
      else hide();
    };
    const focusIn = (e: FocusEvent) => {
      const t = e.target as Element;
      const el = t?.closest?.('[data-tt]');
      let fv = true;
      try {
        fv = t.matches(':focus-visible');
      } catch {
        /* old browsers */
      }
      if (el && fv && root.contains(el)) show(el);
    };
    const down = (e: PointerEvent) => {
      hide();
      clearTimeout(lpT);
      if (e.pointerType !== 'touch') return;
      const el = (e.target as Element | null)?.closest?.('[data-tt]');
      if (!el || !root.contains(el)) return;
      lpT = setTimeout(() => {
        show(el, e.clientX, e.clientY);
        setTimeout(hide, 1800);
      }, 450);
    };
    const up = () => clearTimeout(lpT);
    document.addEventListener('mouseover', over);
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', hide);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    return () => {
      hide();
      document.removeEventListener('mouseover', over);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('scroll', hide, true);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
    };
  }, []);

  /* ---- (i) pop-over (rule 7) ---- */
  const [pop, setPop] = useState<{ spec: InfoSpec; btn: HTMLElement } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const closeInfo = useCallback(() => {
    setPop((p) => {
      p?.btn.setAttribute('aria-expanded', 'false');
      return null;
    });
  }, []);
  const openInfo = useCallback((btn: HTMLElement, spec: InfoSpec) => {
    setPop((p) => {
      p?.btn.setAttribute('aria-expanded', 'false');
      if (p && p.btn === btn) return null;
      btn.setAttribute('aria-expanded', 'true');
      return { spec, btn };
    });
  }, []);
  useLayoutEffect(() => {
    const el = popRef.current;
    const root = rootRef.current;
    if (!pop || !el || !root) return;
    const r = pop.btn.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    const w = el.offsetWidth;
    el.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.left - 8)) - rr.left}px`;
    el.style.top = `${r.bottom + 8 - rr.top}px`;
  }, [pop]);
  useEffect(() => {
    if (!pop) return;
    const click = (e: MouseEvent) => {
      const t = e.target as Element;
      if (popRef.current?.contains(t) || pop.btn.contains(t)) return;
      closeInfo();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        const b = pop.btn;
        closeInfo();
        b.focus();
      }
    };
    const rs = () => closeInfo();
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', rs);
    return () => {
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', rs);
    };
  }, [pop, closeInfo]);

  return (
    <IncFrameCtx.Provider value={{ openInfo, closeInfo }}>
      <div className={`cp-incorporation${sk ? ' sk' : ''}`} ref={rootRef} aria-busy={sk || undefined}>
        {children}
        {pop ? (
          <div className="ip-pop" role="dialog" aria-label={`About ${pop.spec.title}`} ref={popRef}>
            <p>{pop.spec.text}</p>
            <button
              type="button"
              aria-label={`Ask VCFO: what’s this? ${pop.spec.title}`}
              onClick={() => {
                closeInfo();
                openChat(`What’s this: ${pop.spec.title}?`, pop.spec.answer);
              }}
            >
              <Bmini />
              Ask VCFO about this
            </button>
          </div>
        ) : null}
        <div id="ip-tt" role="tooltip" ref={ttRef} />
      </div>
    </IncFrameCtx.Provider>
  );
}

/** L1 skeleton: on only if still pending at 150 ms; once on, held at least 300 ms. */
function useSkeleton(pending: boolean): boolean {
  const [on, setOn] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (pending) {
      const t = setTimeout(() => {
        shownAt.current = Date.now();
        setOn(true);
      }, 150);
      return () => clearTimeout(t);
    }
    if (!on) return;
    const left = Math.max(0, 300 - (Date.now() - shownAt.current));
    const t = setTimeout(() => setOn(false), left);
    return () => clearTimeout(t);
  }, [pending, on]);
  return on;
}

/** Count-up 0 → n over 650 ms, easeOutCubic (AN-01); returns the shown value. */
function useCountUp(n: number | null, enabled: boolean): number | null {
  const [v, setV] = useState<number | null>(enabled && n != null ? 0 : n);
  const done = useRef(false);
  useEffect(() => {
    if (n == null) {
      setV(null);
      return;
    }
    if (!enabled || done.current || reduceMotion()) {
      setV(n);
      return;
    }
    done.current = true;
    let raf = 0;
    let t0 = 0;
    const f = (ts: number) => {
      if (!t0) t0 = ts;
      const k = Math.min(1, (ts - t0) / 650);
      setV(Math.round(n * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [n, enabled]);
  return v;
}
