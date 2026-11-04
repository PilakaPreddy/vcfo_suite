'use client';

/**
 * PAN / TAN reveal — board `s/home/v7p_ids_password.dc.html` (route key
 * `ids-password`, desktop / tablet modal) and the phone bottom sheet "Show PAN"
 * from `s/home/mobile.html`.
 *
 * The client confirms with their OWN account password; the server
 * (`POST /api/client/identifiers/reveal`) checks it with bcrypt, allows 3 tries
 * then locks for 60 s, audits `identifiers.reveal` and returns the value once.
 * On success the dialog closes, toasts "PAN shown for 60 s" and publishes the
 * value for 60 s through `useRevealedIdentifier(field)` (and `onRevealed`), so
 * the Company IDs card can show it in green and re-mask it automatically.
 *
 * Usage (Home › Company IDs card):
 *   const pan = useRevealedIdentifier('pan');          // string | null
 *   {open && <IdsRevealDialog field="pan" onClose={() => setOpen(false)} />}
 *   hideRevealedIdentifier('pan');                     // mask it again now
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { usePortalOptional } from '@/components/client-portal/PortalProvider';
import { InfoPopover } from '@/components/client-portal/shared';
import { IDENTIFIER_REVEAL_MS, countdownLabel, revealUntil } from '@/lib/client-portal/identifiers';
import '../../css/credentials-ids.css';

const REVEAL_MS = IDENTIFIER_REVEAL_MS;

/* ---------- revealed values, shared with the Company IDs card ---------- */
type Revealed = Partial<Record<'pan' | 'tan', { value: string; until: number }>>;
let revealed: Revealed = {};
const listeners = new Set<() => void>();
const timers: Partial<Record<'pan' | 'tan', ReturnType<typeof setTimeout>>> = {};
function emit() {
  for (const l of listeners) l();
}
/** Show the value until the server's `expiresAt` (G-07), never longer than the window. */
function publish(field: 'pan' | 'tan', value: string, expiresAt?: string) {
  const now = Date.now();
  const until = revealUntil(expiresAt, now);
  revealed = { ...revealed, [field]: { value, until } };
  if (timers[field]) clearTimeout(timers[field]);
  timers[field] = setTimeout(() => {
    const next = { ...revealed };
    delete next[field];
    revealed = next;
    emit();
  }, until - now);
  emit();
}
/**
 * Masks a revealed PAN or TAN at once (the hide button on the Home IDs card). The reveal
 * holds no server grant: the value lives only in this store, so clearing it is enough.
 */
function hideRevealedIdentifier(field: 'pan' | 'tan'): void {
  if (!revealed[field]) return;
  if (timers[field]) clearTimeout(timers[field]);
  delete timers[field];
  const next = { ...revealed };
  delete next[field];
  revealed = next;
  emit();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
/** When the open reveal of `field` closes (ms timestamp), else null; drives the countdown. */
function useRevealedUntil(field: 'pan' | 'tan'): number | null {
  return useSyncExternalStore(
    subscribe,
    () => revealed[field]?.until ?? null,
    () => null,
  );
}

/**
 * The seconds left on an open reveal ("0:42"), ticking once a second; nothing
 * when the value is masked. The time comes from the reveal response (G-07).
 */
export function RevealCountdown({ field, className, style }: { field: 'pan' | 'tan'; className?: string; style?: CSSProperties }) {
  const until = useRevealedUntil(field);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (!until || until <= now) return null;
  const label = countdownLabel(until, now);
  const secs = Math.max(0, Math.ceil((until - now) / 1000));
  return (
    <span role="timer" aria-label={`Hides in ${secs} seconds`} className={className} style={style}>
      {label}
    </span>
  );
}

/** The clear PAN / TAN while its 60-second window is open, else null. */
export function useRevealedIdentifier(field: 'pan' | 'tan'): string | null {
  return useSyncExternalStore(
    subscribe,
    () => revealed[field]?.value ?? null,
    () => null,
  );
}

function fmtS(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const EYE_DUO = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
    <path className="duo" d="M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6Z" />
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6Z" />
  </svg>
);
const EYE_OFF = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
    <path d="M10.7 5.6A10 10 0 0 1 21.5 12a17 17 0 0 1-2.2 3.1 M6.6 6.6A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 5.4-1.6 M3 3l18 18 M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);
const ALERT = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
    <path className="duo" d="M8.3 3.5h7.4l4.8 4.8v7.4l-4.8 4.8H8.3l-4.8-4.8V8.3Z" />
    <path d="M8.3 3.5h7.4l4.8 4.8v7.4l-4.8 4.8H8.3l-4.8-4.8V8.3Z M12 8v4.6 M12 15.8v.1" />
  </svg>
);
const LOCK13 = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-2px' }}>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const S_DLG: CSSProperties = {
  width: 'min(400px,100%)',
  maxHeight: '100%',
  overflow: 'hidden',
  background: 'var(--panel)',
  borderRadius: 6,
  boxShadow: 'var(--shadow-dialog)',
  display: 'flex',
  flexDirection: 'column',
};

export function IdsRevealDialog({
  field,
  onClose,
  onRevealed,
}: {
  field: 'pan' | 'tan';
  onClose: () => void;
  /** Optional: the clear value on success (also published via useRevealedIdentifier). */
  onRevealed?: (value: string) => void;
}) {
  const portal = usePortalOptional();
  const label = field.toUpperCase();
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [phone, setPhone] = useState(false);
  const [host, setHost] = useState<Element | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const opener = useRef<Element | null>(null);
  const dlgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    setHost(document.querySelector('.cp') ?? document.body);
    const mq = window.matchMedia('(max-width: 767px)');
    setPhone(mq.matches);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    document.querySelector('.cp')?.classList.add('sheet-open');
    return () => {
      mq.removeEventListener('change', on);
      document.querySelector('.cp')?.classList.remove('sheet-open');
    };
  }, []);
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 40);
    return () => clearTimeout(t);
  }, [phone, host]);

  const close = useCallback(() => {
    onClose();
    const el = opener.current as HTMLElement | null;
    if (el?.focus) setTimeout(() => el.focus({ preventScroll: true }), 0);
  }, [onClose]);

  const locked = lockedUntil > now;
  useEffect(() => {
    if (!lockedUntil) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= lockedUntil) {
        setLockedUntil(0);
        setErr(null);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab' && dlgRef.current) {
        const f = Array.from(dlgRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),a[href]'));
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [close]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy || locked || !pw) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/client/identifiers/reveal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ field, password: pw }),
      });
      const out = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        value?: string;
        error?: string;
        triesLeft?: number;
        lockedUntil?: string;
        expiresAt?: string;
      };
      if (out.ok && out.value) {
        publish(field, out.value, out.expiresAt);
        onRevealed?.(out.value);
        const secs = Math.max(1, Math.round(((revealed[field]?.until ?? Date.now() + REVEAL_MS) - Date.now()) / 1000));
        portal?.toast(`${label} shown for ${secs} s`);
        close();
        return;
      }
      setPw('');
      if (out.error === 'locked' && out.lockedUntil) {
        setLockedUntil(new Date(out.lockedUntil).getTime());
        setNow(Date.now());
        setErr(null);
      } else if (out.error === 'wrong_password') {
        const n = out.triesLeft ?? 0;
        setErr(`Wrong password. ${n} ${n === 1 ? 'try' : 'tries'} left.`);
      } else if (out.error === 'not_recorded') {
        setErr(`Your ${label} is not recorded yet.`);
      } else {
        setErr('Could not check your password. Try again.');
      }
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch {
      setErr('Could not check your password. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!host) return null;
  const bad = Boolean(err) || locked;
  const lockBox = locked ? (
    <div className="ip-lock" role="status" aria-live="polite">
      Too many tries. Try again in <span className="mono">{fmtS(lockedUntil - now)}</span>
    </div>
  ) : null;
  const errLine = err ? (
    <div role="alert" className="ip-err">
      {ALERT}
      {err}
    </div>
  ) : null;

  const body = phone ? (
    <>
      <div className="scrim" role="presentation" onClick={close} />
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="ip-sh-t" ref={dlgRef}>
        <div className="grab">
          <i />
        </div>
        <div className="sh">
          <h3 id="ip-sh-t">Show {label}</h3>
          <button className="sx-ib edge" type="button" aria-label="Close" onClick={close}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="body">
          <form style={{ padding: '4px 14px 10px', display: 'grid', gap: 10 }} onSubmit={submit}>
            <label className="ip-lbl">
              Your password
              <span className={`sx-in ip-row${bad ? ' bad' : ''}`} style={{ height: 44, marginTop: 6 }}>
                <input
                  ref={inputRef}
                  type="password"
                  autoComplete="current-password"
                  value={pw}
                  disabled={locked}
                  onChange={(e) => setPw(e.target.value)}
                  aria-invalid={bad || undefined}
                  style={{ fontSize: 16 }}
                />
              </span>
            </label>
            {errLine}
            {lockBox}
            <span className="ip-note">{LOCK13} Shown for 60 seconds</span>
            <a href="/auth/reset-password" className="ip-forgot">
              Forgot password?
            </a>
            <button className="sx-btn p lg" type="submit" disabled={busy || locked || !pw}>
              {busy ? 'Checking…' : `Show ${label}`}
            </button>
          </form>
        </div>
      </section>
    </>
  ) : (
    <>
      <div className="ip-dim" role="presentation" onClick={close} />
      <div className="ip-wrap">
        <div role="dialog" aria-modal="true" aria-labelledby="ip-t" style={S_DLG} ref={dlgRef}>
          <div className="ip-head">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ip-eyebrow">Show {label}</div>
              <div id="ip-t" className="ip-title">
                Confirm it&apos;s you
              </div>
            </div>
            <button type="button" aria-label="Close" onClick={close} className="sx-ib sm">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <form id="ip-form" style={{ padding: '16px 20px' }} onSubmit={submit}>
            <label htmlFor="ip-pw" className="ip-lbl">
              Password
            </label>
            <div className={`sx-in ip-row${bad ? ' bad' : ''}`} style={{ marginTop: 6, paddingRight: 5 }}>
              <input
                id="ip-pw"
                ref={inputRef}
                className="ip-in"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={pw}
                disabled={locked}
                aria-invalid={bad || undefined}
                onChange={(e) => setPw(e.target.value)}
              />
              <button
                type="button"
                aria-label={show ? 'Hide password' : 'Show password'}
                aria-pressed={show}
                onClick={() => setShow((s) => !s)}
                className="sx-ib sm"
              >
                {show ? EYE_OFF : EYE_DUO}
              </button>
            </div>
            {errLine}
            {lockBox}
            <a href="/auth/reset-password" className="ip-forgot" style={{ display: 'inline-block', marginTop: 10 }}>
              Forgot password?
            </a>
          </form>
          <div className="ip-foot">
            <span className="ip-note" style={{ flex: 1, display: 'flex' }}>
              <InfoPopover askAbout={`showing the ${label}`} below={false}>
                Shown for 60 seconds
              </InfoPopover>
            </span>
            <button type="button" className="sx-btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" form="ip-form" className="sx-btn p" disabled={busy || locked || !pw}>
              {busy ? 'Checking…' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(<div className="cp-ids">{body}</div>, host);
}
