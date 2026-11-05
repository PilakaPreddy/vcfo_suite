'use client';

/**
 * "Message the lead" on Home (G-09; prototype inc-parts.tsx MessageModal): the thread with the
 * project lead, oldest first, and a box to write. Reads `GET /api/client/messages?engagementId=`
 * (which also marks the lead's messages read) and sends with `POST /api/client/messages`
 * `{ engagementId, body }`, the contract in docs/ui-port/GAPS-BRIEF.md.
 */
import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SkeletonRows } from '@/components/ui/empty-state';
import { usePortal } from '@/components/client-portal/PortalProvider';
import { CLIENT_MESSAGE_MAX, messageToSend, threadOrder, type ClientMessage } from '@/lib/client-portal/messages';
import { Avatar, Empty, SCard } from '../incorporation/spectrum';
import { dShort } from './derive';

const MESSAGES_KEY = 'client-messages';

function timeOf(iso: string, today: string): string {
  const day = iso.slice(0, 10);
  const t = new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  return day === today ? t : `${dShort(day)} · ${t}`;
}

export function MessagesCard({ engagementId, lead, today, className }: { engagementId: string | null | undefined; lead?: string; today: string; className?: string }) {
  const { toast } = usePortal();
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const to = lead ?? 'your project lead';

  const q = useQuery({
    queryKey: [MESSAGES_KEY, engagementId],
    enabled: Boolean(engagementId),
    queryFn: async (): Promise<ClientMessage[]> => {
      const res = await fetch(`/api/client/messages?engagementId=${encodeURIComponent(engagementId!)}`, { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as { messages?: ClientMessage[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Messages did not load');
      return threadOrder(data.messages ?? []);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const send = useMutation({
    mutationFn: async (body: string): Promise<ClientMessage> => {
      const res = await fetch('/api/client/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ engagementId, body }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: ClientMessage; error?: string };
      if (!res.ok || !data.message) throw new Error(data.error ?? 'Could not send the message');
      return data.message;
    },
    onSuccess: (message) => {
      setDraft('');
      qc.setQueryData<ClientMessage[]>([MESSAGES_KEY, engagementId], (old) => threadOrder([...(old ?? []), message]));
      toast(`Sent to ${to}`);
    },
    onError: (e: Error) => toast(e.message),
  });

  const thread = q.data ?? [];
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length]);

  const submit = () => {
    const body = messageToSend(draft);
    if (!body || send.isPending || !engagementId) return;
    send.mutate(body);
  };

  return (
    <SCard title={`Message ${lead ? lead.split(/\s+/)[0] : 'your lead'}`} meta={thread.length || undefined} flush className={className}>
      {q.isLoading ? (
        <div className="px-4 py-3 md:px-5">
          <SkeletonRows rows={3} />
        </div>
      ) : q.isError ? (
        <Empty
          action={
            <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
              Try again
            </Button>
          }
        >
          Messages did not load
        </Empty>
      ) : thread.length ? (
        <div ref={listRef} className="grid max-h-[320px] gap-3 overflow-auto px-4 py-3 md:px-5" role="log" aria-label={`Messages with ${to}`}>
          {thread.map((m) => {
            const mine = m.senderSide === 'client';
            return (
              <div key={m.id} className={cn('flex items-end gap-2', mine && 'flex-row-reverse')}>
                {!mine ? <Avatar name={m.senderName} size={24} /> : null}
                <div className={cn('grid max-w-[80%] gap-0.5', mine && 'justify-items-end')}>
                  <span className={cn('whitespace-pre-wrap break-words rounded-md px-3 py-2 text-[13.5px]', mine ? 'bg-brand-soft text-ink' : 'bg-surface-sunken text-ink')}>{m.body}</span>
                  <span className="text-[11.5px] text-ink-faint">
                    {mine ? 'You' : m.senderName} · {timeOf(m.createdAt, today)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="px-4 py-3 text-[13px] text-ink-muted md:px-5">No messages yet</p>
      )}
      <form
        className="grid gap-2 border-t border-line-soft px-4 py-3 md:px-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="sr-only" htmlFor="home-msg">
          Message to {to}
        </label>
        <textarea
          id="home-msg"
          value={draft}
          maxLength={CLIENT_MESSAGE_MAX}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={`Write to ${to}`}
          className="w-full resize-y rounded-md border-1.5 border-line-strong bg-surface px-3 py-2 text-[14px] text-ink outline-none placeholder:text-ink-faint focus-visible:border-brand"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!messageToSend(draft) || send.isPending || !engagementId}>
            <Send size={14} strokeWidth={1.6} aria-hidden /> {send.isPending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </form>
    </SCard>
  );
}
