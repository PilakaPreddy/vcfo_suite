'use client';

/**
 * Search ⌘K (VCFO Spectrum Palette, Q3): a centred 600 px Spectrum dialog on the scrim (a
 * Tailwind island with tokens, so it follows dark mode; a bottom sheet on phones). Groups in the prototype's order: steps, filings, obligations, registrations,
 * documents, pages. Regulator and Status chips under the field narrow the records; pages
 * have neither, so they hide while a chip is set. Each record row has an 8 px status square,
 * the title, grey sub text and a mono code. ↑ ↓ move, Enter opens, Esc closes.
 *
 * Data, all through the caller's own scoped reads: steps and registrations come from the
 * client-redacted step model (`usePortalIncorporation`, the same model the Incorporation and
 * Registrations pages draw); documents, filings and obligations come from
 * /api/client/portal/search (scoped repositories). Before the model loads, steps fall back to
 * the client-visible catalogue without a status.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { getActiveCatalogItems } from '@/data/checklist';
import { toneFor } from '@/components/ui/spectrum-chip';
import { hitPasses, regLabelOf, REG_LABEL, STATUS_WORDS, type SearchGroup, type SearchHit } from '@/lib/client-portal/search-hits';
import { PORTAL_ALIAS_KEYS, PORTAL_PATHS, PORTAL_TITLES, stepHref, type PortalRouteKey } from './routes';
import { useBreakpoint } from './Sidebar';
import { SHELL_PATHS } from './icons';
import { usePortalIncorporation } from './hooks';
import { useAskOptional } from '@/components/ask/ask-context';
import { stepChip } from './pages/incorporation/spectrum';
import { buildRegistrations } from './pages/registrations/model';
import { registrationHref } from './pages/registrations/parts';
import { formLabel } from '@/lib/ui/form-label';

type Hit = SearchHit & { icon?: keyof typeof SHELL_PATHS };

/** Group order (prototype Palette). */
const ORDER: SearchGroup[] = ['Steps', 'Filings', 'Obligations', 'Registrations', 'Documents', 'Pages'];
/** Records shown per group. */
const PER_GROUP = 6;

/** Phone result-row glyph per group (shell icon set). */
const GROUP_ICON: Record<SearchGroup, keyof typeof SHELL_PATHS> = {
  Pages: 'home',
  Steps: 'inc',
  Filings: 'comp',
  Obligations: 'comp',
  Registrations: 'comp',
  Documents: 'docs',
};
const PAGE_ICON: Partial<Record<PortalRouteKey, keyof typeof SHELL_PATHS>> = {
  announcements: 'updates',
  notifications: 'updates',
  incorporation: 'inc',
  'board-resolution': 'inc',
  compliances: 'comp',
  filings: 'comp',
  obligations: 'comp',
  registrations: 'comp',
  documents: 'docs',
  'knowledge-bank': 'lib',
  credentials: 'person',
  team: 'team',
  audit: 'audit',
  settings: 'gear',
};
const GROUP_SUB: Record<SearchGroup, string> = {
  Pages: 'Page',
  Steps: 'Incorporation',
  Filings: 'Filing',
  Obligations: 'Obligation',
  Registrations: 'Registration',
  Documents: 'Document',
};

const PAGE_KEYS = (Object.keys(PORTAL_PATHS) as PortalRouteKey[]).filter((k) => !PORTAL_ALIAS_KEYS.has(k));
const REG_OPTIONS = Object.values(REG_LABEL);

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <SearchBody onClose={onClose} />;
}

/** One filter chip (R-10) with its own menu inside the dialog, so the menu sits above the scrim. */
function ChipMenu({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  const [menu, setMenu] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    wrap.current?.querySelector<HTMLElement>('[role=option][aria-selected=true], [role=option]')?.focus();
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menu]);
  const close = () => {
    setMenu(false);
    btn.current?.focus();
  };
  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role=option]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const next = e.key === 'ArrowDown' ? Math.min(items.length - 1, at + 1) : Math.max(0, at - 1);
      items[next]?.focus();
    }
  };
  return (
    <span className="cp-chipw" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className={`sx-filter${value ? ' on' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={menu}
        onClick={() => setMenu((m) => !m)}
      >
        {label}
        {value ? <b>{value}</b> : null}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {value ? (
        <button type="button" className="cp-chipx" aria-label={`Clear ${label}`} onClick={() => onChange('')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      ) : null}
      {menu ? (
        <span className="cp-chipm" role="listbox" aria-label={label} tabIndex={-1} onKeyDown={onMenuKey}>
          {options.map((o) => (
            <button
              key={o}
              type="button"
              role="option"
              aria-selected={o === value}
              onClick={() => {
                onChange(o === value ? '' : o);
                close();
              }}
            >
              <span>{o}</span>
              {o === value ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : null}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}

/** The 8 px status square per status tone (R-13), tokens only. */
const SQUARE: Record<string, string> = {
  ok: 'bg-positive-mid',
  bad: 'bg-danger-mid',
  teal: 'bg-waiting-mid',
  warn: 'bg-warning-mid',
  prog: 'bg-brand',
  idle: 'bg-upcoming-mid',
  violet: 'bg-identity-mid',
};

function SearchBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [reg, setReg] = useState('');
  const [status, setStatus] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const phone = useBreakpoint() === 'phone';
  const { model } = usePortalIncorporation();
  const askOn = Boolean(useAskOptional()?.enabled);
  const term = q.trim().toLowerCase();
  const anyChip = Boolean(reg || status);
  /* phone: the search is a bottom sheet; like the prototype's sheets it sends the launcher away (sheet-open) */
  useEffect(() => {
    if (!phone) return;
    const cp = document.querySelector('.cp');
    cp?.classList.add('sheet-open');
    return () => cp?.classList.remove('sheet-open');
  }, [phone]);
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => setSel(0), [term, reg, status]);

  const browse = anyChip && term.length < 2;
  const remote = useQuery({
    queryKey: ['client-portal', 'search', browse ? '*' : term],
    queryFn: async () => {
      const qs = browse ? 'all=1' : `q=${encodeURIComponent(term)}`;
      const res = await fetch(`/api/client/portal/search?${qs}`);
      if (!res.ok) return { hits: [] as Hit[] };
      return (await res.json()) as { hits: Hit[] };
    },
    enabled: term.length >= 2 || browse,
    staleTime: 30_000,
  });

  const groups = useMemo(() => {
    const has = (...parts: Array<string | undefined>) => !term || parts.filter(Boolean).join(' ').toLowerCase().includes(term);
    const regs = buildRegistrations(model);
    const regIds = new Set(regs.map((r) => r.stepId));
    const steps: Hit[] = model.steps.length
      ? model.steps
          .filter((s) => !regIds.has(s.id))
          .map((s) => ({
            group: 'Steps' as const,
            title: `Step ${s.n} · ${s.title}`,
            meta: s.item.forms?.map(formLabel).join(' · '),
            href: stepHref(s.id),
            status: stepChip(s).label,
            code: s.item.forms?.[0],
          }))
      : getActiveCatalogItems().map((it, i) => ({
          group: 'Steps' as const,
          title: `Step ${i + 1} · ${it.title}`,
          meta: it.forms?.map(formLabel).join(' · '),
          href: stepHref(it.id),
          code: it.forms?.[0],
        }));
    const registrations: Hit[] = regs
      .filter((r) => !r.notNeeded)
      .map((r) => ({
        group: 'Registrations' as const,
        title: r.name,
        meta: r.area,
        href: registrationHref(r.id),
        reg: regLabelOf(r.area),
        status: r.status,
        code: r.number ?? undefined,
      }));
    const pages: Hit[] = PAGE_KEYS.map((k) => ({ group: 'Pages' as const, title: PORTAL_TITLES[k], href: PORTAL_PATHS[k], icon: PAGE_ICON[k] }));
    // Owner item F5: the full Ask VCFO page, first in Pages, when Ask VCFO is on.
    if (askOn) pages.unshift({ group: 'Pages' as const, title: 'Open Ask VCFO', href: '/app/client/ask' });
    const local = [...steps, ...registrations].filter((h) => has(h.title, h.meta, h.code));
    const records = term || anyChip ? [...local, ...(remote.data?.hits ?? [])] : [];
    const shown = (anyChip ? records.filter((h) => hitPasses(h, reg, status)) : records).concat(
      anyChip ? [] : pages.filter((h) => has(h.title)),
    );
    return ORDER.map((g) => ({ group: g, hits: shown.filter((h) => h.group === g).slice(0, PER_GROUP) })).filter((g) => g.hits.length);
  }, [term, anyChip, reg, status, model, remote.data, askOn]);
  const hits = useMemo(() => groups.flatMap((g) => g.hits), [groups]);

  const go = (h: Hit) => {
    onClose();
    router.push(h.href);
  };
  const onKey = (e: { key: string; preventDefault: () => void }) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(hits.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter' && hits[sel]) go(hits[sel]!);
  };

  const chips = (
    <div className="cp-search-chips">
      <ChipMenu label="Regulator" value={reg} options={REG_OPTIONS} onChange={setReg} />
      <ChipMenu label="Status" value={status} options={STATUS_WORDS} onChange={setStatus} />
      {anyChip ? (
        <button
          type="button"
          className="cp-search-clear"
          onClick={() => {
            setReg('');
            setStatus('');
            inputRef.current?.focus();
          }}
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
  const starts = groups.map((_, gi) => groups.slice(0, gi).reduce((n, g) => n + g.hits.length, 0));

  if (phone)
    /* phone: s/home/mobile.html "Search" sheet (M-25) — grab, title + close, 44 px input, icon rows with a subtitle */
    return (
      <>
        <div className="cp-ss-scrim" aria-hidden="true" onClick={onClose} />
        <div className="cp-ssheet" role="dialog" aria-modal="true" aria-labelledby="cp-ss-t">
          <div className="grab" aria-hidden="true">
            <i />
          </div>
          <div className="sh">
            <h3 id="cp-ss-t">Search</h3>
            <button type="button" className="x" aria-label="Close" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div className="in">
            <input
              ref={inputRef}
              value={q}
              placeholder="Search steps, filings, documents"
              aria-label="Search"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
            />
          </div>
          {chips}
          <div className="body" role="listbox" aria-label="Results">
            {hits.length === 0 ? <div className="none">No match</div> : null}
            {hits.map((h, i) => (
              <a
                key={`${h.group}-${h.href}-${i}`}
                href={h.href}
                className="row"
                role="option"
                aria-selected={i === sel}
                onClick={(e) => {
                  e.preventDefault();
                  go(h);
                }}
              >
                <span className="si" aria-hidden="true">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={SHELL_PATHS[h.icon ?? GROUP_ICON[h.group]]} />
                  </svg>
                </span>
                <span className="t">
                  <b>{h.title}</b>
                  <span>
                    {[GROUP_SUB[h.group], h.status, h.meta].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </>
    );
  /* Desktop: the Spectrum modal frame (a Tailwind island like pages/compliances/overlay.tsx):
     a centred 600 px dialog 12 % from the top, on the scrim, dialog shadow, tokens only, so it
     follows dark mode. */
  return (
    <div className="fixed inset-0 z-[2147482600] flex items-start justify-center px-4 pt-[12vh]" role="presentation">
      <div className="absolute inset-0 bg-scrim" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="relative flex max-h-[min(640px,calc(100vh-12vh-24px))] w-full max-w-[600px] flex-col rounded-md border-1.5 border-line bg-surface-raised text-ink shadow-dialog"
      >
        <div className="flex h-[52px] flex-none items-center gap-2.5 border-b-1.5 border-line px-4 text-ink-muted">
          <Search size={16} strokeWidth={1.6} aria-hidden />
          <input
            ref={inputRef}
            value={q}
            placeholder="Search steps, filings, documents"
            aria-label="Search"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            className="h-full min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
          />
          <Kbd>Esc</Kbd>
        </div>
        {chips}
        <div className="min-h-0 flex-1 overflow-y-auto py-1.5" role="listbox" aria-label="Results">
          {hits.length === 0 ? <p className="px-4 py-3 text-[13px] text-ink-faint">No match</p> : null}
          {groups.map((g, gi) => (
            <div key={g.group} role="group" aria-label={g.group}>
              <p className="px-4 pb-1 pt-2 text-[12px] font-medium text-ink-muted">{g.group}</p>
              {g.hits.map((h, hi) => {
                const i = starts[gi]! + hi;
                const on = i === sel;
                return (
                  <a
                    key={`${h.group}-${h.href}-${i}`}
                    href={h.href}
                    role="option"
                    aria-selected={on}
                    onMouseEnter={() => setSel(i)}
                    onClick={(e) => {
                      e.preventDefault();
                      go(h);
                    }}
                    className={cn('flex h-10 items-center gap-2.5 px-4 text-ink no-underline', on ? 'bg-brand-soft' : 'hover:bg-surface-sunken')}
                  >
                    {h.status ? <i className={cn('h-2 w-2 flex-none rounded-[2px]', SQUARE[toneFor(h.status)] ?? 'bg-upcoming-mid')} aria-hidden /> : null}
                    <span className="min-w-0 flex-1 truncate text-[13.5px]">
                      <b className="font-medium">{h.title}</b>
                      {h.meta ? <span className="ml-2 text-[12.5px] text-ink-muted">{h.meta}</span> : null}
                      {h.status ? <span className="sr-only">, {h.status}</span> : null}
                    </span>
                    {h.code ? <code className="flex-none font-mono text-[12px] text-ink-muted">{h.code}</code> : null}
                  </a>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex flex-none items-center gap-4 rounded-b-md border-t-1.5 border-line px-4 py-2.5 text-[12px] text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> Move
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>Enter</Kbd> Open
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>Esc</Kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}
