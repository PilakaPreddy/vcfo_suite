import type { UploadSlot } from '@/lib/labour-registers/parse';

/** One value as the source states it, before any field is chosen. */
export interface ReadValue {
  label: string;
  value: string;
  page: number | null;
  /** Whose fact this is, when the source says; a name or a heading such as "Director 2". */
  person: string | null;
  /** 1 when code read it from the text; a model's own estimate on a scan. */
  confidence: number;
}

/**
 * One document inside a file. A single PDF can hold several: two directors' identity cards, or
 * letters about two companies. `pages` are the one-based pages the part was read from, empty when
 * the source has no pages (a paste).
 */
export interface ReadPart {
  docType: string;
  company: string | null;
  values: ReadValue[];
  pages: number[];
}


/** A payroll or attendance sheet, recognised by its headings. Its rows are never read as values. */
export interface LabourSheetInfo {
  slot: UploadSlot;
  headers: string[];
  /** The month the day columns cover, as ISO dates; absent when the grid has no clear dates. */
  periodHint?: { from: string; to: string };
}

export interface ReadResult {
  /** The first part's document type. */
  docType: string;
  /** The company the first part names, if any. */
  company: string | null;
  /**
   * The values of every part about the same company as the first part (a part that names no
   * company counts as the same), so callers locked to one client keep every director's values.
   */
  values: ReadValue[];
  /** Every document found in the source, in order. Always at least one, except for a labour sheet. */
  parts: ReadPart[];
  /** An identity document. */
  sensitive: boolean;
  /** Read by a model, so spend applies and the values may need a closer look. */
  usedModel: boolean;
  /** Set when the file is a labour register sheet; its values were not read. */
  labourSheet?: LabourSheetInfo;
  /** Pages left unread because the file was longer than one read covers. */
  skippedPages?: number[];
}

export const IDENTITY_DOC_TYPES: ReadonlySet<string> = new Set(['pan_card', 'aadhaar_card', 'passport', 'voter_id', 'driving_licence']);
