'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import type { ManagerInvoiceDto } from '@/lib/receivables/wire';
import { useAddSbcNote, useInvoiceNotes } from '@/hooks/use-receivables';
import { stamp } from '../format';

/**
 * Phase 8, the manager sheet: the date the partner says the client promised to pay ("Promised
 * 12 Nov") and the invoice's notes. The notes button opens a dialog with the thread and a reply
 * box; a manager reply is marked as from SBC and the partner gets a short email.
 */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-11-12` → `12 Nov`. */
function dayMonth(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

export function PromiseChip({ invoice, today }: { invoice: Pick<ManagerInvoiceDto, 'promisedOn'>; today: string }) {
  if (!invoice.promisedOn) return null;
  const late = invoice.promisedOn < today;
  return (
    <Chip raw tone={late ? 'bad' : 'prog'} title={late ? 'The promised date has passed' : 'The date the client promised to pay'}>
      {`Promised ${dayMonth(invoice.promisedOn)}`}
    </Chip>
  );
}

export function NotesButton({ invoice, onOpen }: { invoice: Pick<ManagerInvoiceDto, 'noteCount' | 'clientName'>; onOpen: () => void }) {
  const n = invoice.noteCount ?? 0;
  return (
    <Button size="sm" variant="quiet" onClick={onOpen} aria-label={`${n} note${n === 1 ? '' : 's'} on ${invoice.clientName}`}>
      <MessageSquare className="size-3.5" aria-hidden />
      {n}
    </Button>
  );
}

export function NotesDialog({ sheetId, invoice, onClose }: { sheetId: string; invoice: ManagerInvoiceDto; onClose: () => void }) {
  const notes = useInvoiceNotes(invoice.id);
  const reply = useAddSbcNote(sheetId, invoice.id);
  const [text, setText] = useState('');
  const label = invoice.invoiceNo ? `${invoice.clientName} ${invoice.invoiceNo}` : invoice.clientName;
  const send = () =>
    reply.mutate(text.trim(), {
      onSuccess: () => {
        setText('');
        toastSuccess('Reply saved', 'The partner gets an email when they have a login.');
      },
      onError: (e) => toastError('Reply not saved', e instanceof Error ? e.message : 'Something went wrong. Try again.'),
    });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Notes · ${label}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button disabled={!text.trim() || text.length > 2000 || reply.isPending} onClick={send}>
            {reply.isPending ? 'Sending…' : 'Reply'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {notes.isLoading ? <div className="h-16 animate-pulse rounded-md bg-surface-sunken" aria-busy="true" /> : null}
        {notes.isError ? (
          <p role="alert" className="text-[13px] text-danger">
            {notes.error instanceof Error ? notes.error.message : 'Could not load the notes.'}
          </p>
        ) : null}
        {notes.data && notes.data.length === 0 ? <p className="text-[13px] text-ink-muted">No notes on this invoice yet.</p> : null}
        {notes.data && notes.data.length ? (
          <ol className="m-0 grid max-h-[320px] list-none gap-2 overflow-y-auto p-0">
            {notes.data.map((n) => (
              <li key={n.id} className={`rounded-md border px-3 py-2 ${n.fromSbc ? 'border-brand/30 bg-brand-soft/40' : 'border-line bg-surface-raised'}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-ink-muted">
                  <b className="font-semibold text-ink">{n.authorName || (n.fromSbc ? 'SBC' : 'Partner')}</b>
                  {n.fromSbc ? <span>SBC</span> : <span>Client partner</span>}
                  <span>{stamp(n.createdAt)}</span>
                </div>
                <p className="m-0 mt-1 whitespace-pre-wrap text-[13px] text-ink">{n.text}</p>
              </li>
            ))}
          </ol>
        ) : null}
        <label htmlFor="rcv-note-reply" className="grid gap-1.5 text-[13px] font-medium text-ink-2">
          Reply
          <Textarea id="rcv-note-reply" value={text} maxLength={2000} rows={3} onChange={(e) => setText(e.target.value)} placeholder="Write a reply to the client partner" />
        </label>
      </div>
    </Modal>
  );
}
