import { Unzip, UnzipInflate, UnzipPassThrough, type UnzipFile } from 'fflate';
import { DROP_MAX_BYTES, DROP_MAX_FILES } from '@/lib/upload-limits';

/**
 * Unpacks a ZIP from a drop, safely. fflate's streaming `Unzip` is used, not pizzip: it hands over
 * each entry as it inflates, so a limit stops the work part way instead of after everything is in
 * memory. Every limit counts the bytes actually produced, never the sizes the archive claims.
 *
 * The rules:
 * - at most `maxEntries` files and `maxTotalBytes` unpacked bytes, which the caller sets to what is
 *   left of the drop's 50 files and 200 MB;
 * - at most `maxEntryBytes` (25 MB) per entry; a larger entry is skipped with a reason;
 * - an entry that inflates to more than `maxRatio` (100) times its packed size, past the first
 *   megabyte, is a ZIP bomb, and the whole archive is refused;
 * - a ZIP inside the ZIP and a password-protected entry are skipped with a reason;
 * - a path that is absolute or climbs out with `..` is skipped; `__MACOSX`, dotfiles and other system
 *   files are dropped without a word, because nobody meant to send them.
 *
 * Pure: bytes in, entries out. Storage and rows are the caller's job (`src/lib/ask/drop/run.ts`).
 */

export interface UnzipLimits {
  maxEntries: number;
  maxTotalBytes: number;
  maxEntryBytes: number;
  maxRatio: number;
}

export const ZIP_ENTRY_MAX_BYTES = 25 * 1024 * 1024;
export const ZIP_MAX_RATIO = 100;
/** Below this many unpacked bytes the ratio is not checked: a small, very repetitive text file is not a bomb. */
const RATIO_FLOOR_BYTES = 1024 * 1024;
const PUSH_CHUNK = 64 * 1024;

export const DEFAULT_UNZIP_LIMITS: UnzipLimits = {
  maxEntries: DROP_MAX_FILES,
  maxTotalBytes: DROP_MAX_BYTES,
  maxEntryBytes: ZIP_ENTRY_MAX_BYTES,
  maxRatio: ZIP_MAX_RATIO,
};

export interface UnzippedEntry {
  /** The cleaned path inside the ZIP, with forward slashes. */
  path: string;
  /** The last part of the path. */
  fileName: string;
  data: Buffer;
}

export interface UnzipSkip {
  path: string;
  reason: string;
}

/** The whole archive is refused; nothing from it is used. */
export class UnzipRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnzipRefused';
  }
}

const SYSTEM_FILES = new Set(['thumbs.db', 'desktop.ini', 'ehthumbs.db']);

/**
 * Cleans a path from a ZIP. Returns null for a path that must not be used (absolute or climbing out),
 * and `'ignore'` for a system file or folder nobody meant to send.
 */
export function cleanZipPath(raw: string): string | null | 'ignore' {
  // eslint-disable-next-line no-control-regex
  const name = raw.replace(/\\/g, '/').replace(/[\u0000-\u001f\u007f]/g, '');
  if (name.startsWith('/') || /^[a-z]:/i.test(name)) return null;
  const parts = name.split('/').filter((part) => part !== '' && part !== '.');
  if (parts.some((part) => part === '..')) return null;
  if (parts.length === 0) return 'ignore';
  if (parts.some((part) => part === '__MACOSX' || part.startsWith('.'))) return 'ignore';
  if (SYSTEM_FILES.has(parts[parts.length - 1]!.toLowerCase())) return 'ignore';
  return parts.join('/');
}

interface CentralEntry {
  name: string;
  encrypted: boolean;
  compressedSize: number;
}

const u16 = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u32 = (b: Uint8Array, at: number) => (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;
const u64 = (b: Uint8Array, at: number) => u32(b, at) + u32(b, at + 4) * 2 ** 32;

/**
 * Reads the central directory, the archive's own list of entries, for what the stream does not tell:
 * whether an entry is encrypted, and its packed size when the entry was written with a data
 * descriptor. ZIP64 records are followed. A file with no central directory is not a ZIP.
 */
function readCentralDirectory(zip: Uint8Array): Map<string, CentralEntry> {
  const minEocd = 22;
  let eocd = -1;
  for (let i = zip.length - minEocd; i >= Math.max(0, zip.length - minEocd - 65_535); i -= 1) {
    if (u32(zip, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new UnzipRefused('This ZIP file could not be opened. It may be damaged.');
  let count = u16(zip, eocd + 10);
  let offset = u32(zip, eocd + 16);
  if (count === 0xffff || offset === 0xffffffff) {
    const locator = eocd - 20;
    if (locator >= 0 && u32(zip, locator) === 0x07064b50) {
      const z64 = u64(zip, locator + 8);
      if (z64 + 56 <= zip.length && u32(zip, z64) === 0x06064b50) {
        count = u64(zip, z64 + 32);
        offset = u64(zip, z64 + 48);
      }
    }
  }
  const entries = new Map<string, CentralEntry>();
  let at = offset;
  for (let n = 0; n < count; n += 1) {
    if (at + 46 > zip.length || u32(zip, at) !== 0x02014b50) throw new UnzipRefused('This ZIP file could not be opened. It may be damaged.');
    const flags = u16(zip, at + 8);
    let compressedSize = u32(zip, at + 20);
    const nameLength = u16(zip, at + 28);
    const extraLength = u16(zip, at + 30);
    const commentLength = u16(zip, at + 32);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    if (compressedSize === 0xffffffff) {
      // The ZIP64 extra field holds the real sizes: original first when it too overflowed.
      const uncompressedOverflow = u32(zip, at + 24) === 0xffffffff;
      let x = at + 46 + nameLength;
      const end = x + extraLength;
      while (x + 4 <= end) {
        const id = u16(zip, x);
        const size = u16(zip, x + 2);
        if (id === 0x0001) {
          compressedSize = u64(zip, x + 4 + (uncompressedOverflow ? 8 : 0));
          break;
        }
        x += 4 + size;
      }
    }
    entries.set(name, { name, encrypted: (flags & 1) === 1, compressedSize });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function unzipDrop(zip: Uint8Array, limits: UnzipLimits = DEFAULT_UNZIP_LIMITS): { entries: UnzippedEntry[]; skipped: UnzipSkip[] } {
  const central = readCentralDirectory(zip);
  const entries: UnzippedEntry[] = [];
  const skipped: UnzipSkip[] = [];
  let totalBytes = 0;
  // Boxed, because the callbacks set it and TypeScript does not follow assignments made in them.
  const stop: { refused: UnzipRefused | null } = { refused: null };
  let streamError: Error | null = null;

  const unzipper = new Unzip((file: UnzipFile) => {
    if (stop.refused) return;
    if (file.name.endsWith('/')) return; // a folder
    const path = cleanZipPath(file.name);
    if (path === 'ignore') return;
    if (path === null) {
      skipped.push({ path: file.name.slice(0, 200), reason: 'Its path inside the ZIP is not safe, so it was not unpacked.' });
      return;
    }
    const info = central.get(file.name);
    if (info?.encrypted) {
      skipped.push({ path, reason: 'It is password-protected. Please send it without a password.' });
      return;
    }
    if (/\.zip$/i.test(path)) {
      skipped.push({ path, reason: 'A ZIP inside a ZIP is not unpacked. Please unpack it and drop the files.' });
      return;
    }
    if (entries.length >= limits.maxEntries) {
      skipped.push({ path, reason: `The drop already has ${DROP_MAX_FILES} files, the most one drop takes.` });
      return;
    }
    if (file.compression !== 0 && file.compression !== 8) {
      skipped.push({ path, reason: 'It is packed in a way I cannot unpack. Please unpack it and drop the file.' });
      return;
    }

    const packed = Math.max(1, info?.compressedSize ?? file.size ?? 1);
    const chunks: Uint8Array[] = [];
    let produced = 0;
    let stopped = false;
    file.ondata = (error, chunk, final) => {
      if (stopped || stop.refused) return;
      if (error) {
        stopped = true;
        skipped.push({ path, reason: 'It is damaged and could not be unpacked.' });
        return;
      }
      produced += chunk.length;
      if (produced > RATIO_FLOOR_BYTES && produced / packed > limits.maxRatio) {
        stopped = true;
        file.terminate();
        stop.refused = new UnzipRefused('This ZIP unpacks to far more than its size, which is how a ZIP bomb works, so nothing in it was used.');
        return;
      }
      if (produced > limits.maxEntryBytes) {
        stopped = true;
        file.terminate();
        skipped.push({ path, reason: `It is larger than ${Math.round(limits.maxEntryBytes / (1024 * 1024))} MB unpacked.` });
        return;
      }
      if (totalBytes + produced > limits.maxTotalBytes) {
        stopped = true;
        file.terminate();
        skipped.push({ path, reason: `The drop would pass ${Math.round(limits.maxTotalBytes / (1024 * 1024))} MB, the most one drop takes.` });
        return;
      }
      chunks.push(chunk);
      if (final) {
        stopped = true;
        totalBytes += produced;
        const data = Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)));
        entries.push({ path, fileName: path.split('/').pop()!, data });
      }
    };
    try {
      file.start();
    } catch {
      skipped.push({ path, reason: 'It could not be unpacked.' });
    }
  });
  unzipper.register(UnzipInflate);
  unzipper.register(UnzipPassThrough);

  try {
    for (let at = 0; at < zip.length && !stop.refused; at += PUSH_CHUNK) {
      const end = Math.min(zip.length, at + PUSH_CHUNK);
      unzipper.push(zip.subarray(at, end), end === zip.length);
    }
  } catch (error) {
    streamError = error instanceof Error ? error : new Error(String(error));
  }
  if (stop.refused) throw stop.refused;
  if (streamError && entries.length === 0) throw new UnzipRefused('This ZIP file could not be opened. It may be damaged.');
  return { entries, skipped };
}
