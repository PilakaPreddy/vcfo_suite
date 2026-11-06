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

export interface ReadResult {
  docType: string;
  /** The company the source names, if any. */
  company: string | null;
  values: ReadValue[];
  /** An identity document. */
  sensitive: boolean;
  /** Read by a model, so spend applies and the values may need a closer look. */
  usedModel: boolean;
}

export const IDENTITY_DOC_TYPES: ReadonlySet<string> = new Set(['pan_card', 'aadhaar_card', 'passport', 'voter_id', 'driving_licence']);
