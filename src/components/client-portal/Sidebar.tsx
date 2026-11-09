'use client';

/**
 * The navy sidebar — React port of prototype shell.js, with the VCFO Spectrum pin (R-49).
 *   From 1100 px: the full 248 px sidebar, or the icon rail when the person picks it with the
 *   pin button or the "[" key (saved per browser). The rail opens the full sidebar over the
 *   page 160 ms after the pointer rests on it and closes 280 ms after it leaves.
 *   768–1099 px: always the rail (tooltips and fly-outs); the pin button hides.
 *   Phone ≤767: a drawer opened from the top bar.
 * The active pill + 3 px rail slide from where they were on the last screen
 * (sessionStorage) with the shell spring.
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Keyboard, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { openShortcuts } from '@/components/shell/ShortcutSheet';
import { Lu, ShellIcon, type LuName } from './icons';
import { usePortal } from './PortalProvider';
import { activeKeyFor, portalHref, PORTAL_TITLES, type PortalRouteKey } from './routes';
import { showsBeforeAfterSwitch, type ClientPortalContact } from '@/lib/client-portal/types';

/** The full Ask VCFO page in the client portal. */
const ASK_PAGE = '/app/client/ask';

type Bp = 'phone' | 'tablet' | 'desktop';

function bpOf(w: number): Bp {
  return w <= 767 ? 'phone' : w < 1280 ? 'tablet' : 'desktop';
}

/** R-49 pin state for the client sidebar: pinned (full) or rail, saved per browser. */
type CpSideMode = 'pinned' | 'rail';
const CP_SIDE_KEY = 'vcfo.cp.sidebar';
const CP_NARROW = 1100;
const PEEK_OPEN_MS = 160;
const PEEK_CLOSE_MS = 280;

function typingIn(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

function useCpSidebarMode() {
  const [mode, setMode] = useState<CpSideMode>('pinned');
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(CP_SIDE_KEY) === 'rail') setMode('rail');
    } catch {
      /* storage blocked: stay pinned */
    }
    const on = () => setNarrow(window.innerWidth < CP_NARROW);
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const toggle = useCallback(() => {
    setMode((m) => {
      const next: CpSideMode = m === 'pinned' ? 'rail' : 'pinned';
      try {
        window.localStorage.setItem(CP_SIDE_KEY, next);
      } catch {
        /* the choice lasts for this page only */
      }
      return next;
    });
  }, []);
  /* "[" switches pinned and rail. Not while typing, not with a modifier, not under 1100 px. */
  useEffect(() => {
    if (narrow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '[' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || typingIn(e.target)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [narrow, toggle]);
  return { mode, narrow, toggle };
}

/** R-49 pin control: in the full sidebar's head it collapses to the rail; on the rail it pins. */
function PinBtn({ rail, onToggle }: { rail?: boolean; onToggle: () => void }) {
  const label = rail ? 'Pin sidebar' : 'Collapse sidebar';
  const Icon = rail ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      className={rail ? 'vps-i vps-pin-r' : 'vps-pin'}
      aria-label={label}
      aria-keyshortcuts="["
      data-tip={`${label} ([)`}
      title={rail ? undefined : `${label} ([)`}
      onClick={onToggle}
    >
      {rail ? (
        <span className="vps-ic">
          <Icon size={20} strokeWidth={1.6} aria-hidden />
        </span>
      ) : (
        <Icon size={16} strokeWidth={1.6} aria-hidden />
      )}
    </button>
  );
}

export function useBreakpoint(): Bp {
  const [bp, setBp] = useState<Bp>('desktop');
  useEffect(() => {
    const on = () => setBp(bpOf(window.innerWidth));
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return bp;
}

export interface NavLeaf {
  k: PortalRouteKey;
  t: string;
  badge?: string;
  hot?: boolean;
}
export interface NavItem extends Partial<NavLeaf> {
  g?: string;
  t: string;
  i: LuName;
  kids?: NavLeaf[];
}

/**
 * Sidebar in priority order (K-15, rules R-32 and R-34): daily work first, then
 * dated work, messages, documents, reports and settings. While the company is
 * incorporating, Incorporation follows Home; once it is incorporated ("After"),
 * Compliances follows Home. Inside Compliances the order is Calendar, Filings
 * (R-33 puts Obligations first; the portal has no Obligations page yet).
 */
function useNav(): NavItem[] {
  const { shell, after } = usePortal();
  return portalNav({
    after,
    unread: shell?.badges.notifications ?? 0,
    inc: shell ? `${shell.badges.spiceDone}/${shell.badges.spiceTotal}` : undefined,
    docs: shell?.badges.documents ?? 0,
  });
}

/**
 * The client sidebar entries, pure so the order can be tested. R-51: the practice block
 * (Incorporation with the Landmark icon, Compliances, Registrations with BadgeCheck) is the one
 * every practice role shares; staff copy this order.
 */
export function portalNav({
  after,
  unread,
  inc,
  docs,
}: {
  after: boolean;
  unread: number;
  inc: string | undefined;
  docs: number;
}): NavItem[] {
  const incorporation: NavItem = { k: 'incorporation', t: 'Incorporation', i: 'landmark', badge: inc };
  const compliances: NavItem = {
    g: 'compliances',
    t: 'Compliances',
    i: 'calendar-check',
    kids: [
      { k: 'obligations', t: 'Obligations' },
      { k: 'compliances', t: 'Calendar' },
      { k: 'filings', t: 'Filings' },
      { k: 'budgets', t: 'Budgets' },
    ],
  };
  const registrations: NavItem = { k: 'registrations', t: 'Registrations', i: 'badge-check' };

  /*
   * Labour registers and Payroll are two rows, not one, and neither is a child of Compliances.
   *
   * That is the shape `sidebar-items.ts` already states for staff — the registers are their
   * own row after the practice block, with Payroll next — and its comment says every role
   * doing practice work gets both, clients included. The client portal had the registers
   * buried as a fourth label inside Compliances and no way to Payroll at all, although the
   * route has been there all along.
   *
   * The registers do also open as a tab inside Payroll. They keep their own row anyway: a
   * client who wants last month's muster roll is not thinking about a payroll run.
   */
  const labourRegisters: NavItem = { k: 'labour-registers', t: 'Labour registers', i: 'scroll-text' };
  const payroll: NavItem = { k: 'payroll', t: 'Payroll', i: 'wallet' };
  return [
    { k: 'home', t: 'Home', i: 'layout-dashboard' },
    ...(after ? [compliances, registrations, incorporation] : [incorporation, compliances, registrations]),
    labourRegisters,
    payroll,
    {
      g: 'updates',
      t: 'Updates',
      i: 'megaphone',
      badge: unread ? String(unread) : undefined,
      hot: unread > 0,
      kids: [
        { k: 'announcements', t: 'Announcements' },
        { k: 'notifications', t: 'Notifications', badge: unread ? String(unread) : undefined, hot: unread > 0 },
      ],
    },
    { k: 'documents', t: 'Documents', i: 'folder-open', badge: docs ? String(docs) : undefined },
    { k: 'knowledge-bank', t: 'Library', i: 'library' },
    { k: 'credentials', t: 'Credentials', i: 'key-round' },
    /* Profile opens from the account row at the foot of the sidebar, as in the prototype. */
    { k: 'audit', t: 'Audit', i: 'history' },
  ];
}

function Badge({ b, hot }: { b?: string; hot?: boolean }) {
  if (!b) return null;
  return <span className={`vps-b${hot ? ' hot' : ''}`}>{b}</span>;
}

const VERB = { wa: 'WhatsApp', call: 'Call', mail: 'Email', teams: 'Teams' } as const;
type Channel = keyof typeof VERB;

function channelsFor(p: ClientPortalContact): Channel[] {
  return p.support ? ['wa', 'mail', 'teams', 'call'] : ['wa', 'call', 'mail', 'teams'];
}

/** Real deep links: wa.me, tel:, mailto:, Teams chat. */
function contactUrl(p: ClientPortalContact, c: Channel): string | null {
  const digits = (s?: string) => (s ? s.replace(/[^\d]/g, '') : '');
  if (c === 'wa') return p.whatsappE164 ? `https://wa.me/${digits(p.whatsappE164)}` : null;
  if (c === 'call') return p.phoneE164 ? `tel:${p.phoneE164.replace(/[^\d+]/g, '')}` : null;
  if (c === 'mail') return p.email ? `mailto:${p.email}` : null;
  if (c === 'teams') return p.email ? `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(p.email)}` : null;
  return null;
}

function useContact() {
  const { toast } = usePortal();
  return useCallback(
    (p: ClientPortalContact, c: Channel) => {
      const who = p.support ? 'support' : p.name;
      const url = contactUrl(p, c);
      if (!url) {
        toast(`${VERB[c]} is not set up for ${who} yet`);
        return;
      }
      toast(`Opening ${VERB[c]} ${who}…`);
      if (url.startsWith('http')) window.open(url, '_blank', 'noopener');
      else window.location.href = url;
    },
    [toast],
  );
}

function ContactBtn({ p, c, fly }: { p: ClientPortalContact; c: Channel; fly?: boolean }) {
  const contact = useContact();
  const who = p.support ? 'support' : p.name;
  return (
    <button
      type="button"
      className={`${c}${fly ? ' vps-fi' : ''}`}
      role={fly ? 'menuitem' : undefined}
      aria-label={`${VERB[c]} ${who}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        contact(p, c);
      }}
    >
      <ShellIcon name={c} size={fly ? 16 : 14} />
      {fly ? <span className="vps-ft">{VERB[c]}</span> : null}
    </button>
  );
}

function Avatar({ p }: { p: ClientPortalContact }) {
  if (p.avatarUrl)
    return (
      <span className="vps-av" style={{ overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
      </span>
    );
  return <span className="vps-av">{p.support ? <ShellIcon name="head" size={14} /> : p.initials}</span>;
}

/** D4: false once a client's engagement has a COI date; the view is then After by itself. */
export function useShowBeforeAfter(): boolean {
  const { shell } = usePortal();
  return showsBeforeAfterSwitch(shell);
}

/** Before | After pill — horizontal in the top bar and drawer, vertical in the rail. */
export function BeforeAfterPill({ vertical }: { vertical?: boolean }) {
  const { after, setAfter } = usePortal();
  const show = useShowBeforeAfter();
  if (!show) return null;
  return (
    <div className={`vp-ba${vertical ? ' vp-ba-v' : ''}`} role="group" aria-label="Before or after incorporation" data-on={after ? 1 : 0}>
      <span className="vp-ba-th" aria-hidden="true" />
      <button type="button" data-ba="0" aria-pressed={!after} onClick={() => setAfter(false)}>
        Before
      </button>
      <button type="button" data-ba="1" aria-pressed={after} onClick={() => setAfter(true)}>
        After
      </button>
    </div>
  );
}

function readPill(mode: string): { y: number; h: number } | null {
  try {
    return JSON.parse(sessionStorage.getItem(`vcfo.pill-${mode}`) ?? 'null');
  } catch {
    return null;
  }
}

/** Active pill: slides from where it was on the last screen to the current item. */
function usePill(navRef: React.RefObject<HTMLElement | null>, mode: string, deps: unknown[]) {
  const pillRef = useRef<HTMLSpanElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  const place = useCallback(
    (animate: boolean) => {
      const nav = navRef.current;
      const pill = pillRef.current;
      const rail = railRef.current;
      if (!nav || !pill || !rail) return;
      let a = nav.querySelector<HTMLElement>('[aria-current=page]') ?? nav.querySelector<HTMLElement>('[data-cur]');
      const sub = a?.closest('.vps-sub');
      if (a && sub && !sub.classList.contains('open')) a = sub.previousElementSibling as HTMLElement | null;
      if (!a) {
        pill.style.opacity = '0';
        rail.style.opacity = '0';
        return;
      }
      const y = Math.round(a.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop);
      const h = a.offsetHeight;
      if (!animate) pill.style.transition = rail.style.transition = 'none';
      pill.style.opacity = rail.style.opacity = '1';
      pill.style.height = `${h}px`;
      pill.style.transform = `translateY(${y}px)`;
      rail.style.transform = `translateY(${y + (h - 20) / 2}px)`;
      if (!animate) {
        void pill.offsetWidth;
        pill.style.transition = rail.style.transition = '';
      }
      try {
        sessionStorage.setItem(`vcfo.pill-${mode}`, JSON.stringify({ y, h }));
      } catch {
        /* ignore */
      }
    },
    [navRef, mode],
  );
  useLayoutEffect(() => {
    const pill = pillRef.current;
    const rail = railRef.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (first.current && pill && rail) {
      first.current = false;
      const prev = readPill(mode);
      if (prev && !reduce) {
        pill.style.transition = rail.style.transition = 'none';
        pill.style.height = `${prev.h}px`;
        pill.style.transform = `translateY(${prev.y}px)`;
        rail.style.transform = `translateY(${prev.y + (prev.h - 20) / 2}px)`;
        void pill.offsetWidth;
        pill.style.transition = rail.style.transition = '';
        requestAnimationFrame(() => requestAnimationFrame(() => place(true)));
        return;
      }
      place(false);
      return;
    }
    place(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    const on = () => place(false);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [place]);
  return { pillRef, railRef, place };
}

function SidebarFull({ drawer, onPin }: { drawer?: boolean; onPin?: () => void }) {
  const pathname = usePathname();
  const act = activeKeyFor(pathname);
  const nav = useNav();
  const { shell, prefs, savePrefs, toast, go, setDrawerOpen } = usePortal();
  const showBa = useShowBeforeAfter();
  const navRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => setOpen(prefs?.navOpen ?? {}), [prefs?.navOpen]);
  const { pillRef, railRef, place } = usePill(navRef, drawer ? 'drawer' : 'full', [act, JSON.stringify(open)]);

  const isOpen = (n: NavItem) => {
    const has = n.kids?.some((c) => c.k === act) ?? false;
    return open[n.g!] === undefined ? has : open[n.g!]!;
  };
  const toggleGroup = (g: string, value: boolean) => {
    const next = { ...open, [g]: value };
    setOpen(next);
    savePrefs({ navOpen: next });
    let steps = 0;
    const follow = () => {
      place(true);
      if (++steps < 20) requestAnimationFrame(follow);
    };
    follow();
  };
  const onLeaf = (e: React.MouseEvent, k: PortalRouteKey, label: string) => {
    e.preventDefault();
    if (k === act && k !== 'home') {
      toast(`You are already on ${label}`);
      return;
    }
    go(k);
  };

  const company = shell?.companyShort ?? '';
  const team = shell?.team ?? [];
  const me = shell?.me;

  return (
    <>
      {drawer ? (
        <>
          <div className="vps-hd">
            <LogoLink />
            <button type="button" className="vps-x" aria-label="Close menu" onClick={() => setDrawerOpen(false)} data-close>
              <ShellIcon name="x" size={18} />
            </button>
          </div>
          {showBa ? (
            <div className="vp-ba-drawer">
              <BeforeAfterPill />
            </div>
          ) : null}
        </>
      ) : (
        <div className="vps-hd vps-hd-pin">
          <LogoLink />
          {onPin ? <PinBtn onToggle={onPin} /> : null}
        </div>
      )}
      <nav className="vps-nav" aria-label="Main" ref={navRef}>
        <span className="vps-pill" aria-hidden="true" ref={pillRef} />
        <span className="vps-rail" aria-hidden="true" ref={railRef} />
        {nav.map((n) => {
          if (n.kids) {
            const o = isOpen(n);
            const has = n.kids.some((c) => c.k === act);
            return (
              <Fragment key={n.g}>
                <button
                  type="button"
                  className="vps-i vps-g"
                  data-group={n.g}
                  aria-expanded={o}
                  data-holds={has ? '1' : undefined}
                  onClick={() => toggleGroup(n.g!, !o)}
                >
                  <span className="vps-ic">
                    <Lu name={n.i} />
                  </span>
                  <span className="vps-t">{n.t}</span>
                  <Badge b={n.badge} hot={n.hot} />
                  <span className="vps-cv">
                    <ShellIcon name="chev" size={14} />
                  </span>
                </button>
                <div className={`vps-sub${o ? ' open' : ''}`} data-sub={n.g}>
                  <div inert={!o ? true : undefined}>
                    {n.kids.map((c) => (
                      <a
                        key={c.k}
                        href={portalHref(c.k)}
                        className="vps-i"
                        aria-current={c.k === act ? 'page' : undefined}
                        tabIndex={o ? undefined : -1}
                        onClick={(e) => onLeaf(e, c.k, c.t)}
                      >
                        <span className="vps-t">{c.t}</span>
                        <Badge b={c.badge} hot={c.hot} />
                      </a>
                    ))}
                  </div>
                </div>
              </Fragment>
            );
          }
          return (
            <a
              key={n.k}
              href={portalHref(n.k!)}
              className="vps-i"
              aria-current={n.k === act ? 'page' : undefined}
              onClick={(e) => onLeaf(e, n.k!, n.t)}
            >
              <span className="vps-ic">
                <Lu name={n.i} />
              </span>
              <span className="vps-t">{n.t}</span>
              <Badge b={n.badge} />
            </a>
          );
        })}
      </nav>
      <div className="vps-team">
        <div className="vps-lbl">{company ? `${company}’s team` : 'Your team'}</div>
        {team.map((p) => (
          <div
            key={p.id}
            className="vps-p"
            tabIndex={drawer ? undefined : 0}
            role={drawer ? undefined : 'group'}
            aria-label={drawer ? undefined : `${p.name}, ${p.role} · contact`}
          >
            <Avatar p={p} />
            <span className="vps-nm">
              <b>{p.name}</b> <small>{drawer ? '' : '· '}{p.role}</small>
            </span>
            <span className="vps-c">
              {channelsFor(p).map((c) => (
                <ContactBtn key={c} p={p} c={c} />
              ))}
            </span>
          </div>
        ))}
      </div>
      {/* Owner decision 2 Nov 2026: the sidebar's Ask VCFO opens the full Ask VCFO page; the
         robot in the bottom-right corner (and the "/" key) opens the pop-up chat. */}
      <div className="vps-askw">
        <a
          className="vps-ask"
          href={ASK_PAGE}
          title="Open Ask VCFO"
          aria-current={pathname === ASK_PAGE ? 'page' : undefined}
          onClick={(e) => {
            e.preventDefault();
            if (drawer) setDrawerOpen(false);
            go(ASK_PAGE);
          }}
        >
          <span className="vps-ask-i" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
            </svg>
          </span>
          <span className="vps-ask-t">Ask VCFO</span>
          <kbd>/</kbd>
        </a>
      </div>
      <div className="vps-me">
        <div className="vps-mest">
          {/* F-360: the row opens Profile; the keyboard and sign-out buttons sit beside it. */}
          <a
            className="vps-mest-a"
            href={portalHref('profile')}
            title="Your profile"
            aria-current={act === 'profile' ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              if (drawer) setDrawerOpen(false);
              go('profile');
            }}
          >
            <span className="vps-a">{me?.initials ?? ''}</span>
            <span className="vps-nm">
              <b>{me?.name ?? ''}</b>
              <small>{me?.roleLabel ?? ''}</small>
            </span>
          </a>
          <button type="button" className="vps-out" aria-label="Keyboard shortcuts (?)" title="Keyboard shortcuts (?)" onClick={openShortcuts}>
            <Keyboard size={16} strokeWidth={1.6} aria-hidden />
          </button>
          <SignOutBtn />
        </div>
      </div>
    </>
  );
}

function LogoLink({ rail }: { rail?: boolean }) {
  const { go } = usePortal();
  return (
    <a
      className="vps-logo"
      href={portalHref('home')}
      aria-label="VCFO Suite · Home"
      data-tip={rail ? 'VCFO Suite · Home' : undefined}
      onClick={(e) => {
        e.preventDefault();
        go('home');
      }}
    >
      {rail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/client-portal/vcfo-mark.webp" alt="VCFO Suite" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/client-portal/vcfo-logo-on-black.webp" alt="VCFO Suite by SBC" height={34} />
      )}
    </a>
  );
}

function SignOutBtn() {
  const { toast } = usePortal();
  return (
    <button
      type="button"
      className="vps-out"
      aria-label="Sign out"
      data-tip="Sign out"
      onClick={() => {
        toast('Signing out…');
        void signOut({ callbackUrl: '/login' });
      }}
    >
      <ShellIcon name="out" size={16} />
    </button>
  );
}

/** Tablet: 72 px icon rail; groups, people and the account open a fly-out; every icon has a tooltip. */
function SidebarRail({ onPin, onPeek }: { onPin?: () => void; onPeek?: (open: boolean) => void }) {
  const pathname = usePathname();
  const act = activeKeyFor(pathname);
  const nav = useNav();
  const { shell, go, toast } = usePortal();
  const showBa = useShowBeforeAfter();
  const rootRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const { pillRef, railRef } = usePill(navRef, 'rail', [act]);
  const [fly, setFly] = useState<{ key: string; top: number; left: number } | null>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ text: string; top: number; left: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const flyBtn = useRef<HTMLElement | null>(null);

  const closeFly = useCallback((focus?: boolean) => {
    const b = flyBtn.current;
    flyBtn.current = null;
    setFly(null);
    if (focus) b?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    if (!fly || !flyRef.current || !flyBtn.current || !rootRef.current) return;
    const r = flyBtn.current.getBoundingClientRect();
    const sr = rootRef.current.getBoundingClientRect();
    const fh = flyRef.current.offsetHeight;
    const top = fly.key === 'me' ? r.bottom - fh : r.top - 6;
    const next = { left: Math.round(sr.right + 8), top: Math.round(Math.max(8, Math.min(window.innerHeight - fh - 8, top))) };
    if (next.left !== fly.left || next.top !== fly.top) setFly({ ...fly, ...next });
  }, [fly]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeFly();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && flyBtn.current) closeFly(true);
    };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [closeFly]);

  const openFly = (e: React.MouseEvent<HTMLElement>, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    const btn = e.currentTarget;
    if (flyBtn.current === btn) {
      closeFly(e.detail === 0);
      return;
    }
    setTip(null);
    flyBtn.current = btn;
    const r = btn.getBoundingClientRect();
    setFly({ key, top: r.top - 6, left: Math.round((rootRef.current?.getBoundingClientRect().right ?? 72) + 8) });
  };

  const showTip = (el: HTMLElement | null) => {
    if (!el || el === flyBtn.current || !rootRef.current) {
      setTip(null);
      return;
    }
    const text = el.getAttribute('data-tip');
    if (!text) {
      setTip(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const sr = rootRef.current.getBoundingClientRect();
    const h = tipRef.current?.offsetHeight ?? 28;
    setTip({ text, left: Math.round(sr.right + 8), top: Math.round(Math.max(4, Math.min(window.innerHeight - h - 4, r.top + r.height / 2 - h / 2))) });
  };

  const team = shell?.team ?? [];
  const me = shell?.me;
  const incBadge = shell ? `${shell.badges.spiceDone}/${shell.badges.spiceTotal}` : '';

  let flyBody: ReactNode = null;
  if (fly) {
    if (fly.key.startsWith('g:')) {
      const n = nav.find((x) => x.g === fly.key.slice(2));
      flyBody = (
        <>
          <div className="vps-fh">{n?.t}</div>
          {n?.kids?.map((c) => (
            <a
              key={c.k}
              href={portalHref(c.k)}
              className="vps-fi"
              role="menuitem"
              aria-current={c.k === act ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                closeFly();
                if (c.k === act) toast(`You are already on ${c.t}`);
                else go(c.k);
              }}
            >
              <span className="vps-ft">{c.t}</span>
              <Badge b={c.badge} hot={c.hot} />
            </a>
          ))}
        </>
      );
    } else if (fly.key.startsWith('p:')) {
      const p = team[Number(fly.key.slice(2))];
      if (p)
        flyBody = (
          <>
            <div className="vps-fh who">
              {p.name}
              <small>{p.role}</small>
            </div>
            {channelsFor(p).map((c) => (
              <ContactBtn key={c} p={p} c={c} fly />
            ))}
          </>
        );
    }
  }

  return (
    <aside
      id="vp-side"
      className="vps vps-icons"
      data-mode="rail"
      aria-label="Sidebar"
      ref={rootRef}
      onMouseOver={(e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
        if (el && !el.closest('.vps-fly')) showTip(el);
        else setTip(null);
      }}
      onMouseLeave={() => {
        setTip(null);
        onPeek?.(false);
      }}
      onMouseEnter={() => onPeek?.(true)}
      onFocus={(e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
        let fv = false;
        try {
          fv = (e.target as HTMLElement).matches(':focus-visible');
        } catch {
          /* old browsers */
        }
        if (el && fv && !el.closest('.vps-fly')) showTip(el);
      }}
      onBlur={() => setTip(null)}
      onScroll={() => {
        setTip(null);
        closeFly();
      }}
      onPointerDown={() => setTip(null)}
    >
      <LogoLink rail />
      <nav className="vps-nav" aria-label="Main" ref={navRef}>
        <span className="vps-pill" aria-hidden="true" ref={pillRef} />
        <span className="vps-rail" aria-hidden="true" ref={railRef} />
        {nav.map((n) => {
          if (n.kids) {
            const has = n.kids.some((c) => c.k === act);
            return (
              <button
                key={n.g}
                type="button"
                className="vps-i vps-g"
                aria-haspopup="true"
                aria-expanded={fly?.key === `g:${n.g}`}
                data-cur={has ? '1' : undefined}
                data-tip={`${n.t}${n.badge ? ` · ${n.badge} new` : ''}`}
                onClick={(e) => openFly(e, `g:${n.g}`)}
              >
                <span className="vps-ic">
                  <Lu name={n.i} size={20} />
                </span>
                <span className="vps-t">{n.t}</span>
                <Badge b={n.badge} hot={n.hot} />
              </button>
            );
          }
          const isInc = n.k === 'incorporation';
          return (
            <a
              key={n.k}
              href={portalHref(n.k!)}
              className="vps-i"
              aria-current={n.k === act ? 'page' : undefined}
              data-tip={`${n.t}${isInc ? ` · ${incBadge} steps to COI` : n.badge ? ` · ${n.badge}` : ''}`}
              onClick={(e) => {
                e.preventDefault();
                closeFly();
                if (n.k === act && n.k !== 'home') toast(`You are already on ${PORTAL_TITLES[n.k!]}`);
                else go(n.k!);
              }}
            >
              <span className="vps-ic">
                <Lu name={n.i} size={20} />
              </span>
              <span className="vps-t">
                {n.t}
                {isInc ? ` · ${incBadge} steps to COI` : ''}
              </span>
              {n.badge && !isInc ? <Badge b={n.badge} /> : null}
            </a>
          );
        })}
      </nav>
      {showBa ? (
        <div className="vps-bar" data-tip="Show the company before or after incorporation">
          <BeforeAfterPill vertical />
        </div>
      ) : null}
      <div className="vps-team">
        <div className="vps-lbl" aria-hidden="true">
          Team
        </div>
        {team.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className="vps-i vps-pa"
            aria-haspopup="true"
            aria-expanded={fly?.key === `p:${i}`}
            aria-label={`${p.name}, ${p.role} · contact`}
            data-tip={`${p.name} · ${p.role}`}
            onClick={(e) => openFly(e, `p:${i}`)}
          >
            <Avatar p={p} />
          </button>
        ))}
      </div>
      {onPin ? (
        <div className="vps-pinw">
          <PinBtn rail onToggle={onPin} />
        </div>
      ) : null}
      <div className="vps-me">
        <div className="vps-mest vps-mest-rail">
          <span className="vps-a" role="img" aria-label={`${me?.name ?? ''}, ${me?.roleLabel ?? ''}`} data-tip={`${me?.name ?? ''} · ${me?.roleLabel ?? ''}`}>
            {me?.initials ?? ''}
          </span>
          <SignOutBtn />
        </div>
      </div>
      <div className="vps-fly" role="menu" hidden={!fly} ref={flyRef} style={fly ? { top: fly.top, left: fly.left } : undefined}>
        {flyBody}
      </div>
      <div className={`vps-tip${tip ? ' on' : ''}`} aria-hidden="true" ref={tipRef} style={tip ? { top: tip.top, left: tip.left } : undefined}>
        {tip?.text}
      </div>
    </aside>
  );
}

/** Phone drawer (also any size via the top-bar menu button). */
function Drawer() {
  const { drawerOpen, setDrawerOpen } = usePortal();
  const ref = useRef<HTMLElement>(null);
  const last = useRef<Element | null>(null);
  useEffect(() => {
    if (drawerOpen) {
      last.current = document.activeElement;
      requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[data-close]')?.focus({ preventScroll: true }));
    } else {
      (last.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    }
  }, [drawerOpen]);
  useEffect(() => {
    if (!drawerOpen) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
      else if (e.key === 'Tab' && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(
          (x) => x.getAttribute('tabindex') !== '-1' && x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden',
        );
        if (!f.length) return;
        const first = f[0]!;
        const lastEl = f[f.length - 1]!;
        const a = document.activeElement;
        if (e.shiftKey && (a === first || !ref.current.contains(a))) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && (a === lastEl || !ref.current.contains(a))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [drawerOpen, setDrawerOpen]);
  return (
    <>
      <div id="vp-drawer-scrim" className={drawerOpen ? 'on' : undefined} role="presentation" onClick={() => setDrawerOpen(false)} />
      <aside
        id="vp-drawer"
        ref={ref}
        className={`vps${drawerOpen ? ' on' : ''}`}
        aria-label="Menu"
        role="dialog"
        aria-modal="true"
        aria-hidden={!drawerOpen}
        inert={!drawerOpen ? true : undefined}
      >
        {drawerOpen ? <SidebarFull drawer /> : null}
      </aside>
    </>
  );
}

export function PortalSidebar() {
  const bp = useBreakpoint();
  const { mode, narrow, toggle } = useCpSidebarMode();
  const phone = bp === 'phone';
  const rail = !phone && (narrow || mode === 'rail');
  const [peek, setPeek] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();

  /* The page column follows the sidebar width: 248 px pinned, the rail's width, none on phones. */
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.cp');
    if (!root) return;
    const w = phone ? '0px' : rail ? '72px' : '248px';
    root.style.setProperty('--vp-side-w', w);
    root.style.setProperty('--vps-w', w);
    root.style.setProperty('--sw', w);
  }, [phone, rail]);

  /* Hover on the rail (from 1100 px, rail picked): open the full sidebar over the page after
     160 ms, close it 280 ms after the pointer leaves. A page change closes it. */
  const peekable = rail && !narrow;
  const onPeek = useCallback(
    (open: boolean) => {
      if (timer.current) clearTimeout(timer.current);
      if (!peekable) return;
      timer.current = setTimeout(() => setPeek(open), open ? PEEK_OPEN_MS : PEEK_CLOSE_MS);
    },
    [peekable],
  );
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    setPeek(false);
  }, [pathname, peekable]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  useEffect(() => {
    if (!peek) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPeek(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [peek]);

  return (
    <>
      {phone ? null : rail ? (
        <>
          <SidebarRail onPin={narrow ? undefined : toggle} onPeek={peekable ? onPeek : undefined} />
          {peek ? (
            <aside
              className="vps vps-peek"
              data-mode="full"
              aria-label="Sidebar"
              onMouseEnter={() => onPeek(true)}
              onMouseLeave={() => onPeek(false)}
            >
              <SidebarFull onPin={toggle} />
            </aside>
          ) : null}
        </>
      ) : (
        <aside id="vp-side" className="vps" data-mode="full" aria-label="Sidebar">
          <SidebarFull onPin={narrow ? undefined : toggle} />
        </aside>
      )}
      <Drawer />
    </>
  );
}
