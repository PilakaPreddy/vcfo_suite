'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { CompanyTile } from '@/components/staff/today/today-parts';
import { LeadFocusCard, type FocusTodos } from '@/components/intern/LeadFocusCard';
import { useOwnFocusTodos } from '@/hooks/use-personal-todos';
import { useApp } from '@/context/AppContext';
import {
  useMessageThread,
  useReplyToClient,
  useSetMessageTriage,
  useStaffMessages,
} from '@/hooks/use-staff-messages';
import type { InternWorkItem } from '@/lib/intern/intern-work';
import { MESSAGE_BODY_MAX, MESSAGE_TRIAGE, MESSAGE_TRIAGE_LABEL, type Message, type MessageTriage } from '@/lib/messages/types';
import { internEngagementPath } from '@/lib/projects/project-step-path';
import { sep, time24 } from '@/lib/date-format';
import { errorMessage, toastError } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';

/** Rows shown before "Show all". */
const PAGE = 5;

/** "09:05" today, otherwise "14 Oct" (R-29). */
function whenLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  const ymd = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  if (ymd(d) === ymd(now)) return time24(d);
  return sep(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }));
}

/** Where a triage button moves a message; the current state is left out. */
const MOVE_WORD: Record<MessageTriage, string> = {
  new: 'Mark new',
  todo: 'To do',
  done: 'Done',
  ignored: 'Ignore',
};

function MessageThread({
  message,
  now,
  onClose,
}: {
  message: Message;
  now: Date;
  onClose: () => void;
}) {
  const { engagements } = useApp();
  const thread = useMessageThread(message.engagementId);
  const triage = useSetMessageTriage();
  const reply = useReplyToClient();
  const [draft, setDraft] = useState('');
  const engagement = engagements.find((e) => e.id === message.engagementId);
  const recent = (thread.data ?? []).slice(-6);

  const move = (to: MessageTriage) =>
    triage.mutate(
      { id: message.id, triage: to },
      {
        onSuccess: () => onClose(),
        onError: (err) => toastError('Could not move the message', errorMessage(err)),
      },
    );

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    reply.mutate(
      { engagementId: message.engagementId, body, itemKey: message.itemKey },
      {
        onSuccess: () => {
          setDraft('');
          // A reply usually settles the ask; the lead can move it back from Done.
          if (message.triage === 'new' || message.triage === 'todo') move('done');
        },
        onError: (err) => toastError('Could not send the reply', errorMessage(err)),
      },
    );
  };

  return (
    <div className="mt-2.5 grid gap-2.5 pl-[36px]" data-message-thread>
      {thread.isPending ? (
        <SkeletonRows rows={2} />
      ) : (
        <ol className="grid gap-1.5" aria-label="Thread">
          {recent.map((m) => (
            <li
              key={m.id}
              className={cn(
                'max-w-[92%] rounded-md px-2.5 py-1.5 text-[13px] leading-snug',
                m.senderSide === 'staff' ? 'ml-auto bg-brand-soft text-ink' : 'bg-surface-sunken text-ink',
              )}
            >
              <span className="block whitespace-pre-line break-words">{m.body}</span>
              <span className="mt-0.5 block text-[11.5px] text-ink-muted">
                {m.senderName} · {whenLabel(m.createdAt, now)}
              </span>
            </li>
          ))}
        </ol>
      )}
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor={`reply-${message.id}`} className="sr-only">
          Reply to {message.senderName}
        </label>
        <Textarea
          id={`reply-${message.id}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Reply to ${message.senderName}`}
          maxLength={MESSAGE_BODY_MAX}
          rows={2}
          className="min-h-[60px] text-[13px]"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="submit" size="sm" disabled={!draft.trim() || reply.isPending}>
            Send
          </Button>
          {MESSAGE_TRIAGE.filter((t) => t !== message.triage).map((t) => (
            <Button
              key={t}
              type="button"
              size="sm"
              variant="secondary"
              disabled={triage.isPending}
              onClick={() => move(t)}
            >
              {MOVE_WORD[t]}
            </Button>
          ))}
          {engagement ? (
            <Button asChild size="sm" variant="ghost" className="ml-auto">
              <Link href={internEngagementPath(engagement)}>Open record</Link>
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function TriageList({ engagementIds }: { engagementIds?: Set<string> }) {
  const query = useStaffMessages('all');
  const [state, setState] = useState<MessageTriage>('new');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const now = useMemo(() => new Date(), []);

  const clientMessages = useMemo(
    () => (query.data ?? []).filter((m) => m.senderSide === 'client' && (!engagementIds || engagementIds.has(m.engagementId))),
    [query.data, engagementIds],
  );
  const count = (t: MessageTriage) => clientMessages.filter((m) => m.triage === t).length;
  const rows = clientMessages.filter((m) => m.triage === state);
  const shown = showAll ? rows : rows.slice(0, PAGE);

  return (
    <div className="pb-1">
      <div className="px-4 pb-2 pt-3">
        <SpectrumTabs
          label="Triage"
          className="gap-1 [&>button]:px-2"
          items={MESSAGE_TRIAGE.map((t) => ({ key: t, label: MESSAGE_TRIAGE_LABEL[t], ...(count(t) ? { count: count(t) } : {}) }))}
          value={state}
          onChange={(k) => {
            setState(k as MessageTriage);
            setOpenId(null);
            setShowAll(false);
          }}
        />
      </div>
      {query.isPending ? (
        <SkeletonRows rows={3} className="px-4 pb-3" />
      ) : query.isError ? (
        <div className="px-4 pb-3">
          <EmptyState
            title="Messages could not load"
            action={
              <Button size="sm" variant="secondary" onClick={() => void query.refetch()}>
                Try again
              </Button>
            }
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 pb-3">
          <EmptyState title={`No ${MESSAGE_TRIAGE_LABEL[state].toLowerCase()} messages`} />
        </div>
      ) : (
        <ul>
          {shown.map((m) => {
            const open = openId === m.id;
            return (
              <li key={m.id} className="border-t border-line-soft px-4 py-3 first:border-t-0">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : m.id)}
                  className="flex w-full min-w-0 items-start gap-2.5 text-left"
                >
                  <CompanyTile name={m.companyName} />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-[13.5px] leading-snug text-ink',
                        open ? 'whitespace-pre-line break-words' : 'line-clamp-2',
                        !m.readAt && 'font-medium',
                      )}
                    >
                      {m.body}
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-ink-muted">
                      {m.companyName} · {m.senderName}
                    </span>
                  </span>
                  <span className="flex-none text-[12px] text-ink-muted">{whenLabel(m.createdAt, now)}</span>
                </button>
                {open ? <MessageThread message={m} now={now} onClose={() => setOpenId(null)} /> : null}
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > PAGE ? (
        <div className="border-t border-line-soft px-4 py-2">
          <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show fewer' : `Show all ${rows.length}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The lead's Inbox (prototype `InboxCard`): Triage lists the client messages on the lead's
 * engagements by state (new, to do, done, ignored); a row opens its thread with a reply box,
 * the triage moves and "Open record". My to-dos is the lead's own to-do list.
 */
export function LeadInboxCard({
  userId,
  items,
  todos,
  engagementIds,
}: {
  userId: string;
  items: InternWorkItem[];
  /** The to-do state shared with the page (Today's "New to-do"). */
  todos?: FocusTodos;
  /** The Today scope: only messages on these engagements. */
  engagementIds?: Set<string>;
}) {
  const [tab, setTab] = useState('triage');
  const own = useOwnFocusTodos(todos ? '' : userId, items);
  const state = todos ?? own;
  const openTodos = state.focus.filter((f) => !f.done).length;
  const newCount = useStaffMessages('all').data?.filter(
    (m) => m.senderSide === 'client' && m.triage === 'new' && (!engagementIds || engagementIds.has(m.engagementId)),
  ).length;

  return (
    <DashSection
      icon={Inbox}
      title="Inbox"
      className="h-fit"
      bodyClassName="p-0"
      meta={
        <SpectrumTabs
          label="Inbox"
          items={[
            { key: 'triage', label: 'Triage', count: newCount ?? 0 },
            { key: 'todos', label: 'My to-dos', count: openTodos },
          ]}
          value={tab}
          onChange={setTab}
        />
      }
    >
      {tab === 'triage' ? <TriageList engagementIds={engagementIds} /> : <LeadFocusCard userId={userId} items={items} embedded todos={state} />}
    </DashSection>
  );
}
