// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/db/repositories/reg-sources', () => ({}));
vi.mock('@/db/repositories/reg-updates', () => ({}));
vi.mock('@/lib/watch/check', () => ({}));
vi.mock('@/lib/watch/process', () => ({}));
vi.mock('@/lib/watch/publish', () => ({}));
vi.mock('@/lib/ask/config', () => ({ askFlags: () => ({ watch: false }) }));

const { watchCheck } = await import('./watch-check');
const { watchProcess } = await import('./watch-process');
const { watchDailySummary } = await import('./watch-daily-summary');

describe('the Watch jobs as Inngest sees them', () => {
  it('checks hourly, and processes one run at a time per host', () => {
    expect(watchCheck.opts).toMatchObject({ id: 'watch-check', retries: 1, concurrency: { limit: 1 }, triggers: [{ cron: 'TZ=Asia/Kolkata 7 * * * *' }, { event: 'dev/run.watch-check' }] });
    expect(watchProcess.opts).toMatchObject({ id: 'watch-process', retries: 2, concurrency: { limit: 1, key: 'event.data.host' }, triggers: [{ event: 'watch/update.process' }] });
  });

  it('sends the daily summary in the evening', () => {
    expect(watchDailySummary.opts).toMatchObject({ id: 'watch-daily-summary', triggers: [{ cron: 'TZ=Asia/Kolkata 0 18 * * *' }, { event: 'dev/run.watch-daily-summary' }] });
  });
});
