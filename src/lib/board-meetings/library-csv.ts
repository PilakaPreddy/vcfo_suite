/**
 * AGENDA LIBRARY CSV — the firm keeps the master list in Excel. Firm settings › Agenda library
 * downloads it as CSV and imports a CSV saved from Excel (File › Save as › CSV UTF-8). Rows match
 * on the ID column (BM-001 …); a new ID adds an item, a known ID updates it.
 */

export interface LibraryCsvRow {
  id: string;
  topic: string;
  scenario: string;
  wording: string;
  law: string;
  applicability: string;
  action: string;
  notes: string;
}

export const LIBRARY_CSV_COLUMNS: Array<[keyof LibraryCsvRow, string]> = [
  ['id', 'ID'],
  ['topic', 'Topic'],
  ['scenario', 'Scenario'],
  ['wording', 'Agenda wording'],
  ['law', 'Law'],
  ['applicability', 'Applicability'],
  ['action', 'Action'],
  ['notes', 'Notes'],
];

/** RFC 4180 parsing: quoted fields, doubled quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/** Header names → row objects. Unknown columns are ignored; rows without an ID or wording are skipped. */
export function libraryRowsFromCsv(text: string): { rows: LibraryCsvRow[]; skipped: number; missing: string[] } {
  const [head, ...body] = parseCsv(text);
  if (!head) return { rows: [], skipped: 0, missing: ['ID', 'Agenda wording'] };
  const index = new Map<keyof LibraryCsvRow, number>();
  for (const [key, label] of LIBRARY_CSV_COLUMNS) {
    const at = head.findIndex((h) => norm(h) === norm(label) || norm(h) === norm(key));
    if (at >= 0) index.set(key, at);
  }
  // "Wording" alone is accepted for the wording column.
  if (!index.has('wording')) {
    const at = head.findIndex((h) => norm(h) === 'wording');
    if (at >= 0) index.set('wording', at);
  }
  const missing = (['id', 'wording'] as const).filter((k) => !index.has(k)).map((k) => LIBRARY_CSV_COLUMNS.find(([c]) => c === k)![1]);
  if (missing.length) return { rows: [], skipped: body.length, missing };
  let skipped = 0;
  const rows: LibraryCsvRow[] = [];
  for (const r of body) {
    const get = (k: keyof LibraryCsvRow) => (index.has(k) ? (r[index.get(k)!] ?? '').trim() : '');
    const row = Object.fromEntries(LIBRARY_CSV_COLUMNS.map(([k]) => [k, get(k)])) as unknown as LibraryCsvRow;
    if (!row.id || !row.wording) {
      skipped++;
      continue;
    }
    rows.push(row);
  }
  return { rows, skipped, missing: [] };
}

const cell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function libraryCsv(rows: LibraryCsvRow[]): string {
  const lines = [LIBRARY_CSV_COLUMNS.map(([, l]) => l).join(',')];
  for (const r of rows) lines.push(LIBRARY_CSV_COLUMNS.map(([k]) => cell(r[k] ?? '')).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
