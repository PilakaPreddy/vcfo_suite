import { DROP_MAX_BYTES, DROP_MAX_FILES, MAX_UPLOAD_BYTES, maxUploadSizeLabel } from '@/lib/upload-limits';

/**
 * The browser half of an Ask VCFO drop: it turns what the person dropped or picked (files, whole
 * folders, ZIPs) into a list of files with their folder paths, and a visible list of the files it
 * left out with the reason for each. Nothing is ever left out without a line in the skipped list.
 *
 * The server checks the same rules again (`src/lib/ask/drop/extensions.ts` and the attachments
 * route), so these checks are for a quick, clear answer in the composer and are not the guard.
 */

/** One file the person chose, with its path inside the dropped folder (or just its name). */
export type DropPick = { file: File; path: string };

/** A file that will not be sent, and why, in words the person reads. */
export type SkippedFile = { path: string; reason: string };

/**
 * The extensions a drop takes. These are the chat's readable types (`READABLE_EXTENSIONS` in
 * `src/lib/ask/data-router/read.ts`, which is server-only) plus ZIP and macro-enabled workbooks,
 * as `dropFileRefusal` allows on the server.
 */
export const DROP_EXTENSIONS: ReadonlySet<string> = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'docx', 'xlsx', 'xlsm', 'csv', 'tsv', 'txt', 'zip']);

/** The file picker's `accept` list, built from the same set. */
export const DROP_ACCEPT = [...DROP_EXTENSIONS].map((ext) => `.${ext}`).join(',');

/** At most this many files go through the older one-message path; more, a ZIP or a folder make a drop. */
export const SMALL_DROP_MAX_FILES = 5;

/** A folder walk stops after this many files, so a dropped home folder cannot freeze the tab. */
const WALK_MAX_FILES = 1_000;

export const SKIP_REASONS = {
  hidden: 'Hidden or system file',
  resave: 'Save as .xlsx and drop it again',
  type: 'This kind of file cannot be read',
  empty: 'The file is empty',
  tooBig: `Larger than ${maxUploadSizeLabel()}`,
  tooMany: `More than ${DROP_MAX_FILES} files in one drop`,
  tooMuch: `Over ${Math.round(DROP_MAX_BYTES / (1024 * 1024))} MB in one drop`,
  duplicate: 'Already added',
  unreadable: 'The browser could not open this file',
  walkCap: `The folder holds more than ${WALK_MAX_FILES} files; the rest were not looked at`,
} as const;

const SYSTEM_NAMES = new Set(['thumbs.db', 'desktop.ini', 'icon\r', '.ds_store']);

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** True for dot files, Office lock files, macOS resource folders and Windows thumbnails. */
export function isHiddenPath(path: string): boolean {
  const parts = path.split('/').filter(Boolean);
  const name = parts[parts.length - 1] ?? '';
  if (SYSTEM_NAMES.has(name.toLowerCase()) || name.startsWith('~$')) return true;
  return parts.some((part) => part.startsWith('.') || part === '__MACOSX');
}

/** Why one file cannot go in a drop on its own merits, or null when it can. */
export function fileRefusal(pick: DropPick): string | null {
  if (isHiddenPath(pick.path)) return SKIP_REASONS.hidden;
  const ext = extensionOf(pick.file.name);
  if (ext === 'xls' || ext === 'ods') return SKIP_REASONS.resave;
  if (!DROP_EXTENSIONS.has(ext)) return SKIP_REASONS.type;
  if (pick.file.size === 0) return SKIP_REASONS.empty;
  if (pick.file.size > MAX_UPLOAD_BYTES) return SKIP_REASONS.tooBig;
  return null;
}

/**
 * Splits new picks into the files to send and the files to leave out, given the files already in
 * the composer. The 50-file and 200 MB limits count the files already there.
 */
export function screenPicks(picks: DropPick[], already: DropPick[] = []): { accepted: DropPick[]; skipped: SkippedFile[] } {
  const accepted: DropPick[] = [];
  const skipped: SkippedFile[] = [];
  const seen = new Set(already.map((p) => p.path));
  let count = already.length;
  let bytes = already.reduce((sum, p) => sum + p.file.size, 0);
  for (const pick of picks) {
    const refusal = fileRefusal(pick);
    if (refusal) {
      skipped.push({ path: pick.path, reason: refusal });
      continue;
    }
    if (seen.has(pick.path)) {
      skipped.push({ path: pick.path, reason: SKIP_REASONS.duplicate });
      continue;
    }
    if (count >= DROP_MAX_FILES) {
      skipped.push({ path: pick.path, reason: SKIP_REASONS.tooMany });
      continue;
    }
    if (bytes + pick.file.size > DROP_MAX_BYTES) {
      skipped.push({ path: pick.path, reason: SKIP_REASONS.tooMuch });
      continue;
    }
    seen.add(pick.path);
    count += 1;
    bytes += pick.file.size;
    accepted.push(pick);
  }
  return { accepted, skipped };
}

/**
 * True when the files must go as a background drop rather than with the chat message: a folder, a
 * ZIP, a macro-enabled workbook (the older path does not take one), or more than five files.
 */
export function needsDrop(picks: DropPick[], fromFolder: boolean): boolean {
  if (fromFolder || picks.length > SMALL_DROP_MAX_FILES) return true;
  return picks.some((p) => p.path.includes('/') || ['zip', 'xlsm'].includes(extensionOf(p.file.name)));
}

// ---------------------------------------------------------------------------
// Walking dropped folders
// ---------------------------------------------------------------------------

/** The parts of a `FileSystemEntry` the walk uses, so tests can pass plain objects. */
export interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (file: File) => void, fail?: (error: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (entries: EntryLike[]) => void, fail?: (error: unknown) => void) => void };
}

export type Collected = { picks: DropPick[]; skipped: SkippedFile[]; fromFolder: boolean };

function entryFile(entry: EntryLike): Promise<File> {
  return new Promise((resolve, reject) => entry.file!(resolve, reject));
}

function readBatch(reader: ReturnType<NonNullable<EntryLike['createReader']>>): Promise<EntryLike[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

/**
 * Walks one entry. A directory reader hands back at most about 100 entries per call, so
 * `readEntries` is called again until it returns an empty batch.
 */
async function walk(entry: EntryLike, prefix: string, out: Collected): Promise<void> {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (out.picks.length >= WALK_MAX_FILES) return;
  if (entry.isFile && entry.file) {
    try {
      out.picks.push({ file: await entryFile(entry), path });
    } catch {
      out.skipped.push({ path, reason: SKIP_REASONS.unreadable });
    }
    return;
  }
  if (!entry.isDirectory || !entry.createReader) return;
  out.fromFolder = true;
  // A hidden folder (.git, __MACOSX) is reported once instead of walked file by file.
  if (isHiddenPath(path)) {
    out.skipped.push({ path: `${path}/`, reason: SKIP_REASONS.hidden });
    return;
  }
  const reader = entry.createReader();
  for (;;) {
    let batch: EntryLike[];
    try {
      batch = await readBatch(reader);
    } catch {
      out.skipped.push({ path: `${path}/`, reason: SKIP_REASONS.unreadable });
      return;
    }
    if (batch.length === 0) return;
    for (const child of batch) {
      if (out.picks.length >= WALK_MAX_FILES) {
        out.skipped.push({ path: `${path}/`, reason: SKIP_REASONS.walkCap });
        return;
      }
      await walk(child, path, out);
    }
  }
}

/** Walks a list of entries (from a drop) into files with their relative paths. */
export async function collectEntries(entries: EntryLike[]): Promise<Collected> {
  const out: Collected = { picks: [], skipped: [], fromFolder: false };
  for (const entry of entries) await walk(entry, '', out);
  return out;
}

type ItemLike = { kind: string; webkitGetAsEntry?: () => EntryLike | null; getAsFile?: () => File | null };

/**
 * Reads a drop event's `DataTransfer`. Entries are taken synchronously first, because the browser
 * empties the item list once the event handler returns. A browser without `webkitGetAsEntry`
 * falls back to the plain file list.
 */
export function collectFromDataTransfer(data: { items?: ArrayLike<ItemLike> | null; files?: ArrayLike<File> | null }): Promise<Collected> {
  const items = data.items ? Array.from(data.items).filter((item) => item.kind === 'file') : [];
  const entries: EntryLike[] = [];
  const loose: File[] = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.() ?? null;
    if (entry) entries.push(entry);
    else {
      const file = item.getAsFile?.();
      if (file) loose.push(file);
    }
  }
  if (entries.length === 0 && loose.length === 0) return Promise.resolve(collectFromFileList(data.files ?? []));
  return collectEntries(entries).then((out) => {
    for (const file of loose) out.picks.push({ file, path: file.name });
    return out;
  });
}

/** Reads a file input's list. A folder picker fills `webkitRelativePath` for each file. */
export function collectFromFileList(list: ArrayLike<File>): Collected {
  const picks: DropPick[] = [];
  let fromFolder = false;
  for (const file of Array.from(list)) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    if (relative) fromFolder = true;
    picks.push({ file, path: relative || file.name });
  }
  return { picks, skipped: [], fromFolder };
}
