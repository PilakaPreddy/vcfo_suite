import { TONE_BADGE, TONE_BG, TONE_SOLID_BY_TONE, TONE_TEXT, type IconChipTone } from '@/components/common/IconChip';
import type { ChipTone, Owner } from '@/components/ui/spectrum-chip';
import type { InternChipTone } from '@/lib/intern/intern-work';

function internIconTone(tone: InternChipTone): IconChipTone {
  return tone;
}

export function internToneBadge(tone: InternChipTone): string {
  return TONE_BADGE[internIconTone(tone)];
}

/** Solid fill with on-status text: for a STATE chip in a column. Soft (internToneBadge) is for owners and tags. */
function internToneSolid(tone: InternChipTone): string {
  return TONE_SOLID_BY_TONE[internIconTone(tone)] ?? TONE_BADGE[internIconTone(tone)];
}

function internToneBg(tone: InternChipTone): string {
  return TONE_BG[internIconTone(tone)];
}

function internToneText(tone: InternChipTone): string {
  return TONE_TEXT[internIconTone(tone)];
}

/* A kind is a state, so it wears a status tone (docs/design/TOKENS.md): in flight
   is brand, waiting on someone is warning, late or rejected is danger, done is
   positive. The word on the chip carries the detail. */
export const KIND_TONE: Record<string, InternChipTone> = {
  rejected: 'danger',
  review: 'primary',
  deliver: 'primary',
  overdue: 'danger',
  'in-progress': 'primary',
  'waiting-client': 'warning',
  'waiting-manager': 'warning',
  'waiting-request': 'warning',
  filing: 'warning',
  task: 'primary',
  done: 'success',
};

export function internKindChipLabel(kind: string): string {
  if (kind === 'in-progress') return 'In progress';
  const raw = kind.replaceAll('-', ' ');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/* VCFO Spectrum status chip (R-13) for a work item. The chip keeps to the six status words
   where a kind has one; "Sent back" stays because it names a different state. The full reason
   (`item.why`) goes in the chip title and in the task drawer. */
export function internKindStatus(item: { kind: string; isOverdue?: boolean }): { word: string; tone: ChipTone } {
  switch (item.kind) {
    case 'rejected':
      return { word: 'Sent back', tone: 'bad' };
    case 'overdue':
      return { word: 'Overdue', tone: 'bad' };
    case 'review':
    case 'deliver':
    case 'in-progress':
      return { word: 'In progress', tone: 'prog' };
    case 'waiting-client':
    case 'waiting-manager':
    case 'waiting-request':
      return { word: 'Waiting', tone: 'teal' };
    case 'filing':
      return item.isOverdue ? { word: 'Overdue', tone: 'bad' } : { word: 'Due soon', tone: 'warn' };
    case 'task':
      return item.isOverdue ? { word: 'Overdue', tone: 'bad' } : { word: 'In progress', tone: 'prog' };
    case 'done':
      return { word: 'Done', tone: 'ok' };
    default:
      return { word: internKindChipLabel(item.kind), tone: 'idle' };
  }
}

/** Who holds a waiting item, for the owner chip (R-14). Undefined when the lead holds it. */
export function internKindOwner(kind: string): Owner | undefined {
  if (kind === 'waiting-client' || kind === 'waiting-request') return 'client';
  if (kind === 'waiting-manager') return 'manager';
  return undefined;
}
