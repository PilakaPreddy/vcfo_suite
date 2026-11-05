import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';

// Each call below must stop at the role check, so a query reaching the database is a failure.
vi.mock('@/db/client', () => ({
  db: new Proxy({}, { get: () => () => { throw new Error('query reached the database'); } }),
}));

const { createManualRegUpdate, getRegUpdate, listRegUpdates, publishRegUpdate, rejectRegUpdate, retryRegUpdate, saveRegUpdateEdit } = await import('./reg-updates');
const { listWatchSources, requestSourceRetest } = await import('./reg-sources');

const as = (role: string) => ({ role, userId: 'u', internId: null, clientId: null }) as unknown as AuthContext;
const ID = '00000000-0000-0000-0000-000000000001';
const EDIT = { title: 'T', area: 'gst', act: null, changeType: 'other', importance: 'normal', effectiveDate: null, oldDueDate: null, newDueDate: null, affects: '', summary: 'S', quote: 'Q' } as const;

describe('Watch repositories refuse by role before any query', () => {
  it.each(['client', 'developer', 'partner'])('%s reads nothing and adds nothing', async (role) => {
    await expect(listRegUpdates(as(role))).rejects.toThrow('not permitted');
    await expect(getRegUpdate(as(role), ID)).rejects.toThrow('not permitted');
    await expect(listWatchSources(as(role))).rejects.toThrow('not permitted');
    await expect(createManualRegUpdate(as(role), { title: 'T', url: 'https://www.rbi.org.in/a', sourceId: null })).rejects.toThrow('not permitted');
  });

  it.each(['intern', 'client', 'developer'])('%s cannot review', async (role) => {
    await expect(saveRegUpdateEdit(as(role), ID, EDIT, [], false, null)).rejects.toThrow('not permitted');
    await expect(publishRegUpdate(as(role), ID, null)).rejects.toThrow('not permitted');
    await expect(rejectRegUpdate(as(role), ID, 'no')).rejects.toThrow('not permitted');
    await expect(retryRegUpdate(as(role), ID)).rejects.toThrow('not permitted');
    await expect(requestSourceRetest(as(role), ID)).rejects.toThrow('not permitted');
  });
});
