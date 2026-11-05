/**
 * LABOUR REGISTERS — the screens' own tokens.
 *
 * These are the values read out of the reference the owner supplied
 * (`Labour_Registers___VCFO_Track.html`), not VCFO Spectrum's. They differ on nearly every
 * count: a blue action colour rather than the blurple, twelve-pixel cards with a single-pixel
 * edge and no shadow rather than six with two, forty-four-pixel controls rather than
 * thirty-six, content-width chips rather than the fixed 104, and the system font stack rather
 * than Roboto.
 *
 * **They are scoped to this feature on purpose.** Putting them in `app/globals.css` or
 * `tailwind.config.ts` would repaint incorporation, the compliance calendar, the client portal
 * and all six shells — every screen in the product, most of which nobody has looked at in this
 * light. Until somebody decides the whole product moves, the two systems coexist and the seam
 * is this file.
 *
 * If that decision is made, this file is what gets deleted: move the values into the Tailwind
 * config, drop `lrTheme` from the wrappers, and the components fall back to the shared tokens.
 */

/** The custom properties the feature's components read. Applied by `LabourRegistersTheme`. */
export const LR_TOKENS = {
  '--lr-canvas': '#f5f7fa',
  '--lr-surface': '#ffffff',
  '--lr-raised': '#eef1f5',
  '--lr-line': '#e3e7ed',
  '--lr-line-2': '#d6dbe3',
  '--lr-ink': '#1f2733',
  '--lr-ink-2': '#3a4350',
  '--lr-muted': '#4a5462',
  '--lr-faint': '#5b6472',
  '--lr-primary': '#1660d8',
  '--lr-primary-deep': '#1453b8',
  '--lr-primary-soft': '#e8f0fe',
  '--lr-ok': '#0b7a43',
  '--lr-ok-soft': '#dff5e7',
  '--lr-warn': '#9a4d00',
  '--lr-warn-soft': '#fff0d9',
  '--lr-bad': '#c0182f',
  '--lr-bad-soft': '#ffe6e9',
  '--lr-info': '#06708c',
  '--lr-info-soft': '#dff3f9',
  /* The register-green the reference uses for "due" states and the Shops and Establishments act. */
  '--lr-reg': '#6ba815',
  '--lr-reg-soft': 'rgba(107,184,21,0.12)',
  '--lr-radius-card': '12px',
  '--lr-radius-control': '8px',
  '--lr-radius-chip': '6px',
  '--lr-h-control': '44px',
  '--lr-font': 'system-ui, -apple-system, "Segoe UI", sans-serif',
  '--lr-mono': 'ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

/** Ready-made class strings, so the same card is not written two ways on two screens. */
export const lr = {
  page: 'text-[var(--lr-ink)] [font-family:var(--lr-font)]',
  card: 'rounded-[var(--lr-radius-card)] border border-[var(--lr-line)] bg-[var(--lr-surface)]',
  /** A tile inside a card: the folder rows of the register directory. */
  tile: 'rounded-[var(--lr-radius-control)] border border-[var(--lr-line)] bg-[var(--lr-surface)]',
  primary:
    'inline-flex h-[var(--lr-h-control)] items-center justify-center gap-2 rounded-[var(--lr-radius-control)] bg-[var(--lr-primary)] px-[18px] text-[15px] font-semibold text-white hover:bg-[var(--lr-primary-deep)] disabled:opacity-40',
  /** The reference's secondary is a blue outline on white, not a grey one. */
  secondary:
    'inline-flex h-[var(--lr-h-control)] items-center justify-center gap-2 rounded-[var(--lr-radius-control)] border border-[var(--lr-primary)] bg-[var(--lr-surface)] px-4 text-[15px] font-semibold text-[var(--lr-primary)]',
  quiet:
    'inline-flex h-[var(--lr-h-control)] items-center justify-center gap-2 rounded-[var(--lr-radius-control)] border border-[var(--lr-line-2)] bg-[var(--lr-surface)] px-4 text-[15px] font-medium text-[var(--lr-ink)]',
  link: 'inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--lr-primary)] hover:underline',
  chip: 'inline-flex h-6 items-center rounded-[var(--lr-radius-chip)] px-2.5 text-[13px] font-semibold',
  title: 'text-[26px] font-bold leading-[34px] text-[var(--lr-ink)]',
  heading: 'text-[20px] font-bold leading-7 text-[var(--lr-ink)]',
  cardTitle: 'text-base font-semibold leading-6 text-[var(--lr-ink)]',
  body: 'text-[15px] leading-6 text-[var(--lr-muted)]',
  small: 'text-[13px] leading-5 text-[var(--lr-faint)]',
  code: 'text-[13px] [font-family:var(--lr-mono)]',
  /* The mono kicker above a page title: "Batch TG-2026-09 · version 2". */
  eyebrow:
    'text-[10.5px] uppercase tracking-[0.18em] text-[var(--lr-faint)] [font-family:var(--lr-mono)]',
  /* A card's own header strip, with its hairline below. */
  cardHead: 'flex items-center gap-2.5 border-b border-[var(--lr-raised)] px-4 py-3',
  /* The uppercase label inside that strip. The reference does not use title case there. */
  headLabel: 'text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--lr-muted)]',
  /* A field label above a value, in the provenance row and the form controls. */
  fieldLabel: 'text-[12px] font-medium leading-4 text-[var(--lr-faint)]',
  fieldValue: 'text-[14px] font-medium leading-[22px] tabular-nums text-[var(--lr-ink)]',
  /* The reference's select: 36px, card radius, hairline. */
  select:
    'h-9 rounded-[var(--lr-radius-card)] border border-[var(--lr-line)] bg-[var(--lr-surface)] px-2.5 text-[13px] text-[var(--lr-ink)] [font-family:inherit]',
} as const;

/** The soft/ink pair for a tinted surface — a stat tile, a banner, an icon chip. */
export const LR_TONES = {
  neutral: { soft: 'var(--lr-canvas)', ink: 'var(--lr-muted)' },
  ok: { soft: 'var(--lr-ok-soft)', ink: 'var(--lr-ok)' },
  warn: { soft: 'var(--lr-warn-soft)', ink: 'var(--lr-warn)' },
  bad: { soft: 'var(--lr-bad-soft)', ink: 'var(--lr-bad)' },
  info: { soft: 'var(--lr-info-soft)', ink: 'var(--lr-info)' },
  blue: { soft: 'var(--lr-primary-soft)', ink: 'var(--lr-primary-deep)' },
  reg: { soft: 'var(--lr-reg-soft)', ink: 'var(--lr-reg)' },
} as const;

export type LrTone = keyof typeof LR_TONES;

/**
 * The six status words, in the reference's chip colours.
 *
 * "Waiting" reads red rather than amber, which looks wrong until you see what it means here:
 * a register that cannot be built because an input is missing or a column is unmapped. That is
 * a stop, not a soon. "Due soon" is the amber one.
 */
export function statusTone(word: string): LrTone {
  switch (word.toLowerCase()) {
    case 'done':
      return 'ok';
    case 'overdue':
    case 'waiting':
      return 'bad';
    case 'due soon':
      return 'warn';
    case 'in progress':
    case 'not started':
    case 'upcoming':
      return 'info';
    default:
      return 'neutral';
  }
}
