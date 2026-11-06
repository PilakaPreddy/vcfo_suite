'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { decideChangeset, editChangesetRow, fetchChangeset, undoChangeset } from '@/hooks/ask/ask-api';
import type { ChangesetRowView, ChangesetView } from '@/lib/ask/changeset/view-types';

/**
 * The review card: step, field, old value, new value, source and check result on every row, with
 * Accept or Edit. Nothing is saved until "Save accepted". The server checks everything again at that
 * click and answers with the card as it now stands, so this component only ever shows masked values.
 */

const ROW_WORD: Partial<Record<ChangesetRowView['status'], { word: string; tone: ChipTone }>> = {
  applied: { word: 'Saved', tone: 'ok' },
  undone: { word: 'Undone', tone: 'idle' },
  failed: { word: 'Not saved', tone: 'bad' },
  skipped: { word: 'Skipped', tone: 'idle' },
};

function rowChip(row: ChangesetRowView): { word: string; tone: ChipTone } {
  const done = ROW_WORD[row.status];
  if (done) return done;
  if (row.heldReason || row.status === 'held') return { word: 'Held', tone: 'warn' };
  if (!row.canDecide) return { word: 'For the manager', tone: 'prog' };
  if (!row.canAccept) return { word: 'Needs your answer', tone: 'warn' };
  if (row.needsLook) return { word: 'Check this', tone: 'warn' };
  return { word: 'Checks passed', tone: 'ok' };
}

function RowEditor({ row, pending, onSave, onCancel }: { row: ChangesetRowView; pending: boolean; onSave: (value: string) => void; onCancel: () => void }) {
  // A sensitive value is shown masked, so an edit starts empty and is typed in full.
  const [value, setValue] = useState(row.sensitive ? '' : row.inputType === 'choice' ? (row.options?.find((o) => o.label === row.displayNew)?.value ?? '') : row.displayNew);
  const label = `New value for ${row.label}`;
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onSave(value);
      }}
    >
      {row.inputType === 'choice' ? (
        <select aria-label={label} value={value} onChange={(e) => setValue(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-line-strong bg-surface-raised px-2 text-[13px] text-ink">
          <option value="">Choose…</option>
          {row.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-label={label}
          type={row.inputType === 'date' ? 'date' : 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          className="h-8 min-w-0 flex-1 rounded-md border border-line-strong bg-surface-raised px-2 text-[13px] text-ink"
        />
      )}
      <Button type="submit" size="sm" variant="outline" disabled={pending || !value.trim()}>
        Use this
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

export function AskChangesetCard({ changesetId }: { changesetId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['ask', 'changeset', changesetId];
  const { data: card, error: loadError } = useQuery({ queryKey, queryFn: () => fetchChangeset(changesetId), retry: false });
  const [accepted, setAccepted] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: (run: () => Promise<ChangesetView>) => run(),
    onSuccess: (view) => {
      queryClient.setQueryData(queryKey, view);
      setEditing(null);
    },
  });

  if (loadError) return <p className="rounded-md bg-surface-sunken px-3 py-2 text-[13px] text-ink-muted">This card is not available.</p>;
  if (!card) return null;

  const open = card.status === 'proposed' || card.status === 'partly_applied';
  const canPick = (row: ChangesetRowView) => open && row.canDecide && row.canAccept && !row.heldReason;
  const chosen = card.rows.filter((row) => accepted.has(row.id) && canPick(row));
  const easy = card.rows.filter((row) => canPick(row) && !row.needsLook);
  const toggle = (id: string) =>
    setAccepted((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <section aria-label={card.title} className="rounded-md border border-line bg-surface-raised">
      <header className="border-b border-line px-3 py-2">
        <p className="text-[13px] font-semibold text-ink">{card.title}</p>
      </header>
      <ul className="divide-y divide-line">
        {card.rows.map((row) => {
          const chip = rowChip(row);
          const failed = row.checks.filter((check) => !check.ok && check.message);
          const notes = row.error ? [row.error] : failed.map((check) => check.message!);
          const isAccepted = accepted.has(row.id) && canPick(row);
          return (
            <li key={row.id} className="px-3 py-2.5" data-testid="changeset-row">
              <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">{row.label}</p>
                  {row.stepTitle ? <p className="text-[12px] text-ink-muted">{row.stepTitle}</p> : null}
                </div>
                <Chip tone={chip.tone}>{chip.word}</Chip>
              </div>
              <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-[13px]">
                <dt className="text-ink-muted">Saved</dt>
                <dd className="min-w-0 break-words text-ink-muted">{row.displayOld || 'Empty'}</dd>
                <dt className="text-ink-muted">New</dt>
                <dd className="min-w-0 break-words font-medium text-ink">{row.displayNew || 'Waiting for your answer'}</dd>
                {row.source ? (
                  <>
                    <dt className="text-ink-muted">From</dt>
                    <dd className="min-w-0 break-words text-ink-muted">{row.source}</dd>
                  </>
                ) : null}
              </dl>
              {notes.map((note) => (
                <p key={note} className="mt-1 text-[12px] text-ink-muted">
                  {note}
                </p>
              ))}
              {editing === row.id ? (
                <RowEditor row={row} pending={change.isPending} onCancel={() => setEditing(null)} onSave={(value) => change.mutate(() => editChangesetRow(card.id, row.id, value))} />
              ) : open && row.canDecide && (row.status !== 'applied') ? (
                <div className="mt-2 flex gap-2">
                  {canPick(row) ? (
                    <Button type="button" size="sm" variant={isAccepted ? 'default' : 'outline'} aria-pressed={isAccepted} onClick={() => toggle(row.id)}>
                      {isAccepted ? 'Accepted' : 'Accept'}
                    </Button>
                  ) : null}
                  {row.editable ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(row.id)}>
                      Edit
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        {open && easy.length > 1 ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setAccepted(new Set(easy.map((row) => row.id)))}>
            Accept all clear rows
          </Button>
        ) : null}
        {open && card.rows.some((row) => row.canDecide) ? (
          <>
            <Button
              type="button"
              size="sm"
              disabled={chosen.length === 0 || change.isPending}
              onClick={() => change.mutate(() => decideChangeset(card.id, { contentHash: card.contentHash, accept: chosen.map((row) => row.id) }))}
            >
              Save accepted{chosen.length > 0 ? ` (${chosen.length})` : ''}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={change.isPending} onClick={() => change.mutate(() => decideChangeset(card.id, { reject: true }))}>
              Discard
            </Button>
          </>
        ) : null}
        {card.canUndo ? (
          <Button type="button" size="sm" variant="outline" disabled={change.isPending} onClick={() => change.mutate(() => undoChangeset(card.id))}>
            Undo
          </Button>
        ) : null}
        {card.status === 'rejected' ? <p className="text-[12px] text-ink-muted">Discarded. Nothing was saved.</p> : null}
        {card.status === 'expired' ? <p className="text-[12px] text-ink-muted">This card expired. Please send the details again.</p> : null}
        {change.error ? (
          <p role="alert" className="w-full text-[12px] text-danger">
            {(change.error as Error).message}
          </p>
        ) : null}
      </footer>
    </section>
  );
}
