import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
const refreshIndexCard = vi.fn(async () => undefined);
vi.mock('@/jobs/client', () => ({ inngest: { send: (...a: unknown[]) => send(...a) } }));
vi.mock('./refresh', () => ({ refreshIndexCard: (...a: unknown[]) => (refreshIndexCard as (...x: unknown[]) => unknown)(...a) }));

const { ASK_INDEX_REFRESH_EVENT, queueIndexRefresh } = await import('./queue');

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ASK_VCFO_ENABLED = 'true';
});

describe('queueIndexRefresh', () => {
  it('does nothing while Ask VCFO is off', async () => {
    process.env.ASK_VCFO_ENABLED = 'false';
    queueIndexRefresh('task', 't1');
    await new Promise((r) => setTimeout(r, 5));
    expect(send).not.toHaveBeenCalled();
  });

  it('sends the refresh event', async () => {
    send.mockResolvedValue(undefined);
    queueIndexRefresh('note', 'n1');
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({ name: ASK_INDEX_REFRESH_EVENT, data: { kind: 'note', id: 'n1' } }));
    expect(refreshIndexCard).not.toHaveBeenCalled();
  });

  it('refreshes in-process when Inngest cannot be reached, and a failure there never reaches the writer', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    send.mockRejectedValue(new Error('no inngest'));
    refreshIndexCard.mockRejectedValueOnce(new Error('database down'));
    expect(() => queueIndexRefresh('request', 'r1')).not.toThrow();
    await vi.waitFor(() => expect(refreshIndexCard).toHaveBeenCalledWith('request', 'r1'));
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    error.mockRestore();
  });
});
