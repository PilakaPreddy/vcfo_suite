'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, ListChecks, Mail, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { Input } from '@/components/ui/input';
import { PopoverCard } from '@/components/ui/popover';
import { toastError, toastSuccess } from '@/lib/toast-errors';
import type { ManagerSheetDto } from '@/lib/receivables/wire';
import { usePendingChanges, type useReceivablesActions } from '@/hooks/use-receivables';
import { stamp } from '../../format';
import { ComposeSummary } from '../ComposeSummary';
import { ShareDialog } from '../ShareDialog';
import { changeDiff } from './change-text';

type Actions = ReturnType<typeof useReceivablesActions>;

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

/**
 * The publish bar (Phase 10): whether the draft differs from the client page, a "What changes"
 * list of exactly what the next Update publishes, an optional Update note, the Update button
 * (main button while there is something to publish, a plain "Up to date" mark otherwise) and the
 * last published stamp. Send email, Share and Copy link stay at the right.
 */
export function PublishBar({ data, actions }: { data: ManagerSheetDto; actions: Actions }) {
  const [open, setOpen] = useState<'email' | 'share' | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [note, setNote] = useState('');
  const dirty = data.unpublishedChanges;
  const v = data.latestVersion;
  const changes = usePendingChanges(data.sheet.id, listOpen && dirty > 0, dirty);
  const partnerNames = useMemo(() => new Map(data.partners.map((p) => [p.id, p.name])), [data.partners]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.publicUrl);
      toastSuccess('Client link copied', data.publicUrl);
    } catch {
      toastError('Could not copy', data.publicUrl);
    }
  };
  const publish = () =>
    actions.publish.mutate(note.trim() || undefined, {
      onSuccess: () => {
        setNote('');
        setListOpen(false);
        toastSuccess('Published', 'The client page now shows this version.');
      },
      onError: (e) => toastError('Update failed', errorText(e)),
    });

  return (
    <section aria-label="Publish" className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-md border-2 border-line bg-surface-raised px-4 py-3">
      <div className="flex min-w-0 flex-[1_1_360px] flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px]">
        {dirty ? <Chip raw tone="warn">{`Draft · ${dirty} change${dirty === 1 ? '' : 's'}`}</Chip> : <Chip raw tone="ok">Published</Chip>}
        {dirty ? (
          <PopoverCard
            open={listOpen}
            onOpenChange={setListOpen}
            width={440}
            label="What the next Update changes"
            title={`What Update changes · ${dirty}`}
            footer={<span className="mr-auto text-[12px] text-ink-muted">Pauses and notes never show on the client page, so they are not listed.</span>}
            trigger={
              <Button size="sm" variant="quiet">
                <ListChecks aria-hidden />
                What changes
              </Button>
            }
          >
            {changes.isLoading ? <div className="m-4 h-16 animate-pulse rounded-md bg-surface-sunken" aria-busy="true" /> : null}
            {changes.isError ? (
              <p role="alert" className="m-0 px-4 py-3 text-[13px] text-danger">
                {errorText(changes.error)}
              </p>
            ) : null}
            {changes.data ? (
              <ol className="m-0 list-none p-0">
                {changes.data.changes.map((c) => {
                  const diff = changeDiff(c, partnerNames);
                  return (
                    <li key={c.id} className="border-t border-line-soft px-4 py-2 first:border-0">
                      <div className="text-[13px] text-ink">{c.summary}</div>
                      {diff ? <div className="text-[12px] tabular-nums text-ink-2">{diff}</div> : null}
                      <div className="text-[11.5px] text-ink-muted">{`${c.actorName ? `${c.actorName} · ` : ''}${stamp(c.createdAt)}`}</div>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </PopoverCard>
        ) : null}
        <span className="min-w-0 text-ink-muted">
          {v ? (
            <>
              {`Last published ${stamp(v.publishedAt)}`}
              {v.publishedByName ? ` by ${v.publishedByName}` : ''}
              <span className="font-mono text-[12px]">{` · v${v.seq}`}</span>
            </>
          ) : (
            'Nothing published yet. The client page is empty until the first Update.'
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {dirty ? (
          <>
            <Input
              aria-label="Update note"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !actions.publish.isPending && publish()}
              placeholder="Update note (optional)"
              className="h-control-md w-[200px] text-[13px]"
            />
            <Button onClick={publish} disabled={actions.publish.isPending}>
              {actions.publish.isPending ? 'Publishing…' : `Update · ${dirty}`}
            </Button>
          </>
        ) : (
          <Button variant="secondary" disabled className="text-ink-muted disabled:opacity-100" title="The client page already shows the draft">
            <Check className="text-positive" aria-hidden />
            Up to date
          </Button>
        )}
        <Button variant="secondary" onClick={() => setOpen('email')}>
          <Mail aria-hidden />
          Send email
        </Button>
        <Button variant="secondary" onClick={() => setOpen('share')}>
          <Share2 aria-hidden />
          Share
        </Button>
        <Button variant="quiet" onClick={copy}>
          <Copy aria-hidden />
          Copy link
        </Button>
      </div>
      {open === 'email' ? <ComposeSummary data={data} actions={actions} onClose={() => setOpen(null)} /> : null}
      {open === 'share' ? <ShareDialog data={data} onClose={() => setOpen(null)} onEmail={() => setOpen('email')} /> : null}
    </section>
  );
}
