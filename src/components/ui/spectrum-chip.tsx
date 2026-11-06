import * as React from 'react';
import { cn } from '@/lib/utils';
import { regOf, type Regulator } from '@/lib/ui/regulator';

/* VCFO Spectrum chips (prototype src/components/ui/Chip.tsx). One file holds the status chip
   (R-13), the owner chip (R-14), the area pill (R-43) and the plain tag, so every portal draws
   them the same way. Colours come from the shared tokens only. */

export type ChipTone = 'ok' | 'warn' | 'bad' | 'prog' | 'idle' | 'violet' | 'teal';

const TONES: Record<ChipTone, string> = {
  ok: 'bg-positive-soft text-positive',
  warn: 'bg-warning-soft text-warning',
  bad: 'bg-danger-soft text-danger',
  prog: 'bg-brand-soft text-brand-text',
  idle: 'bg-upcoming-soft text-upcoming',
  violet: 'bg-identity-soft text-identity',
  teal: 'bg-waiting-soft text-waiting',
};
const DOTS: Record<ChipTone, string> = {
  ok: 'bg-positive-mid',
  warn: 'bg-warning-mid',
  bad: 'bg-danger-mid',
  prog: 'bg-brand',
  idle: 'bg-upcoming-mid',
  violet: 'bg-identity-mid',
  teal: 'bg-waiting-mid',
};

/** Map a status word to a tone. Six meanings: not started, in progress, waiting, due soon, overdue, done. */
export function toneFor(status: string): ChipTone {
  const s = status.toLowerCase();
  /* R-13: "Not started" is grey. Words that say "not yet" are checked first, because "started",
     "due", "asked", "filed", "paid" and "complete" inside them would pick another tone. */
  if (/(^|\b)(not[- ](started|due|asked|yet|filed|sent|begun)|unpaid|unfiled|incomplete|upcoming|planned|scheduled|queued)\b/.test(s)) return 'idle';
  if (/(done|complete|filed|approved|granted|active|paid|closed|resolved|\bok\b|healthy|connected|live|verified|on track)/.test(s)) return 'ok';
  if (/(overdue|late|fail|error|rejected|blocked|stuck|critical|down|expired|sent back|missing)/.test(s)) return 'bad';
  if (/(waiting|pending|with client|with sbc|with mca|hold|needs|asked|sent|awaiting)/.test(s)) return 'teal';
  if (/(due|soon|warn|degraded|expir|risk)/.test(s)) return 'warn';
  if (/(progress|current|running|filing|review|started|working|processing|open|mca)/.test(s)) return 'prog';
  return 'idle';
}

/**
 * R-13 (A-06): six words only. A synonym collapses to one of the six (Filed is Done, Upcoming is
 * Not started, Pending is Waiting). A word with extra meaning (Sent back, Stuck, At risk) collapses
 * too, and the original word is kept as a `note` that the chip shows in grey after itself.
 * The third value marks the rows that keep a note.
 */
const SIX: Array<[RegExp, string, boolean?]> = [
  [/^(done|complete|completed|filed|approved|granted|paid|registered|closed|resolved|verified|acknowledged|signed)$/i, 'Done'],
  [/^(not started|not-started|upcoming|planned|scheduled|not asked|not due)$/i, 'Not started'],
  [/^(waiting|with client|waiting on client|waiting on the client|pending|pending with client|awaiting client|asked|sent|on hold)$/i, 'Waiting'],
  [/^(proof pending|needs input|needs re-auth)$/i, 'Waiting', true],
  [/^(due|due soon|due this week|due today|due tomorrow)$/i, 'Due soon'],
  [/^(at risk)$/i, 'Due soon', true],
  [/^(overdue|late)$/i, 'Overdue'],
  [/^(stuck|sent back|rejected|expired|failed|missing)$/i, 'Overdue', true],
  [/^(in progress|in-progress|in review|under review|review|processing|filing|drafting)$/i, 'In progress'],
];

/** The six-word form of a status, and the original word as a note when it carries extra meaning. */
export function statusParts(s: string): { word: string; note?: string } {
  const t = s.trim();
  const hit = SIX.find(([re]) => re.test(t));
  if (!hit) return { word: s };
  return { word: hit[1], note: hit[2] ? t : undefined };
}

/** The six-word form of a status; a word outside the table stays as it is. */
export function statusWord(s: string): string {
  return statusParts(s).word;
}

const CHIP = 'inline-flex h-chip flex-none items-center gap-[7px] whitespace-nowrap rounded-md px-[9px] text-[12px] font-medium';

/**
 * R-13: status chip. 24px high, 6px corners, 104px wide, 7px square dot, 12px weight 500.
 * A string child is shown as one of the six words, with the tone of that word. `raw` keeps the
 * word as given (developer service health is not a task status). `note={false}` hides the grey
 * note for tight cells; the original word stays in the tooltip.
 */
export function Chip({
  tone,
  fixed,
  dot = true,
  raw,
  note = true,
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone; fixed?: boolean; dot?: boolean; raw?: boolean; note?: boolean }) {
  const parts = typeof children === 'string' && !raw ? statusParts(children) : undefined;
  const word = parts ? parts.word : children;
  const t = tone ?? (typeof word === 'string' ? toneFor(word) : 'idle');
  const chip = (
    <span
      title={typeof children === 'string' && word !== children ? children : undefined}
      className={cn(CHIP, TONES[t], fixed ? 'w-[104px] overflow-hidden' : 'min-w-[104px]', className)}
      {...rest}
    >
      {dot ? <i className={cn('h-[7px] w-[7px] flex-none rounded-[2px]', DOTS[t])} aria-hidden /> : null}
      <span className="min-w-0 truncate">{word}</span>
    </span>
  );
  if (!parts?.note || !note) return chip;
  return (
    <span className="inline-flex max-w-full flex-none items-center gap-1.5">
      {chip}
      <span className="truncate text-[12px] text-ink-muted">{parts.note}</span>
    </span>
  );
}

export type Owner = 'client' | 'sbc' | 'mca' | 'manager';
const OWNER: Record<Owner, [string, string, string]> = {
  client: ['bg-owner-client-soft text-owner-client', 'bg-warning-mid', 'Client'],
  sbc: ['bg-owner-sbc-soft text-owner-sbc', 'bg-info-mid', 'SBC'],
  mca: ['bg-owner-mca-soft text-owner-mca', 'bg-identity-mid', 'MCA'],
  manager: ['bg-owner-manager-soft text-owner-manager', 'bg-waiting-mid', 'Manager'],
};

/** R-14: owner chip, 104px. Client amber, SBC blue, MCA violet. */
export function OwnerChip({ owner, label, className }: { owner: Owner; label?: string; className?: string }) {
  const [cls, dot, word] = OWNER[owner];
  return (
    <span className={cn(CHIP, 'w-[104px] overflow-hidden', cls, className)}>
      <i className={cn('h-[7px] w-[7px] flex-none rounded-[2px]', dot)} aria-hidden />
      <span className="min-w-0 truncate">{label ?? word}</span>
    </span>
  );
}

const SWATCH: Record<Regulator, string> = {
  mca: 'bg-reg-mca',
  gst: 'bg-reg-gst',
  it: 'bg-reg-it',
  payroll: 'bg-reg-payroll',
  fema: 'bg-reg-fema',
  labour: 'bg-reg-labour',
};

/** The short name of a regulator: an area pill and an area tab read "MCA", never the act's name. */
export const REG_WORD: Record<Regulator, string> = { mca: 'MCA', gst: 'GST', it: 'Income tax', payroll: 'Payroll', fema: 'FEMA', labour: 'Labour' };

/** R-43: area pill. 24px, 6px corners, 1.5px edge, white fill, 104px, 8px swatch. The text stays ink. */
export function AreaPill({ area, reg, className }: { area: string; reg?: Regulator; className?: string }) {
  const r = reg ?? regOf(area);
  return (
    <span
      className={cn(
        'inline-flex h-chip w-[104px] flex-none items-center gap-1 overflow-hidden whitespace-nowrap rounded-md border-1.5 border-line bg-surface-raised px-[7px] text-[12px] font-medium text-ink-2',
        className,
      )}
    >
      <i className={cn('h-2 w-2 flex-none rounded-[2px]', r ? SWATCH[r] : 'bg-upcoming-mid')} aria-hidden />
      <span className="min-w-0 truncate">{r ? REG_WORD[r] : area}</span>
    </span>
  );
}

/** Soft tag without a dot, for categories. A regulator word becomes an area pill (R-43). */
export function Tag({ tone = 'idle', className, children }: { tone?: ChipTone; className?: string; children: React.ReactNode }) {
  if (typeof children === 'string' && regOf(children)) return <AreaPill area={children} className={className} />;
  return <span className={cn('inline-flex h-chip items-center whitespace-nowrap rounded-md px-2 text-[12px] font-medium', TONES[tone], className)}>{children}</span>;
}
