import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';

const notify = vi.fn();
const markNotified = vi.fn();
const publishRow = vi.fn();
const awaiting = vi.fn();

const PEOPLE = [
  { id: 's', role: 'super_admin' },
  { id: 'a', role: 'admin' },
  { id: 'm', role: 'manager' },
  { id: 'i', role: 'intern' },
  { id: 'c', role: 'client' },
];

vi.mock('@/db/repositories/notifications', () => ({ createNotificationsForUsers: (rows: unknown) => notify(rows) }));
vi.mock('@/db/repositories/reg-updates', () => ({
  publishRegUpdate: (...args: unknown[]) => publishRow(...args),
  systemGetPipelineUpdate: async () => ({ sourceName: 'CBIC' }),
  systemMarkNotified: (ids: unknown) => markNotified(ids),
  systemUpdatesAwaitingSummary: () => awaiting(),
  systemWatchPeople: async () => PEOPLE,
}));

const { publishUpdate, sendDailySummary } = await import('../publish');

const ctx = { role: 'manager' } as AuthContext;
const rowsFor = () => (notify.mock.calls[0]?.[0] ?? []) as Array<{ userId: string; kind: string; title: string; body: string; href: string }>;

beforeEach(() => vi.clearAllMocks());

describe('publishUpdate', () => {
  it('gives an important update one bell row per person, each with its own link', async () => {
    publishRow.mockResolvedValue({ id: 'u', title: 'Due date moved', summary: 'To 31 March 2027.', importance: 'important' });
    expect(await publishUpdate(ctx, 'u')).toBe('published');
    expect(rowsFor().map((row) => row.userId)).toEqual(['s', 'a', 'm', 'i', 'c']);
    expect(rowsFor().every((row) => row.kind === 'watch.update')).toBe(true);
    expect(rowsFor().at(-1)!.href).toBe('/app/client/announcements');
    expect(markNotified).toHaveBeenCalledWith(['u']);
  });

  it('leaves a normal update to the daily summary', async () => {
    publishRow.mockResolvedValue({ id: 'u', title: 'FAQ', summary: 'S', importance: 'normal' });
    expect(await publishUpdate(ctx, 'u')).toBe('published');
    expect(notify).not.toHaveBeenCalled();
    expect(markNotified).not.toHaveBeenCalled();
  });

  it('sends nothing when the update is not ready', async () => {
    publishRow.mockResolvedValue(null);
    expect(await publishUpdate(ctx, 'u')).toBe('not_ready');
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('sendDailySummary', () => {
  it('sends nothing on a day with nothing published', async () => {
    awaiting.mockResolvedValue([]);
    expect(await sendDailySummary()).toEqual({ updates: 0, rows: 0 });
    expect(notify).not.toHaveBeenCalled();
  });

  it('gives each person one row, and keeps staff-only updates from clients', async () => {
    awaiting.mockResolvedValue([
      { id: '1', title: 'Normal one', importance: 'normal' },
      { id: '2', title: 'For staff', importance: 'staff_only' },
    ]);
    expect(await sendDailySummary()).toEqual({ updates: 2, rows: 5 });
    const rows = rowsFor();
    expect(rows.map((row) => row.userId)).toEqual(['s', 'a', 'm', 'i', 'c']);
    expect(rows[0]!.body).toContain('For staff');
    expect(rows.at(-1)!.body).toContain('Normal one');
    expect(rows.at(-1)!.body).not.toContain('For staff');
    expect(markNotified).toHaveBeenCalledWith(['1', '2']);
  });

  it('sends a client nothing when the day held only staff-only updates', async () => {
    awaiting.mockResolvedValue([{ id: '2', title: 'For staff', importance: 'staff_only' }]);
    await sendDailySummary();
    expect(rowsFor().map((row) => row.userId)).toEqual(['s', 'a', 'm', 'i']);
  });
});
