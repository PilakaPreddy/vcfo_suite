import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { cleanZipPath, DEFAULT_UNZIP_LIMITS, unzipDrop, UnzipRefused } from './unzip';

/** ZIP unpacking for a drop: the limits, the bomb check, unsafe paths, nested and encrypted entries. */

const zip = (files: Record<string, Uint8Array>, level: 0 | 9 = 9) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level }]])));

/** Sets the "encrypted" bit on every local and central header, as a password-protected ZIP has. */
function markEncrypted(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes);
  const view = new DataView(out.buffer);
  for (let i = 0; i + 4 <= out.length; i += 1) {
    const sig = view.getUint32(i, true);
    if (sig === 0x04034b50) out[i + 6]! |= 1;
    if (sig === 0x02014b50) out[i + 8]! |= 1;
  }
  return out;
}

describe('cleanZipPath', () => {
  it('keeps a normal folder path and normalises slashes', () => {
    expect(cleanZipPath('Acme\\Payroll/./Aug-2026/pay.xlsx')).toBe('Acme/Payroll/Aug-2026/pay.xlsx');
  });
  it('refuses absolute and climbing paths', () => {
    expect(cleanZipPath('/etc/passwd')).toBeNull();
    expect(cleanZipPath('C:/Windows/x.txt')).toBeNull();
    expect(cleanZipPath('a/../../b.txt')).toBeNull();
  });
  it('ignores system files', () => {
    expect(cleanZipPath('__MACOSX/a/._pay.xlsx')).toBe('ignore');
    expect(cleanZipPath('a/.DS_Store')).toBe('ignore');
    expect(cleanZipPath('a/Thumbs.db')).toBe('ignore');
  });
});

describe('unzipDrop', () => {
  it('unpacks files with their folder paths and drops system files quietly', () => {
    const { entries, skipped } = unzipDrop(
      zip({ 'Acme/Payroll/pay.csv': strToU8('a,b\n1,2'), 'Kestrel/notes.txt': strToU8('hello'), '__MACOSX/Acme/._pay.csv': strToU8('x'), '.hidden': strToU8('x') }),
    );
    expect(entries.map((e) => e.path).sort()).toEqual(['Acme/Payroll/pay.csv', 'Kestrel/notes.txt']);
    expect(entries.find((e) => e.fileName === 'notes.txt')!.data.toString('utf8')).toBe('hello');
    expect(skipped).toEqual([]);
  });

  it('unpacks stored (uncompressed) entries', () => {
    const { entries } = unzipDrop(zip({ 'a.txt': strToU8('stored') }, 0));
    expect(entries[0]!.data.toString('utf8')).toBe('stored');
  });

  it('refuses a ZIP bomb by its real unpacked bytes', () => {
    const bomb = zip({ 'zeros.txt': new Uint8Array(20 * 1024 * 1024) });
    expect(bomb.length).toBeLessThan(200 * 1024);
    expect(() => unzipDrop(bomb)).toThrow(UnzipRefused);
  });

  it('skips an entry over the per-entry limit and keeps the rest', () => {
    const random = new Uint8Array(3000);
    for (let i = 0; i < random.length; i += 1) random[i] = (i * 7919 + 13) % 251;
    const { entries, skipped } = unzipDrop(zip({ 'big.bin': random, 'small.txt': strToU8('ok') }), { ...DEFAULT_UNZIP_LIMITS, maxEntryBytes: 1000 });
    expect(entries.map((e) => e.path)).toEqual(['small.txt']);
    expect(skipped[0]).toMatchObject({ path: 'big.bin' });
    expect(skipped[0]!.reason).toMatch(/larger than/);
  });

  it('stops at the total and the entry count left in the drop', () => {
    const files = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`f${i}.txt`, strToU8('x'.repeat(100))]));
    const byCount = unzipDrop(zip(files), { ...DEFAULT_UNZIP_LIMITS, maxEntries: 3 });
    expect(byCount.entries).toHaveLength(3);
    expect(byCount.skipped).toHaveLength(2);
    const byBytes = unzipDrop(zip(files), { ...DEFAULT_UNZIP_LIMITS, maxTotalBytes: 250 });
    expect(byBytes.entries).toHaveLength(2);
    expect(byBytes.skipped.every((s) => /200|MB/.test(s.reason))).toBe(true);
  });

  it('skips path traversal, nested ZIPs and encrypted entries', () => {
    const inner = zip({ 'x.txt': strToU8('x') });
    const { entries, skipped } = unzipDrop(zip({ '../evil.txt': strToU8('x'), 'inner.zip': inner, 'ok.txt': strToU8('ok') }));
    expect(entries.map((e) => e.path)).toEqual(['ok.txt']);
    expect(skipped.map((s) => s.path).sort()).toEqual(['../evil.txt', 'inner.zip']);

    const locked = unzipDrop(markEncrypted(zip({ 'secret.pdf': strToU8('%PDF') })));
    expect(locked.entries).toEqual([]);
    expect(locked.skipped[0]!.reason).toMatch(/password/);
  });

  it('refuses a file that is not a ZIP', () => {
    expect(() => unzipDrop(strToU8('not a zip at all'))).toThrow(UnzipRefused);
  });
});
