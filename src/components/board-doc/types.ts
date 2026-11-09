import type { FileType } from '@/components/ui/file-badge';

/*
 * Shared types of the board document part (docs/ui-port/BR-DOC-API.md). The board resolution
 * (NOC) uses them first; resolutions by circulation, notices and agendas, and minutes reuse them.
 */

/** A full ISO timestamp, or a plain 'YYYY-MM-DD' day. */
export type IsoTime = string;

/** One step of a document's track ("Drafted", "Notarised"). */
export interface DocStageDef {
  key: string;
  label: string;
}

/** What happened at a step. A step is done when `at` is set. Every date comes from one record. */
export interface DocStageRecord {
  at?: IsoTime | null;
  by?: string | null;
}

export type DocStageRecords = Record<string, DocStageRecord | undefined>;

/** One line of the "What you do" list. The line is ticked when its track step is done. */
export interface DocTodoDef {
  key: string;
  label: string;
  stage: string;
}

/** One tick of the receive checklist. */
export interface DocCheckDef {
  key: string;
  label: string;
}

export type DocKind = 'board-resolution-noc' | 'resolution-by-circulation' | 'notice-agenda' | 'minutes';

/** A document type gives its steps, its letterhead source, its to-do list and its checklist. */
export interface DocTypeDef {
  kind: DocKind;
  title: string;
  subtitle?: string;
  letterhead: 'parent' | 'company';
  stages: DocStageDef[];
  todo: DocTodoDef[];
  checks: DocCheckDef[];
}

/** A value filled from an answer. `source` names the field that holds it. */
export interface MergeValue {
  key: string;
  value: string;
  source: string;
  /** The value is still a template placeholder: it shows faint and outlined, "Not given yet". */
  missing?: boolean;
}

/** The paper that the Draft tab draws. */
export interface DocModel {
  /** Null draws a plain page with no letterhead band. */
  letterhead: { name: string; address?: string; note?: string } | null;
  heading?: string;
  dates?: Array<{ label: string; value: string }>;
  sections: Array<{ label?: string; paragraphs: string[] }>;
}

export interface DocVersion {
  id: string;
  label: string;
  at?: IsoTime | null;
  by?: string | null;
  /** Merge key to the value that version used. */
  values: Record<string, string>;
}

export interface DocFile {
  id: string;
  /** "Draft · Word", "Signed copy". The client never sees the internal file name. */
  title: string;
  type?: FileType;
  /** The internal file name. It shows only with `showInternalName`. */
  name?: string;
  status?: string;
  by?: string | null;
  at?: IsoTime | null;
}

export interface SignedCopy {
  name: string;
  /** Same-origin routes send `attachment`, so the part fetches them as a blob first. */
  url: string | (() => Promise<string>);
  contentType?: string | null;
  uploadedAt?: IsoTime | null;
  uploadedBy?: string | null;
}

export interface AuditLine {
  id: string;
  at: IsoTime;
  who: string;
  text: string;
}

export interface EvidenceRow {
  n: number;
  asked: string;
  answer: string;
  chose: string;
  missing?: boolean;
}
