'use client';

/**
 * Shared pieces of the five "team" pages (Team, Announcements, Notifications,
 * Audit, Settings): the board dialog (`.ov.tb-ov > .dlg`, bottom sheet on phones
 * for drill-downs), the segmented switch, the Spectrum card head tile, the
 * plain-edged empty state, the shared status chips inside a `.cp-tw` island and
 * small helpers. VCFO Spectrum drops the bot bubble and the (i) pop-overs
 * (R-04, R-06).
 */
import { sep } from '@/lib/date-format';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AreaPill, Chip, Tag, type ChipTone } from '@/components/ui/spectrum-chip';
import { type Regulator } from '@/lib/ui/regulator';

/* ------------------------------------------------------------------ */
/* icons (paths copied from the boards)                                 */
/* ------------------------------------------------------------------ */

export const P = {
  userPlus: 'M9 12.5a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7Z M3 20c.6-3.3 3-5 6-5s5.4 1.7 6 5 M18 8v6 M15 11h6',
  users: 'M9 12.5a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7Z M3 20c.6-3.3 3-5 6-5s5.4 1.7 6 5 M15.5 5.7a3.3 3.3 0 0 1 0 6.4',
  wa: 'M12 4a8 8 0 0 0-6.9 12L4 20l4.1-1.1A8 8 0 1 0 12 4Z M9.2 8.8c.2-.4.6-.4.9-.2l.8 1.4c.1.3 0 .6-.2.8l-.4.4c.4.9 1.2 1.7 2.1 2.1l.4-.4c.2-.2.5-.3.8-.2l1.4.8c.3.2.3.6.1.9-.5.8-1.4 1.1-2.3.7a7 7 0 0 1-3.7-3.7c-.4-.9-.1-1.8.1-2.6Z',
  waShort: 'M12 4a8 8 0 0 0-6.9 12L4 20l4.1-1.1A8 8 0 1 0 12 4Z',
  call: 'M7 4h2.2l1.3 3.6-1.8 1.2a10 10 0 0 0 6.5 6.5l1.2-1.8L20 14.8V17a2 2 0 0 1-2 2A14 14 0 0 1 5 6a2 2 0 0 1 2-2Z',
  mail: 'M5 5.5h14A1.5 1.5 0 0 1 20.5 7v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17V7A1.5 1.5 0 0 1 5 5.5Z M4.5 7.5l7.5 5.5 7.5-5.5',
  teams: 'M3.5 7h10v10h-10Z M6.5 10h4 M8.5 10v5 M16.5 9.5a2 2 0 1 0 0-4a2 2 0 1 0 0 4Z M15.5 11h5v4.5a2.5 2.5 0 0 1-5 0',
  resend: 'M4.5 12a7.5 7.5 0 0 1 13-5 M19.5 12a7.5 7.5 0 0 1-13 5 M17.5 3.5v3.5H14 M6.5 20.5V17H10',
  x: 'M6 6l12 12M18 6 6 18',
  swap: 'M4 8h13l-3.5-3.5 M20 16H7l3.5 3.5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  copy: 'M9 9h10v11H9Z M5 15V4h10',
  send: 'M4 12 20 4l-4 16-4-7Z M12 13l8-9',
  arrowR: 'M4 12h16 M14 6l6 6-6 6',
  warn: 'M12 4 21 20H3Z M12 10v4 M12 17h.01',
  bank: 'M3.5 20.5h17 M5 20.5V10 M9.5 20.5V10 M14.5 20.5V10 M19 20.5V10 M3 10h18L12 3.5Z',
  ext: 'M7 17 17 7 M9 7h8v8',
  circular: 'M7 3.5h7l4 4v13H7Z M14 3.5v4h4 M10 13h5 M10 16.5h5',
  prev: 'M15 6l-6 6 6 6',
  next: 'M9 6l6 6-6 6',
  go: 'M5 12h14 M12 5l7 7-7 7',
  bell: 'M10.268 21a2 2 0 0 0 3.464 0 M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326',
  search: 'M11 4.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13Z M16 16l4 4',
  download: 'M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15 M12 4.5V15 M7.8 10.8 12 15l4.2-4.2',
  chevron: 'M6 9l6 6 6-6',
  check: 'M5 12.5 10 17.5 19 7',
  clock: 'M12 4.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15Z M12 8v4.2l2.8 1.8',
  grid: 'M4 4h7v7H4Z M13 4h7v7h-7Z M4 13h7v7H4Z M13 13h7v7h-7Z',
  landmark: 'M3.5 20.5h17 M5 20.5V10 M9.5 20.5V10 M14.5 20.5V10 M19 20.5V10 M3 10h18L12 3.5Z',
};

export function Svg({
  d,
  size = 15,
  sw = 2,
  style,
  join = true,
}: {
  d: string;
  size?: number;
  sw?: number;
  style?: CSSProperties;
  join?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin={join ? 'round' : undefined}
      aria-hidden="true"
      style={style}
    >
      <path d={d} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* helpers                                                              */
/* ------------------------------------------------------------------ */

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '')).toUpperCase();
}

/**
 * Stable avatar tint per person (prototype `Avatar`, R-44): a soft token fill with
 * coloured initials, so both themes flip with the tokens.
 */
const AV: Array<[string, string]> = [
  ['--brand-soft', '--brand-text'],
  ['--info-soft', '--info'],
  ['--identity-soft', '--identity'],
  ['--waiting-soft', '--waiting'],
  ['--warning-soft', '--warning'],
  ['--positive-soft', '--positive'],
  ['--upcoming-soft', '--upcoming'],
];
export function avatarTint(seed: string): CSSProperties {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const [bg, fg] = AV[h % AV.length];
  return { background: `oklch(var(${bg}))`, color: `oklch(var(${fg}))` };
}
/** The signed-in person's own avatar: blurple soft fill, blurple initials. */
export const SELF_TINT: CSSProperties = { background: 'oklch(var(--brand-soft))', color: 'oklch(var(--brand-text))' };

const IST = 'Asia/Kolkata';
export function dayMonth(iso: string): { d: string; m: string } {
  const dt = new Date(iso);
  return {
    d: sep(dt.toLocaleDateString('en-GB', { day: 'numeric', timeZone: IST })),
    m: sep(dt.toLocaleDateString('en-GB', { month: 'short', timeZone: IST })),
  };
}
export function shortDate(iso: string): string {
  return sep(new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: IST }));
}

export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

/** Rule 12 / DECISIONS "Loading": skeleton after 150 ms, held at least 300 ms. */
export function useSkeleton(loading: boolean): boolean {
  const [show, setShow] = useState(false);
  const since = useRef(0);
  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => {
        since.current = Date.now();
        setShow(true);
      }, 150);
      return () => clearTimeout(t);
    }
    if (!show) return;
    const left = Math.max(0, 300 - (Date.now() - since.current));
    const t = setTimeout(() => setShow(false), left);
    return () => clearTimeout(t);
  }, [loading, show]);
  return show;
}

/**
 * Grey shapes for 300 ms after a filter switch (the prototype's `CardBody`), so a switch
 * reads as a fresh load. `flash()` starts it; reduced motion skips it.
 */
export function useTabFlash(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  const flash = () => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    clearTimeout(t.current);
    setOn(true);
    t.current = setTimeout(() => setOn(false), 300);
  };
  return [on, flash];
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { 'content-type': 'application/json', ...(init?.headers ?? {}) } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/** C-899: a set-password link token (32 random bytes, URL-safe); the server keeps only its hash. */
export function makeSetPasswordToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The set-password page for a token. */
export function setPasswordLink(token: string): string {
  return `${window.location.origin}/set-password/${encodeURIComponent(token)}`;
}

/** A one-off temporary password: the account's first password until the invitee sets their own. */
export function makeTempPassword(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const a = 'abcdefghijkmnpqrstuvwxyz';
  const n = '23456789';
  const s = '#@!$%';
  const rnd = new Uint32Array(10);
  crypto.getRandomValues(rnd);
  const pick = (set: string, i: number) => set[rnd[i] % set.length];
  return `${pick(A, 0)}${pick(a, 1)}${pick(a, 2)}${pick(a, 3)}${pick(s, 4)}${pick(n, 5)}${pick(n, 6)}${pick(n, 7)}${pick(A, 8)}${pick(a, 9)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* sliding pill (.seg)                                                  */
/* ------------------------------------------------------------------ */

export function Seg({
  tabs,
  active,
  onPick,
  label,
  grid = true,
  style,
  btnStyle,
  wrap = true,
  md = false,
}: {
  tabs: Array<{ label: string; cnt?: number | string }>;
  active: number;
  onPick: (i: number) => void;
  label?: string;
  grid?: boolean;
  style?: CSSProperties;
  btnStyle?: CSSProperties;
  wrap?: boolean;
  /** The prototype's `size="md"` switch: 28 px buttons instead of 22 px. */
  md?: boolean;
}) {
  const n = tabs.length;
  const seg = (
    <div
      className={md ? 'seg md' : 'seg'}
      role="tablist"
      aria-label={label}
      style={{ ...(grid ? { gridTemplateColumns: `repeat(${n},minmax(0,1fr))` } : {}), ...style }}
    >
      <span className="thumb" style={{ width: `calc((100% - 4px)/${n})`, transform: `translateX(${active * 100}%)` }} />
      {tabs.map((t, i) => (
        <button
          key={t.label}
          type="button"
          role="tab"
          aria-selected={i === active}
          className={i === active ? 'on' : ''}
          style={btnStyle}
          onClick={() => onPick(i)}
        >
          {t.label}
          {t.cnt !== undefined ? <span className="cnt">{t.cnt}</span> : null}
        </button>
      ))}
    </div>
  );
  return wrap ? <div className="tb-segx">{seg}</div> : seg;
}

/* ------------------------------------------------------------------ */
/* Spectrum parts                                                       */
/* ------------------------------------------------------------------ */

export type TileTone = 'amber' | 'green' | 'teal' | 'blue' | 'violet' | 'red' | 'brand';

/** R-16: the 28 px tinted icon tile before a card title. */
export function Tile({ d, tone = 'brand', sw = 1.8, big = false }: { d: string; tone?: TileTone; sw?: number; big?: boolean }) {
  return (
    <span className={big ? 'sx-tile tb-t30' : 'sx-tile'} data-tone={tone === 'brand' ? undefined : tone} aria-hidden="true">
      <Svg d={d} size={big ? 16 : 15} sw={sw} />
    </span>
  );
}

/** R-15, R-16: a white card head, 52 px, with the icon tile, the title and the actions on the right. */
export function CardHead({
  d,
  tone,
  title,
  id,
  meta,
  children,
}: {
  d: string;
  tone?: TileTone;
  title: ReactNode;
  id?: string;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="sx-head">
      <Tile d={d} tone={tone} />
      <h2 id={id} className="sx-title">
        {title}
      </h2>
      {meta ? <span className="sx-meta">{meta}</span> : null}
      {children ? <div className="sx-right">{children}</div> : null}
    </div>
  );
}

/** R-48: an empty state is a plain-edged area with the action. */
export function Empty({ children, action, role }: { children: ReactNode; action?: ReactNode; role?: string }) {
  return (
    <div className="sx-empty" role={role ?? 'status'}>
      <span>{children}</span>
      {action ? <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>{action}</span> : null}
    </div>
  );
}

/** R-13: the shared status chip, drawn inside a Tailwind island. */
export function SChip({ tone, children, fixed = true, dot = true }: { tone?: ChipTone; children: string; fixed?: boolean; dot?: boolean }) {
  return (
    <span className="cp-tw" style={{ display: 'inline-flex', flex: 'none' }}>
      <Chip tone={tone} fixed={fixed} dot={dot}>
        {children}
      </Chip>
    </span>
  );
}

/** A soft tag without a dot (a regulator word becomes an area pill, R-43). */
export function STag({ tone, children }: { tone?: ChipTone; children: string }) {
  return (
    <span className="cp-tw" style={{ display: 'inline-flex', flex: 'none' }}>
      <Tag tone={tone}>{children}</Tag>
    </span>
  );
}

/** R-43: an area pill (104 px, square swatch, ink text). */
export function SArea({ area, reg }: { area: string; reg?: Regulator }) {
  return (
    <span className="cp-tw" style={{ display: 'inline-flex', flex: 'none' }}>
      <AreaPill area={area} reg={reg} />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* dialog: `.ov.tb-ov(.tb-top) > .dlg`                                  */
/* ------------------------------------------------------------------ */

/** Mount pop-ups at the portal root (outside animated/transformed ancestors), keeping the page scope. */
function TPortal({ children, tp }: { children: ReactNode; tp?: string }) {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => setHost(document.querySelector('.cp')), []);
  if (!host) return null;
  return createPortal(
    <div className="cp-team">
      <div className={tp}>{children}</div>
    </div>,
    host,
  );
}

export function Dialog({
  labelledBy,
  width = 460,
  top = false,
  sheet = false,
  onClose,
  children,
  dlgStyle,
  tp,
}: {
  tp?: string;
  labelledBy: string;
  width?: number;
  /** `.tb-top`: aligned to the top on desktop (drill-downs, detail). */
  top?: boolean;
  /** Phone: bottom sheet (DECISIONS "Mobile drill-downs"). */
  sheet?: boolean;
  onClose: () => void;
  children: ReactNode;
  dlgStyle?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const last = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('input,button:not([aria-label="Close"]),[href]');
      (el ?? ref.current)?.focus({ preventScroll: true });
    }, 30);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        const first = f[0];
        const lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', key, true);
      last?.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <TPortal tp={tp}>
      <div
        className={`ov tb-ov${top ? ' tb-top' : ''}${sheet ? ' tb-sheet' : ''}`}
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={ref}
          tabIndex={-1}
          className="dlg tb-dlgin"
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          style={{ width, ...dlgStyle }}
        >
          {children}
        </div>
      </div>
    </TPortal>
  );
}

/**
 * The prototype's right-side detail panel (SidePanel, 440 px): the scrim, a head with an
 * eyebrow, the title and chips under it, a scrolling body of `PanelSection`s and a footer
 * with the main action. Full width on phones. Esc, the scrim and the close button close it.
 */
export function SidePanel({
  labelledBy,
  title,
  eyebrow,
  sub,
  footer,
  onClose,
  children,
  tp,
  width = 440,
}: {
  labelledBy: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  sub?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  tp?: string;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const last = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => ref.current?.focus({ preventScroll: true }), 30);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        const first = f[0];
        const lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', key, true);
      last?.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <TPortal tp={tp}>
      <div
        className="tb-sp-scrim"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div ref={ref} tabIndex={-1} className="tb-sp" role="dialog" aria-modal="true" aria-labelledby={labelledBy} style={{ maxWidth: width }}>
          <header className="tb-sp-h">
            <div style={{ minWidth: 0, flex: 1 }}>
              {eyebrow ? <div className="tb-sp-eb">{eyebrow}</div> : null}
              <h2 id={labelledBy} className="tb-sp-t">
                {title}
              </h2>
              {sub ? <div className="tb-sp-sub">{sub}</div> : null}
            </div>
            <button type="button" className="ibtn ghost" aria-label="Close" onClick={onClose}>
              <Svg d={P.x} size={16} join={false} />
            </button>
          </header>
          <div className="tb-sp-b">{children}</div>
          {footer ? <footer className="tb-sp-f">{footer}</footer> : null}
        </div>
      </div>
    </TPortal>
  );
}

/** A titled block inside a SidePanel, with a hairline under it. */
export function PanelSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="tb-sp-sec">
      {title ? <h3 className="lbl tb-sp-st">{title}</h3> : null}
      {children}
    </div>
  );
}

/** Label and value pairs in one or two columns (the prototype's KeyValue). */
export function KeyValue({ rows, cols = 2 }: { rows: Array<{ k: string; v: ReactNode }>; cols?: 1 | 2 }) {
  return (
    <dl className={`tb-kv${cols === 1 ? ' one' : ''}`}>
      {rows.map((r) => (
        <div key={r.k} style={{ minWidth: 0 }}>
          <dt>{r.k}</dt>
          <dd>{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A 30 px native select in a card head (the prototype's `Select` filters). */
export function HeadSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <span className="tb-sel">
      <select className="inp" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Svg d={P.chevron} size={14} join={false} />
    </span>
  );
}

/**
 * The grid footer (prototype DataGrid): "1–10 of N", any extra buttons, and page
 * numbers with previous and next when there is more than one page.
 */
export function Pager({
  total,
  page,
  pageSize,
  setPage,
  children,
}: {
  total: number;
  page: number;
  pageSize: number;
  setPage: (p: number) => void;
  children?: ReactNode;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(Math.max(1, page), pages);
  const nums = Array.from({ length: pages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === pages || Math.abs(p - cur) <= 1)
    .reduce<Array<number | '…'>>((acc, p, i, arr) => {
      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('…');
      acc.push(p);
      return acc;
    }, []);
  return (
    <footer className="tb-pager">
      <span>{total === 0 ? '0' : `${(cur - 1) * pageSize + 1}–${Math.min(total, cur * pageSize)}`} of {total}</span>
      {children}
      {pages > 1 ? (
        <nav className="tb-pages" aria-label="Pages">
          <button type="button" className="tb-pg" disabled={cur === 1} aria-label="Previous page" onClick={() => setPage(cur - 1)}>
            <Svg d={P.prev} size={14} sw={1.8} />
          </button>
          {nums.map((p, i) =>
            p === '…' ? (
              <span key={`e${i}`} style={{ padding: '0 4px' }}>
                …
              </span>
            ) : (
              <button key={p} type="button" className="tb-pg n" aria-current={p === cur ? 'page' : undefined} onClick={() => setPage(p)}>
                {p}
              </button>
            ),
          )}
          <button type="button" className="tb-pg" disabled={cur === pages} aria-label="Next page" onClick={() => setPage(cur + 1)}>
            <Svg d={P.next} size={14} sw={1.8} />
          </button>
        </nav>
      ) : null}
    </footer>
  );
}

export function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="ibtn ghost" aria-label="Close" style={{ marginLeft: 'auto' }} onClick={onClick}>
      <Svg d={P.x} size={16} join={false} />
    </button>
  );
}

/** "Show in the list ↓": close, then after 60 ms smooth-scroll (NR:275, UR:258). */
export function useScrollAfterClose() {
  return useCallback((y: number) => {
    setTimeout(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    }, 60);
  }, []);
}

/** Real contact deep links (TM-05). */
export function contactHref(kind: 'wa' | 'call' | 'email' | 'teams', c: { email?: string; phoneE164?: string; whatsappE164?: string }): string | null {
  const digits = (v?: string) => (v ?? '').replace(/[^\d]/g, '');
  if (kind === 'wa') return digits(c.whatsappE164 ?? c.phoneE164) ? `https://wa.me/${digits(c.whatsappE164 ?? c.phoneE164)}` : null;
  if (kind === 'call') return c.phoneE164 ? `tel:${c.phoneE164.replace(/\s+/g, '')}` : null;
  if (kind === 'email') return c.email ? `mailto:${c.email}` : null;
  return c.email ? `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(c.email)}` : null;
}

/** "+91 90597 90014" from "+919059790014". */
export function prettyPhone(e164?: string | null): string {
  if (!e164) return '';
  const m = e164.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}
