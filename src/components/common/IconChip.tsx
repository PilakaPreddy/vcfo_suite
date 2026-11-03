import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Tones are states, not identities (docs/design/TOKENS.md). `primary` is the
 * brand, the four status tones always travel with a word, `highlight` is the
 * one orange moment per screen region, `neutral` is everything else.
 *
 * The nine categorical hues (emerald, sky, amber, ...) are kept as names so
 * existing callers compile, but they all render neutral now: colour-coding
 * tags, avatars and nav items by hash was the "different colours on every
 * card" the design system removes. Delete them on 2026-11-30.
 */
export type IconChipTone =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'highlight'
  | 'upcoming'
  | 'role'
  | 'neutral'
  | 'emerald'
  | 'sky'
  | 'amber'
  | 'violet'
  | 'rose'
  | 'orange'
  | 'teal'
  | 'pink'
  | 'cyan'
  | 'lime';

type IconChipSize = 'sm' | 'md' | 'lg';

const NEUTRAL = { shell: 'bg-surface-sunken', icon: 'text-ink-muted' };

const TONE: Record<IconChipTone, { shell: string; icon: string }> = {
  primary: { shell: 'bg-brand-soft', icon: 'text-brand-text' },
  success: { shell: 'bg-positive-soft', icon: 'text-positive' },
  warning: { shell: 'bg-warning-soft', icon: 'text-warning' },
  danger: { shell: 'bg-danger-soft', icon: 'text-danger' },
  info: { shell: 'bg-info-soft', icon: 'text-info' },
  highlight: { shell: 'bg-highlight-soft', icon: 'text-highlight' },
  upcoming: { shell: 'bg-upcoming-soft', icon: 'text-upcoming' },
  role: { shell: 'bg-brand-soft', icon: 'text-brand-text' },
  neutral: NEUTRAL,
  emerald: NEUTRAL,
  sky: NEUTRAL,
  amber: NEUTRAL,
  violet: { shell: 'bg-identity-soft', icon: 'text-identity' },
  rose: NEUTRAL,
  orange: { shell: 'bg-highlight-soft', icon: 'text-highlight' },
  teal: { shell: 'bg-waiting-soft', icon: 'text-waiting' },
  pink: NEUTRAL,
  cyan: NEUTRAL,
  lime: NEUTRAL,
};

/** @deprecated Identity colour-coding is gone; every key maps to `neutral`. */
const CATEGORICAL_TONES: IconChipTone[] = ['neutral'];

/** @deprecated Returns `neutral` for every key. Chips no longer carry identity colour. */
export function toneForKey(_key: string): IconChipTone {
  return 'neutral';
}

/** Solid background class per tone — for bars, rails, dots. */
export const TONE_BG: Record<IconChipTone, string> = {
  primary: 'bg-brand',
  success: 'bg-positive',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  highlight: 'bg-highlight-bright',
  upcoming: 'bg-upcoming',
  role: 'bg-brand',
  neutral: 'bg-ink-faint',
  emerald: 'bg-ink-faint',
  sky: 'bg-ink-faint',
  amber: 'bg-ink-faint',
  violet: 'bg-identity',
  rose: 'bg-ink-faint',
  orange: 'bg-highlight-bright',
  teal: 'bg-waiting-mid',
  pink: 'bg-ink-faint',
  cyan: 'bg-ink-faint',
  lime: 'bg-ink-faint',
};

/** Text color class per tone — for glyphs and small labels. */
export const TONE_TEXT: Record<IconChipTone, string> = {
  primary: 'text-brand-text',
  success: 'text-positive',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  highlight: 'text-highlight',
  upcoming: 'text-upcoming',
  role: 'text-brand',
  neutral: 'text-ink-muted',
  emerald: 'text-ink-muted',
  sky: 'text-ink-muted',
  amber: 'text-ink-muted',
  violet: 'text-identity',
  rose: 'text-ink-muted',
  orange: 'text-highlight',
  teal: 'text-waiting',
  pink: 'text-ink-muted',
  cyan: 'text-ink-muted',
  lime: 'text-ink-muted',
};

/** Tinted badge colours per tone: soft ground + text-safe colour. Pair with CHIP_CLASS. */
export const TONE_BADGE: Record<IconChipTone, string> = {
  primary: 'bg-brand-soft text-brand-text',
  success: 'bg-positive-soft text-positive',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  highlight: 'bg-highlight-soft text-highlight',
  upcoming: 'bg-upcoming-soft text-upcoming',
  role: 'bg-brand-soft text-brand-text',
  neutral: 'bg-surface-sunken text-ink-muted',
  emerald: 'bg-surface-sunken text-ink-muted',
  sky: 'bg-surface-sunken text-ink-muted',
  amber: 'bg-surface-sunken text-ink-muted',
  violet: 'bg-identity-soft text-identity',
  rose: 'bg-surface-sunken text-ink-muted',
  orange: 'bg-highlight-soft text-highlight',
  teal: 'bg-waiting-soft text-waiting',
  pink: 'bg-surface-sunken text-ink-muted',
  cyan: 'bg-surface-sunken text-ink-muted',
  lime: 'bg-surface-sunken text-ink-muted',
};

/**
 * The one chip shape (VCFO Spectrum, R-13): 24px high, 9px side padding, 6px corners, 12px/500 text.
 * `CHIP_COLUMN_CLASS` adds the fixed minimum width and centred label for chips
 * that sit in a table column, so the column reads as one block.
 */
export const CHIP_CLASS =
  'inline-flex h-chip items-center gap-[7px] whitespace-nowrap rounded-md px-[9px] text-[12px] font-medium leading-4';
const CHIP_COLUMN_CLASS = 'w-[var(--chip-min-width)] min-w-chip justify-center';

/**
 * One intensity for a state (K-04, rule R-13): a soft chip with a 6px dot in
 * the state's mid colour. Done, in progress, waiting or due, overdue and
 * upcoming all use this shape; never a solid block. The names TONE_SOLID and
 * internToneSolid stay so callers do not change. An OWNER or a tag is a soft
 * tint without a dot (TONE_BADGE above, TONE_OWNER below).
 */
export type StatusKey = 'done' | 'progress' | 'waiting' | 'due' | 'overdue' | 'upcoming';
/* R-13: a 7px square dot (2px corners), never a round one. */
const DOT_BEFORE = "before:inline-block before:h-[7px] before:w-[7px] before:shrink-0 before:rounded-[2px] before:content-['']";
const TONE_SOLID: Record<StatusKey, string> = {
  done: `bg-positive-soft text-positive ${DOT_BEFORE} before:bg-positive-mid`,
  progress: `bg-brand-soft text-brand-text ${DOT_BEFORE} before:bg-brand`,
  waiting: `bg-waiting-soft text-waiting ${DOT_BEFORE} before:bg-waiting-mid`,
  due: `bg-warning-soft text-warning ${DOT_BEFORE} before:bg-warning-mid`,
  overdue: `bg-danger-soft text-danger ${DOT_BEFORE} before:bg-danger-mid`,
  upcoming: `bg-upcoming-soft text-upcoming ${DOT_BEFORE} before:bg-upcoming-mid`,
};
/** Solid chip colours keyed by the IconChipTone names callers already use. */
export const TONE_SOLID_BY_TONE: Partial<Record<IconChipTone, string>> = {
  success: TONE_SOLID.done,
  primary: TONE_SOLID.progress,
  warning: TONE_SOLID.due,
  teal: TONE_SOLID.waiting,
  danger: TONE_SOLID.overdue,
  upcoming: TONE_SOLID.upcoming,
  neutral: TONE_SOLID.upcoming,
  info: TONE_SOLID.progress,
};
export type OwnerKey = 'client' | 'sbc' | 'mca' | 'manager';
/** Owner chips (rule R-14): soft tint with a square dot, 104px wide via OWNER_CHIP_WIDTH.
 *  Client is amber, SBC is blue, MCA is violet. */
const TONE_OWNER: Record<OwnerKey, string> = {
  client: `bg-owner-client-soft text-owner-client ${DOT_BEFORE} before:bg-warning-mid`,
  sbc: `bg-owner-sbc-soft text-owner-sbc ${DOT_BEFORE} before:bg-current`,
  mca: `bg-owner-mca-soft text-owner-mca ${DOT_BEFORE} before:bg-current`,
  manager: `bg-owner-manager-soft text-owner-manager ${DOT_BEFORE} before:bg-waiting-mid`,
};
const OWNER_CHIP_WIDTH = 'w-[104px] min-w-[104px] truncate';
/**
 * The third form of a state, for dense lists (LeetCode's Easy / Medium / Hard): the word
 * alone in its colour at 600, no ground. `cn(STATE_WORD_CLASS, TONE_TEXT.success)`.
 */
export const STATE_WORD_CLASS = 'text-[12px] font-medium whitespace-nowrap';
/** A 7px square dot inside a soft chip, in the state's mid colour (R-13). */
const CHIP_DOT_CLASS = 'inline-block h-[7px] w-[7px] shrink-0 rounded-[2px]';

const SIZE: Record<IconChipSize, { shell: string; icon: string }> = {
  sm: { shell: 'h-6 w-6 rounded-md', icon: 'h-3.5 w-3.5' },
  md: { shell: 'h-8 w-8 rounded-md', icon: 'h-4 w-4' },
  lg: { shell: 'h-10 w-10 rounded-md', icon: 'h-5 w-5' },
};

interface Props {
  icon: LucideIcon;
  tone?: IconChipTone;
  size?: IconChipSize;
  className?: string;
}

/**
 * Tinted icon tile: soft tone ground + text-safe glyph, 6px corners. Neutral by
 * default; a status tone only when the tile means that status.
 */
export function IconChip({ icon: Icon, tone = 'neutral', size = 'md', className }: Props) {
  const t = TONE[tone];
  const s = SIZE[size];
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center', s.shell, t.shell, className)}>
      <Icon className={cn(s.icon, t.icon)} />
    </span>
  );
}
