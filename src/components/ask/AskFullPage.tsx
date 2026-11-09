'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, Search, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useAskSuggestions } from '@/hooks/ask/use-ask-suggestions';
import { HISTORY_GROUPS, historyGroup, type HistoryGroup } from '@/lib/ask/history-group';
import { cn } from '@/lib/utils';
import { AskComposer } from './AskComposer';
import { useAskOptional, type AskHistoryEntry } from './ask-context';
import { AskThread } from './AskThread';
import { VisorBadge, VisorHead } from './Visor';
import './ask-avatar.css';

const ghost =
  'inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-ink-2 hover:bg-ink/[.06] hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25';

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** The past chats, filtered by `term` and grouped by date, newest first. */
function groupHistory(history: AskHistoryEntry[], term: string) {
  const t = term.trim().toLowerCase();
  const out = new Map<HistoryGroup, AskHistoryEntry[]>();
  for (const h of history) {
    if (t && !h.title.toLowerCase().includes(t)) continue;
    const g = historyGroup(h.at);
    out.set(g, [...(out.get(g) ?? []), h]);
  }
  return HISTORY_GROUPS.filter((g) => out.has(g)).map((g) => ({ group: g, items: out.get(g)! }));
}

/** The left column: New chat, a search box and the past chats grouped by date. */
function ChatList({ onPicked, onCollapse }: { onPicked: () => void; onCollapse?: () => void }) {
  const ask = useAskOptional()!;
  const [term, setTerm] = useState('');
  const groups = useMemo(() => groupHistory(ask.history, term), [ask.history, term]);
  const current = ask.conversationId;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-[56px] flex-none items-center gap-2 px-3">
        <VisorBadge size={30} />
        <span className="flex-1 text-[15px] font-medium text-ink">Ask VCFO</span>
        {onCollapse ? (
          <button type="button" onClick={onCollapse} aria-label="Hide chats" title="Hide chats" className={cn(ghost, 'w-8 justify-center px-0')}>
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.6} aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="flex-none space-y-2 px-3 pb-3">
        <button
          type="button"
          onClick={() => {
            ask.reset();
            onPicked();
          }}
          className="flex h-10 w-full items-center gap-2 rounded-md border-1.5 border-line-strong bg-surface-raised px-3 text-[14px] font-medium text-ink hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25"
        >
          <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          New chat
        </button>
        <label className="flex h-9 items-center gap-2 rounded-md border border-line bg-surface-raised px-2.5 focus-within:border-brand focus-within:ring-4 focus-within:ring-focus-ring/25">
          <Search className="h-4 w-4 flex-none text-ink-faint" strokeWidth={1.6} aria-hidden />
          <span className="sr-only">Search chats</span>
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search chats"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </label>
      </div>
      <nav aria-label="Past chats" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {ask.history.length === 0 ? (
          <p className="px-2 py-3 text-[13px] text-ink-faint">No past chats</p>
        ) : groups.length === 0 ? (
          <p className="px-2 py-3 text-[13px] text-ink-faint">No chats match</p>
        ) : (
          groups.map(({ group, items }) => (
            <div key={group} className="mb-3">
              <h3 className="px-2 pb-1 pt-2 text-[12px] font-medium text-ink-muted">{group}</h3>
              <ul>
                {items.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      aria-current={h.id === current ? 'true' : undefined}
                      title={h.title}
                      onClick={() => {
                        ask.openConversation(h.id);
                        onPicked();
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] hover:bg-ink/[.06] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25',
                        h.id === current ? 'bg-brand-soft text-brand-text hover:bg-brand-soft' : 'text-ink-2',
                      )}
                    >
                      <MessageSquare className="h-3.5 w-3.5 flex-none opacity-60" strokeWidth={1.6} aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{h.title}</span>
                      <span className="flex-none text-[11.5px] tabular-nums text-ink-faint">{shortDate(h.at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </nav>
    </div>
  );
}

/** The empty state: the robot, a greeting, the composer in the middle and suggestion cards. */
function Welcome({ firstName, scopeLine }: { firstName: string; scopeLine: string }) {
  const ask = useAskOptional()!;
  const query = useAskSuggestions(ask.shell ?? null, ask.engagementId ?? null, Boolean(ask.enabled));
  const suggestions = (query.data?.suggestions ?? []).slice(0, 4);
  const snapshot = query.data?.snapshot ?? null;
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col items-center px-4 pb-8 pt-[clamp(24px,8vh,96px)] text-center">
      <span className="ask-hero-bot grid h-[88px] w-[88px] place-items-center overflow-hidden rounded-full border-1.5 border-line bg-surface-raised shadow-dialog" aria-hidden>
        <VisorHead style={{ width: 76, height: 96, marginTop: 22 }} />
      </span>
      <h2 className="mt-5 text-[24px] font-medium leading-tight text-ink sm:text-[28px]">
        {firstName ? `Hi ${firstName}, how can I help?` : 'How can I help?'}
      </h2>
      <p className="mt-2 text-[14px] text-ink-muted">{scopeLine}</p>
      {snapshot ? (
        <p className="mt-3 rounded-full border border-line bg-surface-sunken px-3 py-1 text-[12.5px] tabular-nums text-ink-2">
          {snapshot.companyName} · {snapshot.currentPhase} · {snapshot.completedStepCount} of {snapshot.totalActiveSteps} steps done
        </p>
      ) : null}
      <div className="mt-6 w-full text-left">
        <AskComposer />
      </div>
      {query.isError ? (
        <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          Could not load suggestions.
        </p>
      ) : null}
      {query.isLoading ? (
        <div className="mt-5 grid w-full gap-2 sm:grid-cols-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="block h-[60px] animate-pulse rounded-md bg-surface-sunken" />
          ))}
        </div>
      ) : suggestions.length > 0 ? (
        <ul aria-label="Quick start" className="mt-5 grid w-full gap-2 sm:grid-cols-2">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={ask.busy}
                onClick={() => void ask.ask({ suggestionId: s.id, label: s.label })}
                className="flex h-full min-h-[60px] w-full items-center rounded-md border-1.5 border-line bg-surface-raised px-4 py-3 text-left text-[13.5px] text-ink-2 transition-colors hover:border-brand/40 hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25 disabled:opacity-50"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The dedicated Ask VCFO page, `/app/<role>/ask`, which the sidebar's Ask VCFO opens (owner
 * decision 2 Nov 2026; first built as owner item F4). A chat-app layout: past chats on the
 * left (New chat, search, grouped by date, hideable), the conversation in a centred column with
 * the composer pinned under it, and on a new chat the robot with a greeting, the composer and
 * suggestion cards in the middle. The chat list comes from the server
 * (`GET /api/ask/conversations`, React Query in the provider). It reads and writes the same Ask
 * provider as the pop-up, so "Open full page" there shows the same conversation. While the page
 * is on screen the pop-up and the corner robot hide (`pageOpen`).
 */
export function AskFullPage() {
  const ask = useAskOptional();
  const { user } = useApp();
  const setPageOpen = ask?.setPageOpen;
  const mainRef = useRef<HTMLElement>(null);
  const [listHidden, setListHidden] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (!setPageOpen) return;
    setPageOpen(true);
    return () => setPageOpen(false);
  }, [setPageOpen]);

  useEffect(() => {
    mainRef.current?.querySelector<HTMLTextAreaElement>('#ask-composer')?.focus();
  }, [ask?.conversationId]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  if (!ask?.enabled) {
    return (
      <div className="cp-tw">
        <p className="rounded-md border-1.5 border-line bg-surface-raised px-4 py-6 text-center text-[14px] text-ink-muted">Ask VCFO is off</p>
      </div>
    );
  }

  const client = ask.shell === 'client';
  const scoped = user?.role === 'manager' || user?.role === 'intern';
  const scopeLine = client
    ? 'Answers about your company setup and compliance, from verified sources.'
    : scoped
      ? 'Answers about your clients, deadlines and rules. Read only.'
      : 'Answers about every project, deadline and rule in the firm. Read only.';
  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] ?? '';
  const empty = ask.thread.length === 0;
  const title = empty ? 'New chat' : (ask.history.find((h) => h.id === ask.conversationId)?.title ?? 'Ask VCFO');

  return (
    // The staff shell pads its content column; the client portal's pages pad themselves.
    <div className={cn('cp-tw', client && 'p-4 md:p-6')}>
      <div
        className={cn(
          'ask-vpv-scope relative grid min-h-[520px] grid-cols-1 overflow-hidden rounded-md border-1.5 border-line bg-surface-raised text-ink',
          client ? 'h-[calc(100dvh-112px)]' : 'h-[calc(100dvh-140px)]',
          !listHidden && 'md:grid-cols-[272px_minmax(0,1fr)]',
          ask.busy && 'ask-think',
        )}
      >
        {!listHidden ? (
          <aside className="hidden min-h-0 border-r border-line-soft bg-surface-sunken/60 md:block">
            <ChatList onPicked={() => undefined} onCollapse={() => setListHidden(true)} />
          </aside>
        ) : null}

        {/* Phones and tablets: the chat list slides in over the page. */}
        {drawer ? (
          <div className="absolute inset-0 z-20 md:hidden">
            <button type="button" aria-label="Close chats" className="absolute inset-0 bg-ink/30" onClick={() => setDrawer(false)} />
            <div role="dialog" aria-label="Chats" className="absolute inset-y-0 left-0 w-[min(300px,85%)] border-r border-line bg-surface-raised shadow-dialog">
              <button type="button" onClick={() => setDrawer(false)} aria-label="Close chats" className={cn(ghost, 'absolute right-2 top-3 z-10 w-8 justify-center px-0')}>
                <X className="h-4 w-4" strokeWidth={1.6} aria-hidden />
              </button>
              <ChatList onPicked={() => setDrawer(false)} />
            </div>
          </div>
        ) : null}

        <section ref={mainRef} aria-label="Ask VCFO" className="flex min-h-0 flex-col">
          <div className="flex min-h-[56px] flex-none items-center gap-2 border-b border-line-soft px-3">
            <button type="button" onClick={() => setDrawer(true)} aria-label="Show chats" className={cn(ghost, 'w-8 justify-center px-0 md:hidden')}>
              <PanelLeftOpen className="h-4 w-4" strokeWidth={1.6} aria-hidden />
            </button>
            {listHidden ? (
              <button type="button" onClick={() => setListHidden(false)} aria-label="Show chats" title="Show chats" className={cn(ghost, 'hidden w-8 justify-center px-0 md:inline-flex')}>
                <PanelLeftOpen className="h-4 w-4" strokeWidth={1.6} aria-hidden />
              </button>
            ) : null}
            <h1 className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{title}</h1>
            {ask.preview ? (
              <span className="hidden rounded-sm bg-brand-soft px-2 py-0.5 text-[12px] font-medium text-brand-text sm:inline">
                Client view · {ask.preview.companyName}
              </span>
            ) : null}
            <span className="hidden rounded-full border border-line px-2.5 py-0.5 text-[12px] text-ink-muted lg:inline">
              {client ? 'Verified sources' : scoped ? 'Your clients' : 'Firm-wide'}
            </span>
            {!empty ? (
              <button type="button" onClick={ask.reset} className={ghost}>
                <Plus className="h-4 w-4" strokeWidth={1.6} aria-hidden />
                <span className="hidden sm:inline">New chat</span>
                <span className="sr-only sm:hidden">New chat</span>
              </button>
            ) : null}
          </div>

          {empty ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Welcome firstName={firstName} scopeLine={scopeLine} />
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
                <div className="mx-auto w-full max-w-[768px]">
                  <AskThread />
                </div>
              </div>
              <div className="flex-none px-4 pb-4 pt-2">
                <div className="mx-auto w-full max-w-[768px]">
                  <AskComposer />
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
