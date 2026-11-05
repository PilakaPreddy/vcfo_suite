'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { toastError, toastInfo, toastLoading, toastSuccess } from '@/lib/toast-errors';
import { isEmailAddress, splitTypedRecipients } from '@/lib/email/recipient-input';
import type { EmailRecipient } from '@/lib/receivables/model';
import type { ManagerSheetDto } from '@/lib/receivables/wire';
import { summarySendOutcome, useOutlookStatus, useSendSummary, useSummary, type useReceivablesActions } from '@/hooks/use-receivables';
import { stamp } from '../format';

/**
 * Send email (Phase 4): the summary in the finance team's format, built from the published
 * version, sent from the manager's own Outlook. To, Cc and Bcc take any address; the ready-made
 * lists fill them; the body is editable; the Excel file is attached by default.
 */

type Field = 'to' | 'cc' | 'bcc';
type People = Record<Field, EmailRecipient[]>;

export const OUTLOOK_CONNECT_HREF = '/api/outlook/connect?return=/receivables/manager';

function RecipientRow({ field, label, people, contacts, onChange }: { field: Field; label: string; people: EmailRecipient[]; contacts: EmailRecipient[]; onChange: (next: EmailRecipient[]) => void }) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    // A whole known name ("Yash Babbar") first, before the text is split at spaces and commas.
    const named = contacts.find((c) => c.name && c.name.toLowerCase() === raw.trim().toLowerCase());
    const tokens = named ? [named.email] : splitTypedRecipients(raw);
    if (!tokens.length) return;
    const next = [...people];
    const bad: string[] = [];
    for (const t of tokens) {
      const known = contacts.find((c) => c.email.toLowerCase() === t.toLowerCase() || c.name.toLowerCase() === t.toLowerCase());
      const email = known?.email ?? t;
      if (!isEmailAddress(email)) {
        bad.push(t);
        continue;
      }
      if (!next.some((p) => p.email.toLowerCase() === email.toLowerCase())) next.push({ name: known?.name ?? '', email });
    }
    onChange(next);
    setText(bad.join(' '));
    if (bad.length) toastError('Not an email address', bad.join(', '));
  };
  const listId = `rcv-contacts-${field}`;
  return (
    <div className="flex items-start gap-2 border-b border-line-soft py-1.5">
      <label htmlFor={`rcv-rcpt-${field}`} className="w-9 flex-none pt-1.5 text-[12px] text-ink-muted">
        {label}
      </label>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1">
        {people.map((p, n) => (
          <span key={p.email} className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface-sunken py-0.5 pl-2.5 pr-1 text-[12px]" title={p.email}>
            <span className="truncate">{p.name || p.email}</span>
            <button type="button" className="grid h-4 w-4 place-items-center rounded-full text-ink-muted hover:bg-line hover:text-ink" aria-label={`Remove ${p.name || p.email}`} onClick={() => onChange(people.filter((_, i) => i !== n))}>
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={`rcv-rcpt-${field}`}
          list={listId}
          value={text}
          placeholder={people.length ? '' : 'Add a name or any email'}
          className="h-7 min-w-[160px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-faint"
          onChange={(e) => {
            const v = e.target.value;
            // A pick from the suggestions arrives as the full "Name <email>" text.
            if (contacts.some((c) => `${c.name} <${c.email}>` === v)) {
              add(v);
              return;
            }
            setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
              e.preventDefault();
              add(text);
            } else if (e.key === 'Backspace' && !text && people.length) onChange(people.slice(0, -1));
          }}
          onBlur={() => text.trim() && add(text)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text');
            if (/[,;\s]/.test(pasted.trim())) {
              e.preventDefault();
              add(pasted);
            }
          }}
        />
        <datalist id={listId}>
          {contacts.map((c) => (
            <option key={c.email} value={`${c.name} <${c.email}>`} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

export function ComposeSummary({ data, actions, onClose }: { data: ManagerSheetDto; actions: ReturnType<typeof useReceivablesActions>; onClose: () => void }) {
  const summary = useSummary(data.sheet.id, true);
  const outlook = useOutlookStatus();
  const send = useSendSummary(data.sheet.id);
  const body = useRef<HTMLDivElement>(null);
  const [people, setPeople] = useState<People>({ to: [], cc: [], bcc: [] });
  const [listKey, setListKey] = useState('');
  const [subject, setSubject] = useState('');
  const [attachExcel, setAttachExcel] = useState(true);

  // Fill the form once the draft arrives: the first list (last time, or all partners).
  useEffect(() => {
    const s = summary.data;
    if (!s) return;
    setSubject(s.subject);
    const first = s.lists[0];
    setListKey(first.key);
    setPeople({ to: first.to, cc: first.cc, bcc: first.bcc });
  }, [summary.data]);

  const applyList = (key: string) => {
    const l = summary.data?.lists.find((x) => x.key === key);
    if (!l) return;
    setListKey(key);
    setPeople({ to: l.to, cc: l.cc, bcc: l.bcc });
  };
  const contacts = summary.data?.contacts ?? [];
  const connected = outlook.data?.connected;
  const notPublished = summary.error && 'code' in summary.error && summary.error.code === 'not_published';

  const submit = () => {
    const html = body.current?.innerHTML ?? '';
    send.mutate(
      { ...people, subject, html, attachExcel },
      {
        onSuccess: (r) => {
          // The server answered 202 and sends after the response; the toast follows the send.
          const extra = [r.cc ? `${r.cc} in Cc` : '', r.bcc ? `${r.bcc} in Bcc` : ''].filter(Boolean).join(', ');
          const who = `From ${r.from} to ${r.to} ${r.to === 1 ? 'person' : 'people'}${extra ? ` (${extra})` : ''}.`;
          const toastId = `rcv-send-${r.sendId}`;
          toastLoading('Sending…', who, { id: toastId });
          onClose();
          void summarySendOutcome(data.sheet.id, r.sendId).then((o) => {
            if (o.status === 'sent') toastSuccess('Email sent', who, { id: toastId });
            else if (o.status === 'failed') toastError('Not sent', o.error ?? undefined, { id: toastId });
            else toastInfo('Still sending', 'Check Sent Items in Outlook in a minute.', { id: toastId });
          });
        },
        onError: (e) => toastError('Not sent', e instanceof Error ? e.message : undefined),
      },
    );
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Send email"
      sub={summary.data ? `Version ${summary.data.versionSeq} of ${stamp(summary.data.publishedAt)}${summary.data.lastSentAt ? ` · ${summary.data.lastSendStatus === 'failed' ? 'last send failed' : summary.data.lastSendStatus === 'sending' ? 'sending since' : 'last sent'} ${stamp(summary.data.lastSentAt)}` : ''}` : undefined}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!summary.data || !connected || !people.to.length || !subject.trim() || send.isPending}>
            {send.isPending ? 'Sending…' : 'Send'}
          </Button>
        </>
      }
    >
      {notPublished ? (
        <p className="text-[14px] text-ink-muted">Click Update once first. The email is built from the published version, so it always matches the client page.</p>
      ) : summary.isLoading ? (
        <p className="text-ink-muted">Preparing the email…</p>
      ) : summary.error ? (
        <p className="text-danger">{summary.error.message}</p>
      ) : summary.data ? (
        <div className="grid gap-2">
          {data.unpublishedChanges ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning">
              <span>
                {data.unpublishedChanges} unpublished change{data.unpublishedChanges === 1 ? '' : 's'}. The email uses the published version.
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={actions.publish.isPending}
                onClick={() => actions.publish.mutate(undefined, { onSuccess: () => void summary.refetch(), onError: (e) => toastError('Update failed', e instanceof Error ? e.message : undefined) })}
              >
                Update first
              </Button>
            </div>
          ) : null}
          {outlook.data && !connected ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
              <span>The email sends from your own Outlook. Connect it once.</span>
              <Button size="sm" variant="strong" asChild>
                <a href={OUTLOOK_CONNECT_HREF}>Connect Outlook</a>
              </Button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-muted">
            <span>
              From <b className="font-medium text-ink">{connected ? outlook.data?.msEmail : 'your Outlook'}</b>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[12px]">Recipients</span>
              <FilterSelect aria-label="Recipient list" value={listKey} onChange={(e) => applyList(e.target.value)} options={summary.data.lists.map((l) => ({ value: l.key, label: l.label }))} />
            </span>
          </div>
          <div>
            {(['to', 'cc', 'bcc'] as const).map((f) => (
              <RecipientRow key={f} field={f} label={f === 'to' ? 'To' : f === 'cc' ? 'Cc' : 'Bcc'} people={people[f]} contacts={contacts} onChange={(next) => setPeople((p) => ({ ...p, [f]: next }))} />
            ))}
          </div>
          <label className="mt-1 grid gap-1 text-[12px] font-medium text-ink-2" htmlFor="rcv-subject">
            Subject
            <Input id="rcv-subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <div className="text-[12px] font-medium text-ink-2">Message</div>
          <div
            ref={body}
            role="textbox"
            aria-multiline="true"
            aria-label="Email message"
            contentEditable
            suppressContentEditableWarning
            className="max-h-[46vh] min-h-[260px] overflow-auto rounded-md border-1.5 border-line-strong bg-white p-3.5 text-[13px] text-black outline-none [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 focus:border-brand focus:ring-4 focus:ring-focus-ring/25"
            dangerouslySetInnerHTML={{ __html: summary.data.html }}
          />
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={attachExcel} onChange={(e) => setAttachExcel(e.target.checked)} /> Attach the Excel file
          </label>
        </div>
      ) : null}
    </Modal>
  );
}
