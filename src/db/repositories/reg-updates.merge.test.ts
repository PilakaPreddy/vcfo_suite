import { beforeEach, describe, expect, it, vi } from 'vitest';
import { regUpdateLinks, regUpdates } from '@/db/schema';

/** Records each write by table; a select answers with the next prepared rows. */
type Write = { op: 'insert' | 'update' | 'delete'; table: unknown; data?: Record<string, unknown> };
const writes: Write[] = [];
let selects: unknown[][] = [];

function chain(result: () => unknown, write?: Write): unknown {
  const self: unknown = new Proxy(() => undefined, {
    get(_target, key) {
      if (key === 'then') return (resolve: (value: unknown) => void) => resolve(result());
      if ((key === 'set' || key === 'values') && write) return (data: Record<string, unknown>) => ((write.data = data), self);
      return () => self;
    },
  });
  return self;
}

const mutate = (op: Write['op']) => (table: unknown) => {
  const write: Write = { op, table };
  writes.push(write);
  return chain(() => [{ id: 'new-update' }], write);
};

const db = {
  select: () => chain(() => selects.shift() ?? []),
  insert: mutate('insert'),
  update: mutate('update'),
  delete: mutate('delete'),
  transaction: (run: (tx: unknown) => unknown) => run(db),
};

vi.mock('@/db/client', () => ({ db }));

const { systemQueueRegUpdates, systemSaveReadText } = await import('./reg-updates');

const SOURCE = { id: 'source-b', sourceType: 'page' };
const ITEM = { externalKey: 'k', title: 'Circular 7', url: 'https://www.rbi.org.in/a.pdf', publishedOn: '2026-11-05' };

beforeEach(() => {
  writes.length = 0;
  selects = [];
});

describe('merging the same paper from two sources', () => {
  it('adds a second link to the update when another source already gave that link', async () => {
    selects = [[{ updateId: 'update-a' }]];
    expect(await systemQueueRegUpdates(SOURCE, [ITEM])).toEqual([]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ op: 'insert', table: regUpdateLinks, data: { updateId: 'update-a', sourceId: 'source-b' } });
  });

  it('queues a link nobody has given yet as its own update', async () => {
    expect(await systemQueueRegUpdates(SOURCE, [ITEM])).toEqual(['new-update']);
    expect(writes.map((write) => [write.op, write.table])).toEqual([['insert', regUpdates], ['insert', regUpdateLinks]]);
  });

  it('moves the links and drops the row when the read text is already stored, before any model call', async () => {
    selects = [[{ id: 'update-a' }]];
    expect(await systemSaveReadText('update-b', 'The same text.')).toEqual({ mergedInto: 'update-a' });
    expect(writes[0]).toMatchObject({ op: 'update', table: regUpdateLinks, data: { updateId: 'update-a' } });
    expect(writes[1]).toMatchObject({ op: 'delete', table: regUpdates });
  });

  it('keeps a different text separate and moves it on to the summary', async () => {
    expect(await systemSaveReadText('update-b', 'Other text.')).toEqual({ mergedInto: null });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ op: 'update', table: regUpdates, data: { status: 'read' } });
  });
});
