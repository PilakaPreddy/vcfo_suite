'use client';

import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import type { MeetingListRow } from '@/lib/board-meetings/wire';

const TONE: Record<MeetingListRow['word'], ChipTone> = {
  'Not started': 'idle',
  'In progress': 'prog',
  Waiting: 'teal',
  'Due soon': 'warn',
  Overdue: 'bad',
  Done: 'ok',
};

/** The six-word status of a meeting row in lists. */
export function MeetingWord({ word }: { word: MeetingListRow['word'] }) {
  return (
    <Chip tone={TONE[word]} fixed raw>
      {word}
    </Chip>
  );
}
