import { cn } from '@/lib/utils';
import { UserFace } from '@/components/common/UserFace';

export interface StackPerson {
  name: string;
  /** Photo URL, when the person has one. Initials show otherwise. */
  src?: string | null;
}

/** "Asha Rao" gives "AR"; one word gives its first two letters. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

/**
 * V3 stacked people (VCFO Spectrum B-25): circles in one of seven soft tones picked from the
 * name, with a ring in the panel colour, overlapping,
 * up to `max` faces and then "+n". The whole stack has one name for screen readers and a tooltip
 * with every name. People are circles; companies are 6px squares and never use this.
 */
export function AvatarStack({
  people,
  max = 3,
  size = 24,
  label,
  className,
}: {
  /** Names, or people with a photo. */
  people: Array<string | StackPerson>;
  max?: number;
  size?: 24 | 30;
  /** Screen reader name; every name joined with commas by default. */
  label?: string;
  className?: string;
}) {
  const list = people.map((p) => (typeof p === 'string' ? { name: p } : p)).filter((p) => p.name.trim());
  if (list.length === 0) return null;
  const shown = list.slice(0, max);
  const more = list.length - shown.length;
  const all = label ?? list.map((p) => p.name).join(', ');
  // Overlap stays under a fifth of the circle so two-letter initials are never covered by the next ring.
  const overlap = size === 24 ? '-ml-1' : '-ml-1.5';
  const box = size === 24 ? 'h-6 w-6 text-[10px]' : 'h-[30px] w-[30px] text-[11px]';
  return (
    <span className={cn('inline-flex flex-none items-center', className)} role="img" aria-label={all} title={all}>
      {shown.map((p, i) => (
        <UserFace
          key={`${p.name}-${i}`}
          src={p.src}
          initials={initialsOf(p.name)}
          toneFrom={p.name}
          className={cn(box, 'font-medium ring-2 ring-surface-raised', i > 0 && overlap)}
        />
      ))}
      {more > 0 ? (
        <span
          className={cn(
            'inline-grid flex-none place-items-center rounded-full bg-surface-sunken font-medium text-ink-2 ring-2 ring-surface-raised',
            box,
            overlap,
          )}
          aria-hidden
        >
          +{more}
        </span>
      ) : null}
    </span>
  );
}
