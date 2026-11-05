/**
 * Credentials workbook — shared model (pure; imported by the repository, the
 * API routes and the page). Sheets, columns and template rows follow the
 * owner's layouts in prototype `s/home/v7p_credentials.dc.html` (2026-10-12).
 *
 * Cell key: `<sheet>|<rowKey>|<colKey>`. For the transposed Directors KYC
 * sheet the row is a particular ('din', 'pan'…) and the column a director
 * (`director:…`); the header cell key is `kyc|h|<directorKey>`.
 * Scopes: 'page' | 'tab:<sheet>' | 'row:<sheet>|<rowKey>' | 'cell:<cellKey>'.
 */

export type CredSheet = 'address' | 'login' | 'reg' | 'kyc' | 'other';
export type CredMode = 'preview' | 'edit' | 'reveal';
type ColKind = 'text' | 'sno' | 'status' | 'cert';

export const CRED_TABS: Array<[CredSheet, string]> = [
  ['address', 'Address'],
  ['login', 'Login credentials'],
  ['reg', 'Registrations'],
  ['kyc', 'Directors KYC'],
  ['other', 'Other credentials'],
];

export const CRED_STATUS: Array<[string, string]> = [
  ['Active', 'ok'],
  ['Pending', 'due'],
  ['Expired', 'over'],
  ['Not applicable', 'up'],
];

export type CredSource =
  | 'company record'
  | 'registration steps'
  | 'client profile'
  | 'registered office'
  | 'incorporation steps';

export const CRED_SRC_TIP: Record<CredSource, string> = {
  'company record': 'Filled from the company record (Certificate of Incorporation). Edit to override.',
  'registration steps': 'Filled from Registrations and filings (Phase 4 steps). Edit to override.',
  'client profile': 'Filled from the client profile. Edit to override.',
  'registered office': 'Filled from the registered office (Incorporation step 7). Edit to override.',
  'incorporation steps': 'Filled from the incorporation steps (DIN, Proposed Directors, KYC). Edit to override.',
};

export interface CredCol {
  key: string;
  n: string;
  /** Secret column (masked until a grant). */
  s?: boolean;
  k?: ColKind;
}

export const LABEL_COL = 'label';

export const SHEET_COLS: Record<Exclude<CredSheet, 'kyc'>, CredCol[]> = {
  address: [
    { key: 'label', n: 'Address type' },
    { key: 'door', n: 'Door No' },
    { key: 'building', n: 'Building' },
    { key: 'street', n: 'Street' },
    { key: 'area', n: 'Area' },
    { key: 'landmark', n: 'Landmark' },
    { key: 'city', n: 'City' },
    { key: 'district', n: 'District' },
    { key: 'state', n: 'State' },
    { key: 'pin', n: 'PIN' },
    { key: 'country', n: 'Country' },
    { key: 'phone', n: 'Phone' },
    { key: 'email', n: 'Email' },
    { key: 'latlng', n: 'Latitude/Longitude' },
    { key: 'ownership', n: 'Ownership' },
    { key: 'owner', n: 'Owner name' },
    { key: 'noc', n: 'NOC', k: 'cert' },
    { key: 'utility', n: 'Utility bill', k: 'cert' },
    { key: 'rent', n: 'Rent agreement', k: 'cert' },
  ],
  login: [
    { key: 'sno', n: 'S.No', k: 'sno' },
    { key: 'label', n: 'Registration' },
    { key: 'id', n: 'ID', s: true },
    { key: 'password', n: 'Password', s: true },
    { key: 'mail', n: 'Mail' },
    { key: 'mobile', n: 'Mobile', s: true },
    { key: 'status', n: 'Status', k: 'status' },
  ],
  reg: [
    { key: 'sno', n: 'S.No', k: 'sno' },
    { key: 'label', n: 'Registration' },
    { key: 'number', n: 'Number' },
    { key: 'date', n: 'Date of registration' },
    { key: 'login', n: 'Login ID', s: true },
    { key: 'password', n: 'Password', s: true },
    { key: 'cert', n: 'Certificate', k: 'cert' },
  ],
  other: [
    { key: 'label', n: 'Item' },
    { key: 'id', n: 'ID', s: true },
    { key: 'password', n: 'Password', s: true },
    { key: 'email', n: 'Linked email' },
    { key: 'notes', n: 'Notes' },
  ],
};

/** Template rows: [rowKey, label]. `null` = the spacer row in Login. */
export const LOGIN_ROWS: Array<[string, string] | null> = [
  ['cin', 'Company CIN'],
  ['pan', 'PAN'],
  ['tan-traces', 'TAN - Traces Registration'],
  ['tan-it', 'TAN - Income Tax Registration'],
  ['esi', 'Employee State Insurance (ESI)'],
  ['pf', 'Provident Fund (PF)'],
  ['gst', 'Goods and Service Tax (GST)'],
  ['gst-einvoice', 'Goods and Service Tax (GST) - E-Invoicing'],
  ['lut', 'LUT (Letter of Undertaking)'],
  ['bank', 'HDFC Bank - Bank Logins'],
  ['se', 'Shops and Establishment Act (S&E Act)'],
  ['pt', 'Professional Tax'],
  ['iec', 'Import Export Code (IEC)'],
  ['mail', 'Mail ID - Company'],
  ['non-stpi', 'Non STPI'],
  ['rbi-entity', 'RBI Entity Logins'],
  ['rbi-business', 'RBI Business Logins'],
  ['fla', 'FLA'],
  ['traces', 'Traces'],
  ['zoho', 'Zoho Books'],
  ['papaya', 'Papaya'],
  ['pluxee', 'Pluxee'],
  ['adt1', 'ADT-1'],
  ['mca-v3', 'MCA V3 Logins'],
  ['nps', 'NPS'],
  null,
  ['cbo', 'CBO'],
  ['posh', 'POSH'],
  ['flair', 'FLAIR'],
  ['address', 'Address'],
  ['jpmc', 'JPMC logins'],
  ['reporting', 'Reporting Portal'],
];

export const REG_ROWS: Array<[string, string]> = [
  ['gst', 'GST Registration'],
  ['pf', 'PF Registration'],
  ['esi', 'ESI Registration'],
  ['pt', 'PT Registration'],
  ['lei', 'LEI Registration'],
  ['msme', 'MSME Registration'],
  ['icegate', 'ICEGATE Registrations'],
  ['iec', 'IEC Registration'],
  ['lut', 'LUT Filing'],
  ['non-stpi', 'Non-STPI Compliance'],
  ['se', 'Shops & Establishment'],
  ['clra', 'CLRA Registration'],
  ['posh', 'POSH / SHE Box'],
  ['trade', 'Trade Licence'],
  ['tm', 'Trademark Registration'],
  ['tm-renewal', 'Trademark Renewal'],
  ['patent', 'Patent Registration'],
  ['icdr', 'ICDR Registration'],
  ['fcgpr', 'FCGPR Filing'],
  ['fdi', 'FDI Reporting'],
];

/** Short names for the Registrations tile ("PF · ESI · PT"). */
export const REG_SHORT: Record<string, string> = {
  gst: 'GST', pf: 'PF', esi: 'ESI', pt: 'PT', lei: 'LEI', msme: 'MSME', icegate: 'ICEGATE', iec: 'IEC', lut: 'LUT',
  'non-stpi': 'STPI', se: 'S&E', clra: 'CLRA', posh: 'POSH', trade: 'Trade', tm: 'TM', 'tm-renewal': 'TM', patent: 'Patent',
  icdr: 'ICDR', fcgpr: 'FCGPR', fdi: 'FDI',
};

export const ADDRESS_ROWS: Array<[string, string]> = [
  ['registered', 'Registered office'],
  ['corporate', 'Corporate office'],
  ['communication', 'Communication'],
];

/** Directors KYC particulars (rows of the transposed sheet). */
export interface KycParticular {
  key: string;
  n: string;
  s?: boolean;
  indent?: boolean;
  tall?: boolean;
}
export const KYC_ROWS: KycParticular[] = [
  { key: 'din', n: 'DIN' },
  { key: 'full', n: 'Full Name' },
  { key: 'first', n: 'First Name' },
  { key: 'middle', n: 'Middle Name' },
  { key: 'last', n: 'Last Name' },
  { key: 'dob', n: 'Date of Birth', s: true },
  { key: 'father', n: 'Father Name' },
  { key: 'ffirst', n: 'First Name', indent: true },
  { key: 'fmiddle', n: 'Middle Name', indent: true },
  { key: 'flast', n: 'Last Name', indent: true },
  { key: 'address', n: 'Address', tall: true },
  { key: 'mobile', n: 'Mobile Number' },
  { key: 'mail', n: 'Mail ID' },
  { key: 'passport', n: 'Passport', s: true },
  { key: 'aadhaar', n: 'Aadhar No', s: true },
  { key: 'dl', n: 'Driving License', s: true },
  { key: 'pan', n: 'PAN', s: true },
  { key: 'addrproof', n: 'Address Proof', s: true },
  { key: 'edu', n: 'Education Qualification' },
  { key: 'category', n: 'Category' },
  { key: 'stay', n: 'Duration Of Stay' },
  { key: 'pob', n: 'Place of Birth' },
  { key: 'role', n: 'Director Role' },
  { key: 'aadhaarMobile', n: 'Aadhar Linked Mobile Number', s: true },
];
export const KYC_NAME_FIELD = 'name';

/* ---------------- wire format (GET /api/client/credentials) ---------------- */

export interface WireCell {
  /** Plain value; null when the cell is secret and not revealed. */
  v: string | null;
  /** Secret cell that holds a value (masked). */
  has?: boolean;
  src?: CredSource;
  edited?: boolean;
  /** Storage path of a certificate that came from a checklist upload. */
  doc?: string;
}

export interface WireRow {
  key: string;
  spacer?: boolean;
  custom?: boolean;
  cells: Record<string, WireCell>;
}

export interface WireCol extends CredCol {
  /** Directors KYC header (director column) is editable. */
  hdr?: boolean;
}

export interface WireSheet {
  id: CredSheet;
  cols: WireCol[];
  rows: WireRow[];
}

export interface WireGrant {
  id: string;
  mode: CredMode;
  scope: string;
  expiresAt: string;
}

export interface WireIdTile {
  key: 'cin' | 'pan' | 'tan' | 'gstin';
  name: string;
  auth: 'mca' | 'it' | 'gst';
  /** Clear value (non-secret, or secret inside a grant). */
  value: string | null;
  /** Masked secret (`AAKC••••1M`). */
  masked: string | null;
  secret: boolean;
}

export interface CredentialsPayload {
  engagementId: string;
  companyName: string;
  registeredAddress: string | null;
  /** Approver shown in the OTP dialog (the Project Manager). */
  manager: { name: string; emailMasked: string } | null;
  ids: WireIdTile[];
  registrationsSummary: string | null;
  directors: number;
  sheets: Record<CredSheet, WireSheet>;
  grants: WireGrant[];
  /** Staff see secrets without an OTP. */
  staff: boolean;
}

export interface CredentialsLogEntry {
  id: string;
  at: string;
  text: string;
}

export function parseCellKey(key: string): { sheet: string; row: string; col: string } | null {
  const p = key.split('|');
  if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return null;
  return { sheet: p[0], row: p[1], col: p[2] };
}

/** Scopes that cover a cell (a grant on any of them shows / unlocks it). */
export function scopesCovering(key: string): string[] {
  const p = parseCellKey(key);
  if (!p) return [];
  const out = ['page', `tab:${p.sheet}`];
  if (p.row !== 'h') out.push(`row:${p.sheet}|${p.row}`);
  out.push(`cell:${key}`);
  return out;
}

export function isValidScope(scope: string): boolean {
  if (scope === 'page') return true;
  if (/^tab:(address|login|reg|kyc|other)$/.test(scope)) return true;
  if (/^row:(address|login|reg|kyc|other)\|[\w:.-]{1,80}$/.test(scope)) return true;
  if (/^cell:(address|login|reg|kyc|other|ids)\|[\w:.-]{1,80}\|[\w:.-]{1,80}$/.test(scope)) return true;
  return false;
}

export function maskId(v: string): string {
  return v.length <= 6 ? '••••' : `${v.slice(0, 4)}••••${v.slice(-2)}`;
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) return email;
  return `${user.slice(0, 2)}•••••@${domain}`;
}

export function tabLabel(id: string): string {
  return CRED_TABS.find((t) => t[0] === id)?.[1] ?? id;
}

function colLetter(i: number): string {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** Row name as the prototype shows it in captions and the access log. */
function rowName(sheet: WireSheet, rowKey: string): string {
  if (sheet.id === 'kyc') {
    const p = KYC_ROWS.find((x) => x.key === rowKey);
    return p ? `${p.indent ? 'Father ' : ''}${p.n}` : rowKey;
  }
  const i = sheet.rows.findIndex((r) => r.key === rowKey);
  const row = sheet.rows[i];
  return row?.cells[LABEL_COL]?.v || `Row ${i + 1}`;
}

function directorName(sheet: WireSheet, colKey: string): string {
  return sheet.cols.find((c) => c.key === colKey)?.n || 'New director';
}

export function cellLabel(
  sheets: Record<CredSheet, WireSheet>,
  ids: Pick<WireIdTile, 'key' | 'name'>[],
  key: string,
): string {
  const p = parseCellKey(key);
  if (!p) return key;
  if (p.sheet === 'ids') return ids.find((t) => t.key === p.row)?.name ?? p.row.toUpperCase();
  const sheet = sheets[p.sheet as CredSheet];
  if (!sheet) return key;
  if (p.row === 'h') {
    const idx = sheet.cols.findIndex((c) => c.key === p.col);
    return `Director name (column ${colLetter(Math.max(idx, 0))})`;
  }
  if (sheet.id === 'kyc') return `${directorName(sheet, p.col)} · ${rowName(sheet, p.row)}`;
  const col = sheet.cols.find((c) => c.key === p.col);
  return `${rowName(sheet, p.row)} · ${col?.n ?? p.col}`;
}

export function scopeLabel(
  sheets: Record<CredSheet, WireSheet>,
  ids: Pick<WireIdTile, 'key' | 'name'>[],
  scope: string,
): string {
  if (scope === 'page') return 'whole page';
  if (scope.startsWith('tab:')) return tabLabel(scope.slice(4));
  if (scope.startsWith('row:')) {
    const [sh, row] = scope.slice(4).split('|');
    const sheet = sheets[sh as CredSheet];
    return `${tabLabel(sh ?? '')} · ${sheet ? rowName(sheet, row ?? '') : row}`;
  }
  if (scope.startsWith('cell:')) return cellLabel(sheets, ids, scope.slice(5));
  return scope;
}
