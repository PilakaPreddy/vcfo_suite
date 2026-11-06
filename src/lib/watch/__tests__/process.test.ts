// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SummariseResult } from '../summarise';
import type { RegSummary } from '../types';

const read = vi.fn();
const provider = vi.fn();
const usage = { systemRecordAskUsage: vi.fn(), systemTodayTokenTotal: vi.fn() };
const repo = {
  systemGetPipelineUpdate: vi.fn(),
  systemMarkRegUpdateFailed: vi.fn(),
  systemNoteRegUpdate: vi.fn(),
  systemSaveReadText: vi.fn(),
  systemSaveSummary: vi.fn(),
};

vi.mock('server-only', () => ({}));
vi.mock('@/db/repositories/reg-updates', () => repo);
vi.mock('@/db/repositories/ask-usage', () => usage);
vi.mock('@/lib/ask/config', () => ({ askBudgets: () => ({ dailyTokens: 100 }), askConfig: () => ({ models: { watch: 'claude-haiku-5-5' } }) }));
vi.mock('@/lib/ask/provider', () => ({ getAskProvider: () => provider() }));
vi.mock('../read', async (original) => ({ ...(await original<typeof import('../read')>()), readUpdateText: (...args: unknown[]) => read(...args) }));

const { readStep, summariseStep, verifyStep } = await import('../process');
const { WatchScanWaitsError, WatchReadError } = await import('../read');
const { WatchBlockedError } = await import('../fetch');

const SOURCE = 'The due date for filing is extended to 31 March 2027, as the Board has decided.';
const pending = (status: string, title = 'Extension of due date') => ({
  update: { id: 'u', status, title, sourceUrl: 'https://www.rbi.org.in/a', s3Key: null, sourceText: SOURCE },
  sourceName: 'RBI',
  sourceArea: 'fema',
  sourceAudience: 'everyone',
});
const modelResult = (over: Record<string, unknown> = {}): SummariseResult => ({
  model: 'claude-haiku-5-5',
  usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
  summary: {
    area: 'general',
    act: null,
    changeType: 'due_date',
    effectiveDate: null,
    oldDueDate: null,
    newDueDate: '2027-03-31',
    affects: 'Filers',
    summary: 'The due date moves to 31 March 2027.',
    quote: 'The due date for filing is extended to 31 March 2027',
    ...over,
  } as RegSummary,
});
const saved = () => repo.systemSaveSummary.mock.calls[0]![1];

beforeEach(() => {
  vi.clearAllMocks();
  usage.systemTodayTokenTotal.mockResolvedValue(0);
  usage.systemRecordAskUsage.mockResolvedValue(undefined);
  repo.systemSaveReadText.mockResolvedValue({ mergedInto: null });
  provider.mockResolvedValue({});
});

describe('readStep', () => {
  it('goes on after a read and stops without a model call when the text merged', async () => {
    repo.systemGetPipelineUpdate.mockResolvedValue(pending('queued'));
    read.mockResolvedValue({ text: SOURCE });
    expect(await readStep('u')).toBe('next');
    repo.systemSaveReadText.mockResolvedValue({ mergedInto: 'other' });
    expect(await readStep('u')).toBe('stop');
  });

  it('gives a scan no model once the day budget is spent, and it waits', async () => {
    repo.systemGetPipelineUpdate.mockResolvedValue(pending('queued'));
    usage.systemTodayTokenTotal.mockResolvedValue(100);
    read.mockRejectedValue(new WatchScanWaitsError());
    expect(await readStep('u')).toBe('stop');
    expect(read.mock.calls[0]![1]).toBeNull();
    expect(provider).not.toHaveBeenCalled();
    expect(repo.systemNoteRegUpdate).toHaveBeenCalledWith('u', expect.stringContaining('budget'));
    expect(repo.systemMarkRegUpdateFailed).not.toHaveBeenCalled();
  });

  it('says a scan waits for a model when none is configured', async () => {
    repo.systemGetPipelineUpdate.mockResolvedValue(pending('queued'));
    provider.mockResolvedValue(null);
    read.mockRejectedValue(new WatchScanWaitsError());
    expect(await readStep('u')).toBe('stop');
    expect(repo.systemNoteRegUpdate).toHaveBeenCalledWith('u', expect.stringContaining('No model'));
  });

  it('fails a refused or unreadable document with a reason a reviewer can act on', async () => {
    repo.systemGetPipelineUpdate.mockResolvedValue(pending('queued'));
    read.mockRejectedValueOnce(new WatchBlockedError('bot_check'));
    expect(await readStep('u')).toBe('stop');
    expect(repo.systemMarkRegUpdateFailed).toHaveBeenLastCalledWith('u', expect.stringContaining('Upload the PDF'));
    read.mockRejectedValueOnce(new WatchReadError('This PDF could not be read.'));
    expect(await readStep('u')).toBe('stop');
    expect(repo.systemMarkRegUpdateFailed).toHaveBeenLastCalledWith('u', 'This PDF could not be read.');
  });

  it('leaves a network failure to the job retries and notes it', async () => {
    repo.systemGetPipelineUpdate.mockResolvedValue(pending('queued'));
    read.mockRejectedValue(new Error('timeout'));
    await expect(readStep('u')).rejects.toThrow('timeout');
    expect(repo.systemNoteRegUpdate).toHaveBeenCalledWith('u', expect.stringContaining('tried again'));
  });

  it('does not read twice when a retry finds the text already stored', async () => {
    repo.systemGetPipelineUpdate.mockResolvedValue(pending('read'));
    expect(await readStep('u')).toBe('next');
    expect(read).not.toHaveBeenCalled();
  });
});

describe('summariseStep', () => {
  it('spends nothing once the day budget is spent', async () => {
    repo.systemGetPipelineUpdate.mockResolvedValue(pending('read'));
    usage.systemTodayTokenTotal.mockResolvedValue(100);
    expect(await summariseStep('u')).toBeNull();
    expect(provider).not.toHaveBeenCalled();
    expect(repo.systemNoteRegUpdate).toHaveBeenCalledWith('u', expect.stringContaining('budget'));
  });
});

describe('verifyStep', () => {
  it('saves a clean update as ready for review, with the area from its source and importance from code', async () => {
    repo.systemGetPipelineUpdate.mockResolvedValue(pending('read'));
    expect(await verifyStep('u', modelResult())).toBe('unreviewed');
    expect(saved()).toMatchObject({ importance: 'important', problems: [], summary: { area: 'fema', changeType: 'due_date' } });
  });

  it('holds a date that is not in the source for a person', async () => {
    repo.systemGetPipelineUpdate.mockResolvedValue(pending('read'));
    expect(await verifyStep('u', modelResult({ newDueDate: '2027-04-30' }))).toBe('needs_attention');
    expect(saved().problems[0]).toMatchObject({ field: 'newDueDate', value: '2027-04-30' });
  });

  it('holds a draft summarised as made, because its wording may say the rules are in force', async () => {
    repo.systemGetPipelineUpdate.mockResolvedValue(pending('read', 'Draft rules on the due date'));
    expect(await verifyStep('u', modelResult({ changeType: 'law_in_force' }))).toBe('needs_attention');
    expect(saved()).toMatchObject({ importance: 'normal', summary: { changeType: 'consultation' } });
    expect(saved().problems[0]).toMatchObject({ field: 'changeType', value: 'law_in_force' });
  });

  it('lets a draft the model already read as a proposal through with the same label', async () => {
    repo.systemGetPipelineUpdate.mockResolvedValue(pending('read', 'Draft rules on the due date'));
    expect(await verifyStep('u', modelResult({ changeType: 'consultation' }))).toBe('unreviewed');
    expect(await verifyStep('u', modelResult({ changeType: 'circular' }))).toBe('unreviewed');
  });

  it('keeps a comment deadline on a draft from reading as a moved due date', async () => {
    repo.systemGetPipelineUpdate.mockResolvedValue(pending('read', 'Draft rules on the due date'));
    await verifyStep('u', modelResult({ changeType: 'consultation' }));
    expect(saved().summary).toMatchObject({ oldDueDate: null, newDueDate: null });
  });
});
