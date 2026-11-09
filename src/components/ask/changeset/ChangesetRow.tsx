'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import type { ChangesetRowView } from '@/lib/ask/changeset/view-types';

/** One row of the review card: label, where it goes, old and new value, source, checks and its buttons. */

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

export interface ChangesetRowProps {
  row: ChangesetRowView;
  /** The card is still open for decisions. */
  open: boolean;
  /** The row can be ticked: open, decidable, clear of checks and not held. */
  pickable: boolean;
  accepted: boolean;
  editing: boolean;
  pending: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (value: string) => void;
}

export function ChangesetRow({ row, open, pickable, accepted, editing, pending, onToggle, onEdit, onCancelEdit, onSaveEdit }: ChangesetRowProps) {
  const chip = rowChip(row);
  const failed = row.checks.filter((check) => !check.ok && check.message);
  const notes = row.error ? [row.error] : failed.map((check) => check.message!);
  // A file row is labelled with its file name, so "From" would only repeat it.
  const showSource = row.source && row.source !== row.label;
  return (
    <li className="px-3 py-2.5" data-testid="changeset-row">
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <div className="min-w-0">
          <p className="break-words text-[13px] font-medium text-ink">{row.label}</p>
          {row.stepTitle ? <p className="text-[12px] text-ink-muted">{row.stepTitle}</p> : null}
        </div>
        <Chip tone={chip.tone}>{chip.word}</Chip>
      </div>
      <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-[13px]">
        <dt className="text-ink-muted">Saved</dt>
        <dd className="min-w-0 break-words text-ink-muted">{row.displayOld || 'Empty'}</dd>
        <dt className="text-ink-muted">New</dt>
        <dd className="min-w-0 break-words font-medium text-ink">{row.displayNew || 'Waiting for your answer'}</dd>
        {showSource ? (
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
      {editing ? (
        <RowEditor row={row} pending={pending} onCancel={onCancelEdit} onSave={onSaveEdit} />
      ) : open && row.canDecide && row.status !== 'applied' ? (
        <div className="mt-2 flex gap-2">
          {pickable ? (
            <Button type="button" size="sm" variant={accepted ? 'default' : 'outline'} aria-pressed={accepted} onClick={onToggle}>
              {accepted ? 'Accepted' : 'Accept'}
            </Button>
          ) : null}
          {row.editable ? (
            <Button type="button" size="sm" variant="ghost" onClick={onEdit}>
              Edit
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
