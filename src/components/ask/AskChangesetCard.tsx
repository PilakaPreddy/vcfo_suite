'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { decideChangeset, editChangesetRow, fetchChangeset, undoChangeset } from '@/hooks/ask/ask-api';
import type { ChangesetRowView, ChangesetView } from '@/lib/ask/changeset/view-types';
import { ChangesetGroup } from './changeset/ChangesetGroup';
import { ChangesetRow } from './changeset/ChangesetRow';

/**
 * The review card: step, field, old value, new value, source and check result on every row, with
 * Accept or Edit. Nothing is saved until "Save accepted". The server checks everything again at that
 * click and answers with the card as it now stands, so this component only ever shows masked values.
 *
 * A card with rows for more than one destination (a dropped folder, say) shows each destination as a
 * section that folds, with its counts and its own "Accept all clear". A card of more than
 * `FOLD_ABOVE` rows starts with every section folded.
 */

const FOLD_ABOVE = 20;

export function AskChangesetCard({ changesetId }: { changesetId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['ask', 'changeset', changesetId];
  const { data: card, error: loadError } = useQuery({ queryKey, queryFn: () => fetchChangeset(changesetId), retry: false });
  const [accepted, setAccepted] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [folded, setFolded] = useState<Readonly<Record<string, boolean>>>({});

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
  const isClear = (row: ChangesetRowView) => canPick(row) && !row.needsLook;
  const easy = card.rows.filter(isClear);
  const acceptMore = (ids: string[]) => setAccepted((now) => new Set([...now, ...ids]));
  const byId = new Map(card.rows.map((row) => [row.id, row]));
  // An older server may send no groups; the whole card is then one plain list.
  const groups = card.groups?.length ? card.groups : [{ key: 'all', title: card.title, kind: 'values' as const, rowIds: card.rows.map((row) => row.id), counts: { ready: 0, held: 0, applied: 0 } }];
  const sectioned = groups.length > 1 || card.rows.length > FOLD_ABOVE;
  const foldedByDefault = card.rows.length > FOLD_ABOVE;
  const toggle = (id: string) =>
    setAccepted((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const renderRow = (row: ChangesetRowView) => (
    <ChangesetRow
      key={row.id}
      row={row}
      open={open}
      pickable={canPick(row)}
      accepted={accepted.has(row.id) && canPick(row)}
      editing={editing === row.id}
      pending={change.isPending}
      onToggle={() => toggle(row.id)}
      onEdit={() => setEditing(row.id)}
      onCancelEdit={() => setEditing(null)}
      onSaveEdit={(value) => change.mutate(() => editChangesetRow(card.id, row.id, value))}
    />
  );

  return (
    <section aria-label={card.title} className="rounded-md border border-line bg-surface-raised">
      <header className="border-b border-line px-3 py-2">
        <p className="text-[13px] font-semibold text-ink">{card.title}</p>
        {card.tier === 'T3' ? (
          <p className="mt-0.5 text-[12px] text-ink-muted" data-testid="changeset-recipients">
            {card.recipients.length > 0
              ? `Goes to ${card.recipients.map((r) => (r.email ? `${r.name} <${r.email}>` : r.name)).join(', ')} once you accept.`
              : 'Nobody is set up to receive this yet.'}
          </p>
        ) : null}
      </header>
      {sectioned ? (
        <div>
          {groups.map((group) => {
            const rows = group.rowIds.map((id) => byId.get(id)).filter((row): row is ChangesetRowView => Boolean(row));
            const clear = open ? rows.filter(isClear) : [];
            const isFolded = folded[group.key] ?? foldedByDefault;
            return (
              <ChangesetGroup
                key={group.key}
                group={group}
                rows={rows}
                expanded={!isFolded}
                onToggleExpanded={() => setFolded((now) => ({ ...now, [group.key]: !isFolded }))}
                clearCount={clear.length}
                onAcceptClear={() => acceptMore(clear.map((row) => row.id))}
                renderRow={renderRow}
              />
            );
          })}
        </div>
      ) : (
        <ul className="divide-y divide-line">{groups.flatMap((group) => group.rowIds).map((id) => byId.get(id)).filter((row): row is ChangesetRowView => Boolean(row)).map(renderRow)}</ul>
      )}
      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        {open && easy.length > 1 ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => acceptMore(easy.map((row) => row.id))}>
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
