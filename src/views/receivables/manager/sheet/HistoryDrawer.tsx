'use client';

import { useMemo } from 'react';
import { Bell, MessageSquare, PencilLine } from 'lucide-react';
import { Chip } from '@/components/ui/spectrum-chip';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { SidePanel } from '@/components/ui/side-panel';
import { sheetDate } from '@/lib/receivables/dates';
import type { InvoiceHistoryItem } from '@/lib/receivables/history-wire';
import type { ManagerInvoiceDto, PartnerDto } from '@/lib/receivables/wire';
import { useInvoiceHistory } from '@/hooks/use-receivables';
import { inr, stamp } from '../../format';
import { StatusChip } from '../../StatusChip';
import { changeDiff } from './change-text';
import { invoiceName } from './cell-utils';

/**
 * The invoice history drawer (Phase 10): the invoice's change trail, the reminders queued or sent
 * for it and its notes, newest first. A change still in the draft is marked Draft.
 */

const REMINDER_KIND = { before: 'Before-due reminder', due: 'Due-date reminder', overdue: 'Overdue reminder' } as const;
const REMINDER_TONE = { sent: 'ok', failed: 'bad', skipped: 'idle', queued: 'teal' } as const;
const REMINDER_WORD = { sent: 'Sent', failed: 'Failed', skipped: 'Skipped', queued: 'Queued' } as const;

function ItemRow({ item, partnerNames }: { item: InvoiceHistoryItem; partnerNames: Map<string, string> }) {
  const Icon = item.kind === 'change' ? PencilLine : item.kind === 'reminder' ? Bell : MessageSquare;
  return (
    <li className="flex gap-3 border-t border-line-soft px-5 py-3 first:border-0">
      <Icon className="mt-0.5 size-4 flex-none text-ink-muted" strokeWidth={1.6} aria-hidden />
      <div className="min-w-0 flex-1">
        {item.kind === 'change' ? (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[13px] text-ink">{item.title}</span>
              {!item.published ? (
                <Chip raw tone="warn" className="min-w-0">
                  Draft
                </Chip>
              ) : null}
            </div>
            {changeDiff(item, partnerNames) ? <div className="text-[12px] tabular-nums text-ink-2">{changeDiff(item, partnerNames)}</div> : null}
            <div className="text-[11.5px] text-ink-muted">
              {`${item.actorName ? `${item.actorName} · ` : ''}${stamp(item.at)}`}
              {!item.affectsPage ? ' · not on the client page' : ''}
            </div>
          </>
        ) : item.kind === 'reminder' ? (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[13px] text-ink">{`${REMINDER_KIND[item.reminderKind]} for ${sheetDate(item.forDate)}`}</span>
              <Chip raw tone={REMINDER_TONE[item.status]} className="min-w-0">
                {REMINDER_WORD[item.status]}
              </Chip>
            </div>
            <div className="text-[11.5px] text-ink-muted">
              {[item.toEmail, item.channel === 'outlook' ? 'via Outlook' : item.channel === 'email' ? 'via email' : null, stamp(item.at)].filter(Boolean).join(' · ')}
            </div>
            {item.error ? <div className="text-[12px] text-danger">{item.error}</div> : null}
          </>
        ) : (
          <>
            <div className="text-[12px] text-ink-muted">
              <b className="font-medium text-ink">{item.authorName || (item.fromSbc ? 'SBC' : 'Partner')}</b>
              {` · ${item.fromSbc ? 'SBC' : 'Client partner'} · ${stamp(item.at)}`}
            </div>
            <p className="m-0 mt-0.5 whitespace-pre-wrap text-[13px] text-ink">{item.text}</p>
          </>
        )}
      </div>
    </li>
  );
}

export function HistoryDrawer({ invoice, partners, today, onClose }: { invoice: ManagerInvoiceDto; partners: PartnerDto[]; today: string; onClose: () => void }) {
  const history = useInvoiceHistory(invoice.id);
  const partnerNames = useMemo(() => new Map(partners.map((p) => [p.id, p.name])), [partners]);
  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      eyebrow="Invoice history"
      title={invoiceName(invoice)}
      sub={
        <>
          <StatusChip invoice={invoice} today={today} />
          <span className="text-[12.5px] text-ink-muted">{`₹${inr(invoice.amountInr)} · due ${sheetDate(invoice.dueDate)}`}</span>
        </>
      }
      width={480}
    >
      {history.isLoading ? <SkeletonRows rows={5} className="px-5 py-3" /> : null}
      {history.isError ? (
        <p role="alert" className="m-0 px-5 py-4 text-[13px] text-danger">
          {history.error instanceof Error ? history.error.message : 'Could not load the history.'}
        </p>
      ) : null}
      {history.data && !history.data.items.length ? <EmptyState className="m-5" title="No history on this invoice yet." /> : null}
      {history.data?.items.length ? (
        <ol className="m-0 list-none p-0" aria-label="History, newest first">
          {history.data.items.map((it) => (
            <ItemRow key={`${it.kind}-${it.id}`} item={it} partnerNames={partnerNames} />
          ))}
        </ol>
      ) : null}
    </SidePanel>
  );
}
