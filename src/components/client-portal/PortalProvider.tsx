'use client';

/**
 * Client portal runtime — the React port of prototype proto.js + shell.js glue:
 * shell data, Before / After state, theme, toast with Undo, the shared
 * drill-down pop-up (rule 14), the point tooltip, and the Ask VCFO chat switch.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  effectiveAfter,
  type ClientPortalPrefs,
  type ClientPortalPrefsPatch,
  type ClientPortalShell,
  type PortalViewState,
} from '@/lib/client-portal/types';
import { Check, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Chip, OwnerChip, type ChipTone, type Owner } from '@/components/ui/spectrum-chip';
import { StepMark, type StepState, type StepTone } from '@/components/ui/step-track';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { portalHref, type PortalRouteKey } from './routes';
import { PortalModal } from './pages/incorporation/modal';

export interface DrillTab {
  label: string;
  /** Legacy tab colour square; the Spectrum tabs do not draw it. */
  color?: string;
  /** Total behind the tab when the list is a preview. */
  n?: number;
  rows: DrillRow[];
}
/** A step row adds the ST5 mark, mono "Step n", the owner chip and a red date when late (C-138). */
export interface DrillStepMeta {
  n: number;
  state: StepState;
  tone: StepTone;
  owner?: Owner;
  ownerLabel?: string;
  late?: boolean;
}
/**
 * One drill row: the name, a mono meta (date), a soft status chip and a chevron when it opens.
 * `chipColor` is the old solid fill and is no longer drawn: the chip takes `tone`, or the tone
 * of its word (R-13).
 */
export type DrillRow = {
  title: string;
  meta?: string;
  chip?: string;
  chipColor?: string;
  tone?: ChipTone;
  step?: DrillStepMeta;
  href?: string;
  onOpen?: () => void;
};
export interface DrillConfig {
  title: string;
  sub?: string;
  tabs: DrillTab[];
  active?: number;
  link?: { lead: string; text: string; href?: string; where?: string; onClick?: () => void };
}

export type PortalToastKind = 'saved' | 'filed' | 'uploaded';
export interface ToastOptions {
  undo?: () => void;
  /** A1: the white toast with a green status tile ("Saved", "Uploaded"). Without it the toast is the dark A2 line. */
  kind?: PortalToastKind;
  /** A1: a second line under the title. */
  sub?: string;
  /** One small action, for example "View". */
  action?: { label: string; onClick: () => void };
}

/** How long a toast stays (prototype useUndoToast, 5 s). Deferred actions with Undo wait this long. */
const TOAST_MS = 5000;

interface PortalContextValue {
  shell: ClientPortalShell | undefined;
  shellLoading: boolean;
  /** Layout shown: Before (false) or After (true) incorporation. */
  after: boolean;
  setAfter: (after: boolean) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  /** Text size (Small, Default, Large): `data-text-size` on <html> and on `.cp`, kept per browser. */
  textSize: PortalTextSize;
  setTextSize: (size: PortalTextSize) => void;
  prefs: ClientPortalPrefs | undefined;
  savePrefs: (patch: ClientPortalPrefsPatch) => void;
  toast: (msg: string, opts?: ToastOptions) => void;
  drill: (cfg: DrillConfig) => void;
  tipAt: (x: number, y: number, text: string | null) => void;
  chatOpen: boolean;
  openChat: (question?: string, whatsThis?: WhatsThisAnswer) => void;
  closeChat: () => void;
  /** A question queued by openChat for the chat to send once mounted. */
  pendingQuestion: { q: string; w?: WhatsThisAnswer; n: number } | null;
  go: (key: PortalRouteKey | string) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  /** Page-set location trail after "Home" (e.g. ["Incorporation", "SPICe+ Part B", "Registered Office Address"]). */
  crumbs: string[] | null;
  setCrumbs: (trail: string[] | null) => void;
}

export type PortalTextSize = 'small' | 'default' | 'large';
export const PORTAL_TEXT_SIZES: ReadonlyArray<{ value: PortalTextSize; label: string }> = [
  { value: 'small', label: 'Small' },
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
];
const TEXT_SIZE_KEY = 'vcfo.text-size';
function readTextSize(): PortalTextSize {
  try {
    const v = localStorage.getItem(TEXT_SIZE_KEY);
    return v === 'small' || v === 'large' ? v : 'default';
  } catch {
    return 'default';
  }
}

/** What's this? answer card (owner board vs_ask). */
export interface WhatsThisAnswer {
  title: string;
  text: string;
  why?: string;
  source?: string;
  href?: string;
  goLabel?: string;
}

const PortalContext = createContext<PortalContextValue | null>(null);

export function usePortal(): PortalContextValue {
  const v = useContext(PortalContext);
  if (!v) throw new Error('usePortal must be used inside ClientPortalShell');
  return v;
}

export function usePortalOptional(): PortalContextValue | null {
  return useContext(PortalContext);
}

/** A page sets the top-bar location trail while it is mounted. */
export function usePortalCrumbs(trail: string[] | null) {
  const ctx = useContext(PortalContext);
  const key = trail ? trail.join('\u0000') : '';
  useEffect(() => {
    if (!ctx) return;
    ctx.setCrumbs(key ? key.split('\u0000') : null);
    return () => ctx.setCrumbs(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export const PORTAL_SHELL_KEY = ['client-portal', 'shell'] as const;

async function fetchShell(): Promise<ClientPortalShell> {
  const res = await fetch('/api/client/portal', { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status === 403 ? 'forbidden' : `shell ${res.status}`);
  const body = (await res.json()) as { shell: ClientPortalShell };
  return body.shell;
}

const THEME_KEY = 'vcfo.theme';

function readLocalTheme(): 'light' | 'dark' | 'system' | null {
  try {
    const v = JSON.parse(localStorage.getItem(THEME_KEY) ?? 'null');
    return v === 'dark' || v === 'system' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

export function PortalProvider({ children, rootRef }: { children: ReactNode; rootRef: React.RefObject<HTMLDivElement | null> }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: shell, isLoading } = useQuery({ queryKey: PORTAL_SHELL_KEY, queryFn: fetchShell, staleTime: 30_000, refetchInterval: 60_000 });

  const prefs = shell?.prefs;
  const savePrefs = useCallback(
    (patch: ClientPortalPrefsPatch) => {
      qc.setQueryData<ClientPortalShell>(PORTAL_SHELL_KEY, (old) =>
        old
          ? {
              ...old,
              prefs: {
                ...old.prefs,
                ...(patch.viewState ? { viewState: patch.viewState } : {}),
                ...(patch.theme ? { theme: patch.theme } : {}),
                ...(patch.navOpen ? { navOpen: patch.navOpen } : {}),
                ...(patch.docGrouping ? { docGrouping: patch.docGrouping } : {}),
                ...(patch.introSeen ? { introSeen: true } : {}),
                ...(patch.botNoteSeen ? { botNoteSeen: true } : {}),
              },
            }
          : old,
      );
      void fetch('/api/client/portal/prefs', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      }).catch(() => undefined);
    },
    [qc],
  );

  /* ---------- theme: light, dark (True black) or system; remembered ---------- */
  const [systemDark, setSystemDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const [localTheme, setLocalTheme] = useState<'light' | 'dark' | 'system' | null>(null);
  useEffect(() => setLocalTheme(readLocalTheme()), []);
  const themePref = prefs?.theme ?? localTheme ?? 'light';
  const theme: 'light' | 'dark' = themePref === 'system' ? (systemDark ? 'dark' : 'light') : themePref;
  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(THEME_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
    setLocalTheme(next);
    savePrefs({ theme: next });
  }, [theme, savePrefs]);
  useEffect(() => {
    const el = rootRef.current;
    if (el) {
      el.setAttribute('data-theme', theme);
      el.style.colorScheme = theme;
    }
  }, [theme, rootRef]);

  /* ---------- text size: the foundations' `data-text-size` on <html> scales the page (zoom);
     `.cp` carries the same attribute so portal CSS can key off it. Kept per browser. ---------- */
  const [textSize, setTextSizeState] = useState<PortalTextSize>('default');
  useEffect(() => setTextSizeState(readTextSize()), []);
  const setTextSize = useCallback((size: PortalTextSize) => {
    setTextSizeState(size);
    try {
      localStorage.setItem(TEXT_SIZE_KEY, size);
    } catch {
      /* private mode: the choice lasts for this page */
    }
  }, []);
  useEffect(() => {
    const html = document.documentElement;
    const el = rootRef.current;
    if (textSize === 'default') {
      html.removeAttribute('data-text-size');
      el?.removeAttribute('data-text-size');
    } else {
      html.setAttribute('data-text-size', textSize);
      el?.setAttribute('data-text-size', textSize);
    }
    return () => html.removeAttribute('data-text-size');
  }, [textSize, rootRef]);

  /* ---------- reduced motion: one flag on the portal root for every page's CSS ---------- */
  useEffect(() => {
    const el = rootRef.current;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => el?.setAttribute('data-reduce-motion', mq.matches ? 'true' : 'false');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [rootRef]);

  /* ---------- toast (prototype useUndoToast: one at a time, 5 s, Undo) ---------- */
  const [toastState, setToastState] = useState<(ToastOptions & { msg: string; n: number }) | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((msg: string, opts?: ToastOptions) => {
    setToastState((prev) => ({ ...opts, msg, n: (prev?.n ?? 0) + 1 }));
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastState(null), TOAST_MS);
  }, []);
  const hideToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastState(null);
  }, []);

  /* ---------- Before / After ---------- */
  const after = shell ? effectiveAfter(shell) : false;
  const setAfter = useCallback(
    (v: boolean) => {
      if (!shell) return;
      if (v === after) {
        toast(`Already showing the company ${v ? 'after' : 'before'} incorporation`);
        return;
      }
      const viewState: PortalViewState = v === shell.incorporated ? 'auto' : v ? 'after' : 'before';
      savePrefs({ viewState });
      toast(v ? 'Showing the company after incorporation' : 'Showing the company before incorporation');
    },
    [shell, after, savePrefs, toast],
  );

  /* ---------- drill-down ---------- */
  const [drillCfg, setDrillCfg] = useState<DrillConfig | null>(null);
  const drill = useCallback((cfg: DrillConfig) => setDrillCfg(cfg), []);

  /* ---------- point tooltip (vcfoTipAt) ---------- */
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const tipAt = useCallback((x: number, y: number, text: string | null) => setTip(text == null ? null : { x, y, text }), []);

  /* ---------- chat ---------- */
  const [chatOpen, setChatOpen] = useState(false);
  const [pendingQuestion, setPending] = useState<PortalContextValue['pendingQuestion']>(null);
  const openChat = useCallback((question?: string, whatsThis?: WhatsThisAnswer) => {
    setChatOpen(true);
    if (question) setPending((p) => ({ q: question, w: whatsThis, n: (p?.n ?? 0) + 1 }));
  }, []);
  const closeChat = useCallback(() => setChatOpen(false), []);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [crumbs, setCrumbs] = useState<string[] | null>(null);

  const go = useCallback(
    (key: PortalRouteKey | string) => {
      setDrawerOpen(false);
      const href = key.startsWith('/') ? key : portalHref(key as PortalRouteKey);
      router.push(href);
    },
    [router],
  );

  const value = useMemo<PortalContextValue>(
    () => ({
      shell,
      shellLoading: isLoading,
      after,
      setAfter,
      theme,
      toggleTheme,
      textSize,
      setTextSize,
      prefs,
      savePrefs,
      toast,
      drill,
      tipAt,
      chatOpen,
      openChat,
      closeChat,
      pendingQuestion,
      go,
      drawerOpen,
      setDrawerOpen,
      crumbs,
      setCrumbs,
    }),
    [shell, isLoading, after, setAfter, theme, toggleTheme, textSize, setTextSize, prefs, savePrefs, toast, drill, tipAt, chatOpen, openChat, closeChat, pendingQuestion, go, drawerOpen, crumbs],
  );

  return (
    <PortalContext.Provider value={value}>
      {children}
      <PortalToast state={toastState} onClose={hideToast} onUndone={() => toast('Undone')} />
      <PointTip tip={tip} />
      {drillCfg ? <DrillDialog cfg={drillCfg} onClose={() => setDrillCfg(null)} go={go} toast={toast} /> : null}
    </PortalContext.Provider>
  );
}

function PointTip({ tip }: { tip: { x: number; y: number; text: string } | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!tip || !ref.current) return;
    const w = ref.current.offsetWidth;
    setPos({ left: Math.max(8, Math.min(window.innerWidth - w - 8, tip.x - w / 2)), top: tip.y - 40 < 4 ? tip.y + 18 : tip.y - 40 });
  }, [tip]);
  return (
    <div ref={ref} id="vp-tip" role="tooltip" className={tip ? 'on' : undefined} style={pos ? { left: pos.left, top: pos.top } : undefined}>
      {tip?.text}
    </div>
  );
}

/**
 * A2 dark toast (one line, Undo) or A1 white toast with a status tile (`kind`), VCFO Spectrum
 * B-16. Bottom left of the page on a desk, above the phone tab bar on a phone. It sits inside
 * the portal root, so the tokens follow the portal's light or dark theme.
 */
function PortalToast({ state, onClose, onUndone }: { state: (ToastOptions & { msg: string; n: number }) | null; onClose: () => void; onUndone: () => void }) {
  if (!state) return <div id="vp-toast" role="status" aria-live="polite" className="cp-tw" />;
  const undo = state.undo
    ? () => {
        state.undo?.();
        onUndone();
      }
    : undefined;
  const place =
    'fixed bottom-[132px] left-1/2 z-[2147483001] max-w-[calc(100vw-32px)] -translate-x-1/2 md:bottom-16 md:left-[calc(var(--vp-side-w,248px)+20px)] md:translate-x-0 motion-safe:animate-in motion-safe:fade-in-0';
  const small =
    'inline-flex h-control-sm flex-none items-center rounded-md border-1.5 border-line-strong bg-surface-raised px-2.5 text-[13px] font-medium text-ink hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25';
  return (
    <div id="vp-toast" role="status" aria-live="polite" className="cp-tw" data-n={state.n}>
      {state.kind ? (
        <div key={state.n} className={cn(place, 'flex w-[380px] items-start gap-2.5 rounded-md border-1.5 border-line bg-surface-raised p-3.5 text-ink shadow-float')}>
          <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-mark bg-positive-soft text-positive" aria-hidden>
            <Check size={14} strokeWidth={1.6} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <b className="text-[14px] font-medium leading-[22px]">{state.msg}</b>
            {state.sub ? <span className="text-[13px] leading-[19px] text-ink-2">{state.sub}</span> : null}
          </span>
          {state.action ? (
            <button
              type="button"
              className={small}
              onClick={() => {
                state.action?.onClick();
                onClose();
              }}
            >
              {state.action.label}
            </button>
          ) : null}
          {undo ? (
            <button type="button" className={small} onClick={undo}>
              Undo
            </button>
          ) : null}
          <button type="button" aria-label="Dismiss" onClick={onClose} className="grid h-[30px] w-6 flex-none place-items-center rounded-mark text-ink-muted hover:bg-ink/[.06] hover:text-ink">
            <X size={14} strokeWidth={1.6} aria-hidden />
          </button>
        </div>
      ) : (
        <div key={state.n} className={cn(place, 'flex items-center gap-3 rounded-md bg-side px-4 py-2.5 text-[13.5px] text-white shadow-float')}>
          <span className="min-w-0 truncate">{state.msg}</span>
          {state.action ? (
            <button
              type="button"
              className="flex-none rounded-sm font-medium text-white underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              onClick={() => {
                state.action?.onClick();
                onClose();
              }}
            >
              {state.action.label}
            </button>
          ) : null}
          {undo ? (
            <button type="button" className="flex-none rounded-sm font-medium text-white underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60" onClick={undo}>
              Undo
            </button>
          ) : null}
          <button type="button" aria-label="Dismiss" onClick={onClose} className="grid h-6 w-6 flex-none place-items-center rounded-sm text-side-ink hover:bg-white/[.12]">
            <X size={14} strokeWidth={1.6} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

/** The tone of a row chip: its own, else the old solid fill read as a tone, else its word (R-13). */
function rowTone(r: DrillRow): ChipTone | undefined {
  if (r.tone) return r.tone;
  const c = r.chipColor ?? '';
  if (/--(ok|positive)/.test(c)) return 'ok';
  if (/--(over|danger)/.test(c)) return 'bad';
  if (/--waiting/.test(c)) return 'teal';
  if (/--(prog|brand)/.test(c)) return 'prog';
  if (/--(up|upcoming)\b|--up-|--upcoming/.test(c)) return 'idle';
  return undefined;
}

/** "Open Incorporation →" becomes "Open Incorporation ›" (prototype HeadLink). */
function linkWords(text: string): string {
  return `${text.replace(/\s*[→›]\s*$/, '')} ›`;
}

/**
 * One drill-down pop-up for every chart (rule 14, prototype DrillDialog): the Spectrum dialog,
 * blurple segmented tabs with counts, rows with the name, a mono date, a 104px soft status chip
 * and a chevron. Step rows add the ST5 mark, "Step n" and the owner chip. A phone gets a bottom
 * sheet. Rows open their page.
 */
function DrillDialog({
  cfg,
  onClose,
  go,
  toast,
}: {
  cfg: DrillConfig;
  onClose: () => void;
  go: (k: string) => void;
  toast: (m: string) => void;
}) {
  const [tab, setTab] = useState(cfg.active ?? 0);
  const t = cfg.tabs[tab] ?? cfg.tabs[0];
  const rows = t?.rows ?? [];
  const total = t?.n != null ? t.n : rows.length;
  const openLink = () => {
    onClose();
    if (cfg.link?.href) go(cfg.link.href);
    else cfg.link?.onClick?.();
  };
  const open = (r: DrillRow) => {
    onClose();
    if (r.onOpen) r.onOpen();
    else if (r.href) go(r.href);
    else toast(`Opening ${r.title}…`);
  };
  const opens = (r: DrillRow) => Boolean(r.onOpen || r.href);
  return (
    <PortalModal
      onClose={onClose}
      title={cfg.title}
      sub={cfg.sub}
      size="lg"
      flush
      footer={
        <>
          <span className="mr-auto text-[12.5px] text-ink-muted">
            {rows.length < total ? `Showing ${rows.length} of ${total}${cfg.link?.where ? ` · the full list is in ${cfg.link.where}` : ''}` : `Showing all ${total}`}
          </span>
          {cfg.link ? (
            <button type="button" onClick={openLink} className="inline-flex items-center whitespace-nowrap text-[13px] font-medium text-brand-text hover:underline">
              {linkWords(cfg.link.text)}
            </button>
          ) : null}
        </>
      }
    >
      {cfg.tabs.length > 1 || cfg.tabs[0]?.label ? (
        <div className="border-b border-line-soft px-4 py-2.5 md:px-5">
          <SpectrumTabs
            label={cfg.title}
            items={cfg.tabs.map((x, i) => ({ key: String(i), label: x.label, count: x.n != null ? x.n : x.rows.length }))}
            value={String(tab)}
            onChange={(k) => setTab(Number(k))}
          />
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div className="m-4 flex flex-col items-center gap-2.5 rounded-md border-dash-fine px-4 py-6 text-center text-[13px] text-ink-muted md:mx-5">None</div>
      ) : (
        <ul className="m-0 list-none p-0">
          {rows.map((r, i) => {
            const st = r.step;
            const inner = (
              <>
                {st ? <StepMark state={st.state} tone={st.tone} size={20} /> : null}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-baseline gap-2">
                    {st ? <span className="flex-none font-mono text-[12px] text-ink-muted">Step {st.n}</span> : null}
                    <span className="min-w-0 truncate font-medium text-ink">{r.title}</span>
                  </span>
                  {st && r.meta ? <span className={cn('truncate text-[12.5px]', st.late ? 'text-danger' : 'text-ink-muted')}>{r.meta}</span> : null}
                </span>
                {!st && r.meta ? <span className="hidden flex-none font-mono text-[12px] text-ink-muted sm:inline">{r.meta}</span> : null}
                {st?.owner ? <OwnerChip owner={st.owner} label={st.ownerLabel} className="hidden md:inline-flex" /> : null}
                {r.chip ? (
                  <>
                    <Chip tone={rowTone(r)} fixed className="hidden sm:inline-flex">
                      {r.chip}
                    </Chip>
                    <Chip tone={rowTone(r)} className="sm:hidden" note={false}>
                      {r.chip}
                    </Chip>
                  </>
                ) : null}
                {opens(r) ? <ChevronRight size={16} strokeWidth={1.6} className="flex-none text-ink-faint" aria-hidden /> : null}
              </>
            );
            const cls = 'flex w-full items-center gap-3 border-t border-line-soft px-4 py-3 text-left text-[13.5px] text-ink first:border-t-0 md:px-5';
            return (
              <li key={`${r.title}-${i}`} className="border-t border-line-soft first:border-t-0 [&>*]:border-t-0">
                {opens(r) ? (
                  <button type="button" className={cn(cls, 'hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none')} onClick={() => open(r)}>
                    {inner}
                  </button>
                ) : (
                  <div className={cls}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PortalModal>
  );
}
