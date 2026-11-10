'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { EmptyState } from '@/components/ui/empty-state';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { isItemDone } from '@/lib/request-lists/model';
import {
  addItem,
  answerItem,
  confirmSend,
  createList,
  fetchList,
  fetchLists,
  fetchSendReview,
  patchList,
  removeItem,
  REQUEST_LISTS_KEY,
  reviewItem,
  type RequestListDetail,
  type RequestListSummary,
  type SendReview,
  type TemplateOption,
} from './api';

/**
 * Request lists (IDEAS-PLAN wave 2, A): one page for every role. Staff (/app/<role>/requests) see
 * every list in their scope, start one from a template, edit a draft, send it through a review
 * that names the recipients, and accept or reject answers. A client (/app/client/requests) sees
 * their own sent lists, answers and confirms items, and uploads document items on the Documents
 * page, where each one is an ordinary document request.
 */

const STATUS_WORD: Record<string, { word: string; tone: ChipTone }> = {
  draft: { word: 'Draft', tone: 'idle' },
  sent: { word: 'Waiting on client', tone: 'prog' },
  complete: { word: 'Complete', tone: 'ok' },
  cancelled: { word: 'Cancelled', tone: 'idle' },
};

const ITEM_WORD: Record<string, { word: string; tone: ChipTone }> = {
  pending: { word: 'Pending', tone: 'warn' },
  received: { word: 'Received', tone: 'prog' },
  accepted: { word: 'Accepted', tone: 'ok' },
  rejected: { word: 'Redo', tone: 'bad' },
};

const KIND_WORD: Record<string, string> = { document: 'Document', answer: 'Answer', confirmation: 'Confirmation' };

type Tab = 'open' | 'drafts' | 'closed';

export function RequestListsPage() {
  const { user, engagements } = useApp();
  const isClient = user?.role === 'client';
  const params = useSearchParams();
  const [selected, setSelected] = useState<string | null>(params?.get('list') ?? null);
  const [tab, setTab] = useState<Tab>('open');
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: REQUEST_LISTS_KEY, queryFn: fetchLists });

  const lists = useMemo(() => q.data?.lists ?? [], [q.data]);
  const shown = lists.filter((l) =>
    isClient ? true : tab === 'open' ? l.status === 'sent' : tab === 'drafts' ? l.status === 'draft' : l.status === 'complete' || l.status === 'cancelled',
  );

  useEffect(() => {
    if (!selected && isClient && lists[0]) setSelected(lists.find((l) => l.status === 'sent')?.id ?? lists[0].id);
  }, [isClient, lists, selected]);

  const tabs = [
    { key: 'open', label: 'Open', count: lists.filter((l) => l.status === 'sent').length },
    { key: 'drafts', label: 'Drafts', count: lists.filter((l) => l.status === 'draft').length },
    { key: 'closed', label: 'Closed', count: lists.filter((l) => l.status === 'complete' || l.status === 'cancelled').length },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 p-4 md:p-6">
      <DashSection
        title={isClient ? 'What we need from you' : 'Request lists'}
        meta={lists.length ? `${lists.length}` : undefined}
        loading={q.isLoading}
        flush
        right={
          isClient ? null : (
            <div className="flex items-center gap-2">
              <SpectrumTabs items={tabs} value={tab} onChange={(v) => setTab(v as Tab)} label="Request list status" />
              <Button size="sm" onClick={() => setCreating((v) => !v)}>
                New list
              </Button>
            </div>
          )
        }
      >
        {creating && !isClient ? (
          <CreateForm
            templates={q.data?.templates ?? []}
            engagements={engagements.map((e) => ({ id: e.id, name: e.companyName }))}
            onDone={(id) => {
              setCreating(false);
              setTab('drafts');
              setSelected(id);
            }}
          />
        ) : null}
        {q.error ? (
          <p className="px-4 py-3 text-[13px] text-danger">{(q.error as Error).message}</p>
        ) : shown.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={isClient ? 'Nothing is waiting on you.' : tab === 'drafts' ? 'No drafts.' : tab === 'open' ? 'No lists waiting on clients.' : 'No closed lists.'}
              action={isClient ? null : <Button size="sm" variant="outline" onClick={() => setCreating(true)}>Start from a template</Button>}
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((l) => (
              <ListRow key={l.id} list={l} active={l.id === selected} showCompany={!isClient} onOpen={() => setSelected(l.id === selected ? null : l.id)} />
            ))}
          </ul>
        )}
      </DashSection>
      {selected ? <ListDetail id={selected} isClient={isClient} onClosed={() => setSelected(null)} /> : null}
    </div>
  );
}

function ListRow({ list, active, showCompany, onOpen }: { list: RequestListSummary; active: boolean; showCompany: boolean; onOpen: () => void }) {
  const s = STATUS_WORD[list.status] ?? STATUS_WORD.draft!;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={active}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover ${active ? 'bg-hover' : ''}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-ink">{list.title}</span>
          <span className="block truncate text-[12px] text-ink-muted">
            {[showCompany ? list.companyName : null, list.dueOn ? `Due ${list.dueOn}` : null, list.reminderCount ? `${list.reminderCount} reminder${list.reminderCount === 1 ? '' : 's'} sent` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <span className="hidden w-[120px] flex-none sm:block">
          <span className="block h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
            <span className="block h-full rounded-full bg-positive" style={{ width: `${list.progress.percent}%` }} />
          </span>
          <span className="mt-1 block text-[12px] text-ink-muted">
            {list.progress.done} of {list.progress.total} in
          </span>
        </span>
        <Chip tone={s.tone}>{s.word}</Chip>
      </button>
    </li>
  );
}

function CreateForm({ templates, engagements, onDone }: { templates: TemplateOption[]; engagements: Array<{ id: string; name: string }>; onDone: (id: string) => void }) {
  const qc = useQueryClient();
  const [engagementId, setEngagementId] = useState('');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [periodLabel, setPeriodLabel] = useState('');
  const [dueOn, setDueOn] = useState('');
  const template = templates.find((t) => t.id === templateId);
  const m = useMutation({
    mutationFn: () => createList({ engagementId, templateId, periodLabel: periodLabel || null, dueOn: dueOn || null }),
    onSuccess: (list) => {
      void qc.invalidateQueries({ queryKey: REQUEST_LISTS_KEY });
      onDone(list.id);
    },
  });
  const field = 'h-control-md w-full rounded-md border-1.5 border-line-strong bg-surface-raised px-2.5 text-[14px] text-ink';
  return (
    <form
      className="grid gap-3 border-b border-line bg-surface-sunken/50 p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (engagementId && templateId) m.mutate();
      }}
    >
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-2">
        Client
        <select className={field} value={engagementId} onChange={(e) => setEngagementId(e.target.value)} required>
          <option value="">Choose a client</option>
          {engagements.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-2">
        Template
        <select className={field} value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title} ({t.itemCount} items)
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-2">
        Period
        <input className={field} value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder={template?.periodHint ?? ''} maxLength={60} />
      </label>
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-2">
        Due date
        <input className={field} type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
      </label>
      <p className="text-[12px] text-ink-muted sm:col-span-2">
        {template ? `${template.summary} Reminders every ${template.cadenceDays} days once sent. ` : ''}The list starts as a draft; nothing reaches the client until you send it.
      </p>
      {m.error ? <p className="text-[13px] text-danger sm:col-span-2">{(m.error as Error).message}</p> : null}
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={!engagementId || !templateId || m.isPending}>
          {m.isPending ? 'Creating…' : 'Create draft'}
        </Button>
      </div>
    </form>
  );
}

function ListDetail({ id, isClient, onClosed }: { id: string; isClient: boolean; onClosed: () => void }) {
  const qc = useQueryClient();
  const key = [...REQUEST_LISTS_KEY, id];
  const q = useQuery({ queryKey: key, queryFn: () => fetchList(id) });
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: (run: () => Promise<RequestListDetail>) => run(),
    onSuccess: (list) => {
      qc.setQueryData(key, list);
      void qc.invalidateQueries({ queryKey: REQUEST_LISTS_KEY, exact: true });
      setError(null);
    },
    onError: (e) => setError((e as Error).message),
  });
  const list = q.data;
  if (q.error) return <p className="text-[13px] text-danger">{(q.error as Error).message}</p>;
  const draft = list?.status === 'draft';

  return (
    <DashSection
      title={list?.title ?? 'Request list'}
      meta={list ? `${list.progress.done} of ${list.progress.total} in` : undefined}
      loading={q.isLoading}
      flush
      right={
        !isClient && list ? (
          <div className="flex items-center gap-2">
            {draft ? (
              <Button size="sm" onClick={() => setReviewing(true)}>
                Send to client
              </Button>
            ) : null}
            {draft || list.status === 'sent' ? (
              <Button
                size="sm"
                variant="quiet"
                onClick={() => {
                  if (window.confirm('Cancel this list? Reminders stop.')) change.mutate(() => patchList(id, { cancel: true }));
                }}
              >
                Cancel list
              </Button>
            ) : null}
            <Button size="sm" variant="quiet" onClick={onClosed}>
              Close
            </Button>
          </div>
        ) : null
      }
    >
      {list ? (
        <>
          <p className="border-b border-line px-4 py-2 text-[12px] text-ink-muted">
            {[!isClient ? list.companyName : null, list.periodLabel, list.dueOn ? `Due ${list.dueOn}` : null, !isClient && list.status === 'sent' ? `Reminders every ${list.cadenceDays} days` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {reviewing ? (
            <SendReviewPanel
              id={id}
              onCancel={() => setReviewing(false)}
              onSent={() => {
                setReviewing(false);
                void qc.invalidateQueries({ queryKey: REQUEST_LISTS_KEY });
              }}
            />
          ) : null}
          {error ? <p className="px-4 py-2 text-[13px] text-danger">{error}</p> : null}
          <ul className="divide-y divide-line">
            {list.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                isClient={isClient}
                listStatus={list.status}
                busy={change.isPending}
                onAnswer={(body) => change.mutate(() => answerItem(id, item.id, body))}
                onReview={(d) => change.mutate(() => reviewItem(id, item.id, d))}
                onRemove={() => change.mutate(() => removeItem(id, item.id))}
              />
            ))}
          </ul>
          {!isClient && (draft || list.status === 'sent') ? <AddItem busy={change.isPending} onAdd={(body) => change.mutate(() => addItem(id, body))} /> : null}
        </>
      ) : (
        <div />
      )}
    </DashSection>
  );
}

function ItemRow({
  item,
  isClient,
  listStatus,
  busy,
  onAnswer,
  onReview,
  onRemove,
}: {
  item: RequestListDetail['items'][number];
  isClient: boolean;
  listStatus: string;
  busy: boolean;
  onAnswer: (body: { answerText?: string | null; confirmed?: boolean }) => void;
  onReview: (d: 'accepted' | 'rejected') => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(item.answerText ?? '');
  const s = ITEM_WORD[item.status] ?? ITEM_WORD.pending!;
  const open = listStatus === 'sent' && !isItemDone(item.status);
  const canAnswer = isClient && open && item.kind !== 'document';
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] text-ink">{item.label}</span>
          <span className="block text-[12px] text-ink-muted">
            {KIND_WORD[item.kind]}
            {item.help ? ` · ${item.help}` : ''}
          </span>
          {item.answerText && !canAnswer ? <span className="mt-1 block rounded-md bg-surface-sunken px-2 py-1 text-[13px] text-ink-2">{item.answerText}</span> : null}
        </span>
        {listStatus === 'draft' ? null : <Chip tone={s.tone}>{s.word}</Chip>}
        {!isClient && listStatus === 'draft' ? (
          <Button size="sm" variant="quiet" disabled={busy} onClick={onRemove} aria-label={`Remove ${item.label}`}>
            Remove
          </Button>
        ) : null}
      </div>
      {isClient && open && item.kind === 'document' ? (
        <Link href="/app/client/documents" className="text-[13px] font-semibold text-brand-text hover:underline">
          Upload in Documents ›
        </Link>
      ) : null}
      {canAnswer ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <textarea
            className="min-h-[64px] w-full flex-1 rounded-md border-1.5 border-line-strong bg-surface-raised px-2.5 py-2 text-[14px] text-ink"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={item.kind === 'confirmation' ? 'Optional note, or why not' : 'Your answer'}
            maxLength={4000}
            aria-label={`Answer: ${item.label}`}
          />
          {item.kind === 'confirmation' ? (
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => onAnswer({ confirmed: true, answerText: text || null })}>
                Confirm
              </Button>
              <Button size="sm" variant="outline" disabled={busy || !text.trim()} onClick={() => onAnswer({ confirmed: false, answerText: text })}>
                Not quite
              </Button>
            </div>
          ) : (
            <Button size="sm" disabled={busy || !text.trim()} onClick={() => onAnswer({ answerText: text })}>
              Send answer
            </Button>
          )}
        </div>
      ) : null}
      {!isClient && item.kind !== 'document' && item.status === 'received' ? (
        <div className="flex gap-2">
          <Button size="sm" variant="soft" disabled={busy} onClick={() => onReview('accepted')}>
            Accept
          </Button>
          <Button size="sm" variant="quiet" disabled={busy} onClick={() => onReview('rejected')}>
            Ask again
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function AddItem({ busy, onAdd }: { busy: boolean; onAdd: (body: { kind: string; label: string }) => void }) {
  const [kind, setKind] = useState('document');
  const [label, setLabel] = useState('');
  return (
    <form
      className="flex flex-col gap-2 border-t border-line p-4 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!label.trim()) return;
        onAdd({ kind, label: label.trim() });
        setLabel('');
      }}
    >
      <select className="h-control-sm rounded-md border-1.5 border-line-strong bg-surface-raised px-2 text-[13px]" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Item kind">
        <option value="document">Document</option>
        <option value="answer">Answer</option>
        <option value="confirmation">Confirmation</option>
      </select>
      <input
        className="h-control-sm flex-1 rounded-md border-1.5 border-line-strong bg-surface-raised px-2.5 text-[13px]"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Add an item"
        maxLength={300}
        aria-label="New item"
      />
      <Button type="submit" size="sm" variant="outline" disabled={busy || !label.trim()}>
        Add
      </Button>
    </form>
  );
}

/**
 * The review before a list goes out: the exact recipients, the items, and every check. Nothing is
 * sent until the person clicks "Approve and send"; the server runs the checks again at that click.
 */
function SendReviewPanel({ id, onCancel, onSent }: { id: string; onCancel: () => void; onSent: () => void }) {
  const q = useQuery<SendReview>({ queryKey: [...REQUEST_LISTS_KEY, id, 'review'], queryFn: () => fetchSendReview(id), staleTime: 0 });
  const m = useMutation({ mutationFn: () => confirmSend(id), onSuccess: onSent });
  const review = q.data;
  return (
    <div className="m-4 rounded-md border-1.5 border-line-strong bg-surface-raised p-4" role="region" aria-label="Review before sending">
      {q.isLoading ? <p className="text-[13px] text-ink-muted">Preparing the review…</p> : null}
      {q.error ? <p className="text-[13px] text-danger">{(q.error as Error).message}</p> : null}
      {review ? (
        <div className="flex flex-col gap-3">
          <p className="text-[14px] font-semibold text-ink">{review.title}</p>
          <div>
            <p className="text-[12px] font-semibold text-ink-2">Goes to</p>
            {review.recipients.length ? (
              <ul className="text-[13px] text-ink">
                {review.recipients.map((r) => (
                  <li key={r.email ?? r.name}>
                    {r.name}
                    {r.email && r.email !== r.name ? <span className="text-ink-muted"> · {r.email}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-muted">Nobody yet.</p>
            )}
          </div>
          <pre className="whitespace-pre-wrap rounded-md bg-surface-sunken px-3 py-2 font-sans text-[13px] text-ink-2">{review.summary}</pre>
          <p className="text-[12px] text-ink-muted">One email now, then reminders until every item is in (WhatsApp from the second reminder for clients who opted in).</p>
          {review.heldReason ? <p className="text-[13px] font-semibold text-danger">{review.heldReason}</p> : null}
          {m.error ? <p className="text-[13px] text-danger">{(m.error as Error).message}</p> : null}
          <div className="flex gap-2">
            <Button size="sm" disabled={Boolean(review.heldReason) || m.isPending} onClick={() => m.mutate()}>
              {m.isPending ? 'Sending…' : 'Approve and send'}
            </Button>
            <Button size="sm" variant="quiet" onClick={onCancel}>
              Not now
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default RequestListsPage;
