/**
 * LABOUR REGISTERS — what differs between one archetype's sheet and another's.
 *
 * Thirty-four prescribed forms reduce to seven shapes, and once the shared frame in
 * `scaffold.ts` is written, the shapes differ in remarkably little: which way up the page is,
 * how far across to freeze, how wide a column of each sort should be, and how tall a row.
 * So the difference is held here as data rather than as five near-identical renderers that
 * would drift apart the first time one of them was touched.
 *
 * Two things are deliberately **not** in this table:
 *
 *  - **Whether there is a day grid.** That is a property of the form, not the archetype.
 *    `in-mw-muster` is a `musterRoll` with no day columns at all — it summarises with "Period
 *    of work" and "Total no. of actual working days" — so the writer asks the projected table
 *    whether it has grid columns rather than asking what archetype it is.
 *  - **Number formats.** Those follow the field's `kind`, which is a property of the data, and
 *    a rupee figure formats the same way on every form.
 */
import type { FieldKind } from '@/data/labour-registers/fields';
import type { FormArchetype } from '@/data/labour-registers/types';

export interface ArchetypeLayout {
  orientation: 'portrait' | 'landscape';
  /**
   * The last identity column to keep on screen, and to repeat down the left of a printed page.
   * Everything up to and including this field is frozen; scrolling right keeps it in view.
   */
  freezeAfterField: string;
  widths: {
    /** A serial number or an employee code. */
    narrow: number;
    /** A name, a designation, a free-text column. */
    text: number;
    /** A rupee figure, a count of hours or days. */
    number: number;
    /** One day of an attendance grid: a single letter. */
    day: number;
    /** Room for a signature or a thumb impression. */
    signature: number;
  };
  rowHeight: number;
}

const COMMON = {
  widths: { narrow: 6, text: 22, number: 13, day: 3.6, signature: 20 },
  rowHeight: 18,
};

/**
 * Deferred archetypes carry an entry that throws rather than being absent from the table.
 *
 * A missing key would be a type error at the call site and a silent `undefined` at runtime;
 * this way the failure says what it is, and adding `wageSlip` later is an entry here plus a
 * body shape rather than a new pipeline.
 */
export class ArchetypeNotBuilt extends Error {
  readonly archetype: FormArchetype;
  constructor(archetype: FormArchetype) {
    super(
      `The ${archetype} archetype has no layout. Every archetype in the catalogue now has one; reaching this means a new archetype was added without an entry in ARCHETYPE_LAYOUT.`,
    );
    this.name = 'ArchetypeNotBuilt';
    this.archetype = archetype;
  }
}

const ARCHETYPE_LAYOUT: Record<FormArchetype, ArchetypeLayout | null> = {
  /* Up to 26 columns of money. Landscape, frozen past the name. */
  wages: { ...COMMON, orientation: 'landscape', freezeAfterField: 'name' },

  /* Identity, then up to 31 day columns. Always landscape, even for the one with no grid:
     a roll is read across. */
  musterRoll: { ...COMMON, orientation: 'landscape', freezeAfterField: 'name' },

  /* The widest sheet in the catalogue: 29 prescribed columns plus a month of days. */
  combinedWages: { ...COMMON, orientation: 'landscape', freezeAfterField: 'name' },

  /* Four to eleven columns of counts. It fits upright. */
  leave: { ...COMMON, orientation: 'portrait', freezeAfterField: 'name' },

  /* Addresses and shift timings: fewer columns, but wide ones. */
  employment: {
    ...COMMON,
    orientation: 'portrait',
    freezeAfterField: 'name',
    widths: { ...COMMON.widths, text: 30 },
  },

  /* Two columns on a portrait page, one slip per employee. The widths here are the labels
     and the figures; the slip writer does not use a day width or a signature width. */
  wageSlip: {
    ...COMMON,
    orientation: 'portrait',
    freezeAfterField: 'name',
    widths: { ...COMMON.widths, text: 42, number: 24 },
  },

  /* One row of figures about an establishment. Upright, and wide enough for a heading like
     "No. of women employed" to sit above a number. */
  periodicReturn: {
    ...COMMON,
    orientation: 'portrait',
    freezeAfterField: 'name',
    widths: { ...COMMON.widths, text: 28, number: 18 },
    rowHeight: 22,
  },
};

export function layoutFor(archetype: FormArchetype): ArchetypeLayout {
  const layout = ARCHETYPE_LAYOUT[archetype];
  if (!layout) throw new ArchetypeNotBuilt(archetype);
  return layout;
}

/** True when this archetype has a renderer. The generate route skips the rest with a reason. */
export function isBuilt(archetype: FormArchetype): boolean {
  return ARCHETYPE_LAYOUT[archetype] !== null;
}

/**
 * The number format for a column, by the kind of thing in it.
 *
 * Rupee amounts carry two decimals because a statutory register states an amount paid, not a
 * rounded one. Days and hours carry one, because half a day and half an hour are both real.
 */
export function numberFormat(kind: FieldKind): string | undefined {
  switch (kind) {
    case 'money':
      return '#,##0.00';
    case 'days':
    case 'hours':
      return '#,##0.0';
    case 'number':
      return '#,##0';
    default:
      return undefined;
  }
}

/** How wide a column holding this sort of value should be. */
export function widthFor(layout: ArchetypeLayout, kind: FieldKind, source: string, isDay: boolean): number {
  if (isDay) return layout.widths.day;
  if (source === 'signature') return layout.widths.signature;
  switch (kind) {
    case 'money':
    case 'number':
    case 'hours':
    case 'days':
      return layout.widths.number;
    case 'date':
      return 12;
    default:
      return layout.widths.text;
  }
}
