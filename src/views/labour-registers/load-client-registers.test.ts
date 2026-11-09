import { beforeEach, describe, expect, it, vi } from 'vitest';

const listBatches = vi.fn();
const listDocuments = vi.fn();
const listUploads = vi.fn();

vi.mock('@/db/repositories/labour-registers', () => ({ listBatches, listDocuments, listUploads }));

const { loadClientRegistersView } = await import('./load-client-registers');

/**
 * The read the client's screen runs on.
 *
 * It is tested because of how it came to be missing. `ClientRegistersPage` took four answers
 * as props, the route passed none of them, and the component fell back to its defaults: the
 * map lit for every configured state, every row saying SBC was preparing it, and no download
 * link on any row however long ago the files were produced. Nothing failed — a component with
 * sensible defaults looks identical to a working one until you ask where its data comes from.
 *
 * So the assertions here are about the wiring rather than the rendering: that the four answers
 * are computed, that a form without a file does not get a link, and that a client with no
 * batches gets an honest empty screen instead of a confident wrong one.
 */
const ctx = { role: 'client', userId: 'u1' } as never;

function batch(over: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    engagementId: 'e1',
    stateCode: 'TG',
    periodFrom: '2026-09-01',
    periodTo: '2026-09-30',
    status: 'ready',
    markedReadyAt: new Date('2026-10-02'),
    ...over,
  };
}

beforeEach(() => {
  listBatches.mockReset().mockResolvedValue([]);
  listDocuments.mockReset().mockResolvedValue([]);
  listUploads.mockReset().mockResolvedValue([]);
});

describe('where the client employs people', () => {
  it('reads the states from their own batches, newest first', async () => {
    listBatches.mockResolvedValue([batch({ stateCode: 'KA' }), batch({ stateCode: 'TG' }), batch({ stateCode: 'KA' })]);
    const view = await loadClientRegistersView(ctx, { period: '2026-09' });
    /* De-duplicated, and the order kept: the state they most recently had registers prepared
       for is the one they are looking for. */
    expect(view.establishments).toEqual(['KA', 'TG']);
  });

  it('gives an honest empty screen when they have no batches at all', async () => {
    const view = await loadClientRegistersView(ctx, {});
    expect(view.establishments).toEqual([]);
    expect(view.ready).toBe(false);
    expect(view.batchId).toBeUndefined();
    expect(view.documentsByForm).toBeUndefined();
  });

  it('ignores a state in the URL that is not one of theirs', async () => {
    listBatches.mockResolvedValue([batch({ stateCode: 'TG' })]);
    const view = await loadClientRegistersView(ctx, { stateCode: 'KL', period: '2026-09' });
    expect(view.stateCode).toBe('TG');
  });
});

describe('which registers exist', () => {
  it('offers a file for a form that has one, and nothing for a form that does not', async () => {
    listBatches.mockResolvedValue([batch()]);
    listDocuments.mockResolvedValue([
      { id: 'd1', formId: 'in-wages-iv', format: 'xlsx' },
      { id: 'd2', formId: 'in-wages-ix', format: 'pdf' },
    ]);

    const view = await loadClientRegistersView(ctx, { stateCode: 'TG', period: '2026-09' });
    expect(view.ready).toBe(true);
    expect(view.batchId).toBe('b1');
    expect(view.documentsByForm).toEqual({ 'in-wages-iv': 'd1', 'in-wages-ix': 'd2' });
    /* A form nobody produced is simply absent, so its row shows the status word instead of a
       link that would 404. */
    expect(view.documentsByForm?.['in-wages-i']).toBeUndefined();
  });

  it('prefers the workbook over the printout for the same form', async () => {
    /* A client opening a register wants the file they can read; the signing copy is the
       firm's working artefact. */
    listBatches.mockResolvedValue([batch()]);
    listDocuments.mockResolvedValue([
      { id: 'pdf1', formId: 'in-wages-iv', format: 'pdf' },
      { id: 'xlsx1', formId: 'in-wages-iv', format: 'xlsx' },
    ]);
    const view = await loadClientRegistersView(ctx, { stateCode: 'TG', period: '2026-09' });
    expect(view.documentsByForm).toEqual({ 'in-wages-iv': 'xlsx1' });
  });

  it('is not ready when the batch exists but nothing was produced', async () => {
    listBatches.mockResolvedValue([batch()]);
    const view = await loadClientRegistersView(ctx, { stateCode: 'TG', period: '2026-09' });
    expect(view.ready).toBe(false);
    expect(view.documentsByForm).toEqual({});
  });

  it('finds no batch for a period nobody opened', async () => {
    listBatches.mockResolvedValue([batch()]);
    const view = await loadClientRegistersView(ctx, { stateCode: 'TG', period: '2026-08' });
    expect(view.batchId).toBeUndefined();
    expect(view.ready).toBe(false);
  });
});

describe('what is pending with the client', () => {
  it('asks for the paysheet when the period is open and none was uploaded', async () => {
    listBatches.mockResolvedValue([batch({ markedReadyAt: null })]);
    const view = await loadClientRegistersView(ctx, { stateCode: 'TG', period: '2026-09' });
    expect(view.awaiting?.what).toContain('payroll sheet');
    /* The tenth of the month after the period, which is when the state returns fall due. */
    expect(view.awaiting?.by).toBe('2026-10-10');
  });

  it('asks for nothing once the paysheet is in', async () => {
    listBatches.mockResolvedValue([batch({ markedReadyAt: null })]);
    listUploads.mockResolvedValue([{ slot: 'paysheet' }]);
    const view = await loadClientRegistersView(ctx, { stateCode: 'TG', period: '2026-09' });
    expect(view.awaiting).toBeUndefined();
  });

  it('asks for nothing once the period is closed', async () => {
    listBatches.mockResolvedValue([batch()]);
    const view = await loadClientRegistersView(ctx, { stateCode: 'TG', period: '2026-09' });
    expect(view.awaiting).toBeUndefined();
  });
});
