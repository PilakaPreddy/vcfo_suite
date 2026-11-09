import { describe, expect, it } from 'vitest';
import { DROP_MAX_BYTES, DROP_MAX_FILES } from '@/lib/upload-limits';
import {
  collectEntries,
  collectFromDataTransfer,
  collectFromFileList,
  isHiddenPath,
  needsDrop,
  screenPicks,
  SKIP_REASONS,
  type DropPick,
  type EntryLike,
} from './collect';

function makeFile(name: string, size = 10): File {
  const file = new File(['x'], name);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function fileEntry(name: string, size = 10): EntryLike {
  return { isFile: true, isDirectory: false, name, file: (ok) => ok(makeFile(name, size)) };
}

/** A directory whose reader hands its children back in batches of `batch`, like Chrome does (100). */
function dirEntry(name: string, children: EntryLike[], batch = 2): EntryLike & { reads: number } {
  const dir = {
    isFile: false,
    isDirectory: true,
    name,
    reads: 0,
    createReader: () => {
      let at = 0;
      return {
        readEntries: (ok: (entries: EntryLike[]) => void) => {
          dir.reads += 1;
          const next = children.slice(at, at + batch);
          at += batch;
          queueMicrotask(() => ok(next));
        },
      };
    },
  };
  return dir;
}

const pick = (path: string, size = 10): DropPick => ({ file: makeFile(path.split('/').pop()!, size), path });

describe('collectEntries', () => {
  it('walks nested folders, keeps relative paths and loops readEntries until it is empty', async () => {
    const payroll = dirEntry('Payroll', [fileEntry('aug.xlsx'), fileEntry('sep.xlsx'), fileEntry('oct.xlsx')]);
    const root = dirEntry('Acme', [payroll, fileEntry('pan.pdf')]);
    const out = await collectEntries([root, fileEntry('loose.txt')]);
    expect(out.fromFolder).toBe(true);
    expect(out.picks.map((p) => p.path)).toEqual(['Acme/Payroll/aug.xlsx', 'Acme/Payroll/sep.xlsx', 'Acme/Payroll/oct.xlsx', 'Acme/pan.pdf', 'loose.txt']);
    // Three files in batches of two: two full reads and one empty read.
    expect(payroll.reads).toBe(3);
  });

  it('reports a hidden folder once instead of walking it', async () => {
    const git = dirEntry('.git', [fileEntry('HEAD')]);
    const out = await collectEntries([dirEntry('Acme', [git, fileEntry('a.pdf')])]);
    expect(out.picks.map((p) => p.path)).toEqual(['Acme/a.pdf']);
    expect(out.skipped).toEqual([{ path: 'Acme/.git/', reason: SKIP_REASONS.hidden }]);
    expect(git.reads).toBe(0);
  });

  it('lists a file the browser cannot open', async () => {
    const broken: EntryLike = { isFile: true, isDirectory: false, name: 'locked.pdf', file: (_ok, fail) => fail?.(new Error('denied')) };
    const out = await collectEntries([broken]);
    expect(out.picks).toEqual([]);
    expect(out.skipped).toEqual([{ path: 'locked.pdf', reason: SKIP_REASONS.unreadable }]);
  });
});

describe('collectFromDataTransfer', () => {
  it('uses the entries when the browser offers them', async () => {
    const items = [{ kind: 'file', webkitGetAsEntry: () => dirEntry('Acme', [fileEntry('a.pdf')]) }];
    const out = await collectFromDataTransfer({ items, files: [] });
    expect(out.picks.map((p) => p.path)).toEqual(['Acme/a.pdf']);
    expect(out.fromFolder).toBe(true);
  });

  it('falls back to the plain file list', async () => {
    const out = await collectFromDataTransfer({ items: [], files: [makeFile('a.pdf')] });
    expect(out.picks.map((p) => p.path)).toEqual(['a.pdf']);
    expect(out.fromFolder).toBe(false);
  });
});

describe('collectFromFileList', () => {
  it('takes the folder path from webkitRelativePath', () => {
    const file = makeFile('aug.xlsx');
    Object.defineProperty(file, 'webkitRelativePath', { value: 'Acme/Payroll/aug.xlsx' });
    const out = collectFromFileList([file, makeFile('b.pdf')]);
    expect(out.picks.map((p) => p.path)).toEqual(['Acme/Payroll/aug.xlsx', 'b.pdf']);
    expect(out.fromFolder).toBe(true);
  });
});

describe('screenPicks', () => {
  it('skips hidden and system files, .xls and .ods, unknown types and empty files with a reason', () => {
    const { accepted, skipped } = screenPicks([
      pick('Acme/.DS_Store'),
      pick('Acme/Thumbs.db'),
      pick('Acme/~$paysheet.xlsx'),
      pick('__MACOSX/Acme/a.pdf'),
      pick('Acme/old.xls'),
      pick('Acme/sheet.ods'),
      pick('Acme/setup.exe'),
      pick('Acme/empty.pdf', 0),
      pick('Acme/good.pdf'),
      pick('Acme/bundle.zip'),
    ]);
    expect(accepted.map((p) => p.path)).toEqual(['Acme/good.pdf', 'Acme/bundle.zip']);
    expect(skipped).toEqual([
      { path: 'Acme/.DS_Store', reason: SKIP_REASONS.hidden },
      { path: 'Acme/Thumbs.db', reason: SKIP_REASONS.hidden },
      { path: 'Acme/~$paysheet.xlsx', reason: SKIP_REASONS.hidden },
      { path: '__MACOSX/Acme/a.pdf', reason: SKIP_REASONS.hidden },
      { path: 'Acme/old.xls', reason: 'Save as .xlsx and drop it again' },
      { path: 'Acme/sheet.ods', reason: 'Save as .xlsx and drop it again' },
      { path: 'Acme/setup.exe', reason: SKIP_REASONS.type },
      { path: 'Acme/empty.pdf', reason: SKIP_REASONS.empty },
    ]);
  });

  it('stops at 50 files, counting the files already in the composer', () => {
    const already = Array.from({ length: DROP_MAX_FILES - 2 }, (_, i) => pick(`f${i}.pdf`));
    const { accepted, skipped } = screenPicks([pick('a.pdf'), pick('b.pdf'), pick('c.pdf'), pick('f0.pdf')], already);
    expect(accepted.map((p) => p.path)).toEqual(['a.pdf', 'b.pdf']);
    expect(skipped).toEqual([
      { path: 'c.pdf', reason: SKIP_REASONS.tooMany },
      { path: 'f0.pdf', reason: SKIP_REASONS.duplicate },
    ]);
  });

  it('stops at 200 MB in all', () => {
    const big = 40 * 1024 * 1024;
    const files = Array.from({ length: 6 }, (_, i) => pick(`big${i}.pdf`, big));
    const { accepted, skipped } = screenPicks(files);
    expect(accepted).toHaveLength(Math.floor(DROP_MAX_BYTES / big));
    expect(skipped.every((s) => s.reason === SKIP_REASONS.tooMuch)).toBe(true);
    expect(accepted.length + skipped.length).toBe(6);
  });
});

describe('needsDrop and isHiddenPath', () => {
  it('sends up to five plain files with the message and anything bigger as a drop', () => {
    const five = Array.from({ length: 5 }, (_, i) => pick(`f${i}.pdf`));
    expect(needsDrop(five, false)).toBe(false);
    expect(needsDrop([...five, pick('g.pdf')], false)).toBe(true);
    expect(needsDrop([pick('a.zip')], false)).toBe(true);
    expect(needsDrop([pick('pay.xlsm')], false)).toBe(true);
    expect(needsDrop([pick('a.pdf')], true)).toBe(true);
    expect(needsDrop([pick('Acme/a.pdf')], false)).toBe(true);
  });

  it('knows hidden paths', () => {
    expect(isHiddenPath('Acme/.hidden/a.pdf')).toBe(true);
    expect(isHiddenPath('desktop.ini')).toBe(true);
    expect(isHiddenPath('Acme/a.pdf')).toBe(false);
  });
});
