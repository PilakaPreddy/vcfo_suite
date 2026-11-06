// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: class {
    send = send;
  },
  InvokeModelCommand: class {
    constructor(public input: { modelId: string; body: string }) {}
  },
}));

const listChunks = vi.fn();
const saveChunks = vi.fn();
const listCards = vi.fn();
const saveCards = vi.fn();
vi.mock('@/db/repositories/ask-documents', () => ({
  systemListUnembeddedChunks: (...a: unknown[]) => listChunks(...a),
  systemSetChunkEmbeddings: (...a: unknown[]) => saveChunks(...a),
}));
vi.mock('@/db/repositories/ask-index', () => ({
  systemListUnembeddedCards: (...a: unknown[]) => listCards(...a),
  systemSetCardEmbeddings: (...a: unknown[]) => saveCards(...a),
}));

const { bedrockEmbeddingProvider } = await import('@/lib/ask/embeddings/bedrock');
const { embedQuery, getEmbeddingProvider, setEmbeddingProviderForTests } = await import('@/lib/ask/embeddings');
const { backfillEmbeddings } = await import('@/lib/ask/embeddings/backfill');

const vector = (fill = 0.1) => new Array(512).fill(fill);
const titanReply = (values: number[]) => ({ body: new TextEncoder().encode(JSON.stringify({ embedding: values })) });

beforeEach(() => {
  vi.clearAllMocks();
  setEmbeddingProviderForTests(undefined);
});
afterEach(() => {
  setEmbeddingProviderForTests(undefined);
  vi.unstubAllEnvs();
});

describe('Titan request (the SDK is mocked; no call reaches AWS)', () => {
  it('asks for 512 normalised dimensions, one text per call, in input order', async () => {
    send.mockImplementation(async (command: { input: { body: string } }) => {
      const { inputText } = JSON.parse(command.input.body) as { inputText: string };
      return titanReply(vector(Number(inputText) / 100));
    });
    const texts = Array.from({ length: 7 }, (_, i) => String(i));
    const out = await bedrockEmbeddingProvider('ap-south-1', 'amazon.titan-embed-text-v2:0').embed(texts);
    expect(send).toHaveBeenCalledTimes(7);
    const first = send.mock.calls[0]![0] as { input: { modelId: string; body: string } };
    expect(first.input.modelId).toBe('amazon.titan-embed-text-v2:0');
    expect(JSON.parse(first.input.body)).toMatchObject({ dimensions: 512, normalize: true });
    expect(out.map((v) => v[0])).toEqual(texts.map((t) => Number(t) / 100));
  });

  it('refuses a vector of the wrong length', async () => {
    send.mockResolvedValue(titanReply([0.1, 0.2]));
    await expect(bedrockEmbeddingProvider('ap-south-1', 'm').embed(['x'])).rejects.toThrow();
  });
});

describe('provider choice', () => {
  it('is none by default and with no region, so search runs on full text', async () => {
    vi.stubEnv('ASK_EMBEDDINGS_PROVIDER', 'none');
    expect(getEmbeddingProvider()).toBeNull();
    expect(await embedQuery('anything')).toBeNull();
    expect(await backfillEmbeddings()).toEqual({ chunks: 0, cards: 0 });
    expect(listChunks).not.toHaveBeenCalled();
  });

  it('a failed embedding call falls back to full text instead of failing the question', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setEmbeddingProviderForTests({ name: 'bedrock', model: 'm', embed: async () => Promise.reject(new Error('no credentials')) });
    expect(await embedQuery('anything')).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('backfill', () => {
  it('embeds in batches until nothing is left, chunks and cards both', async () => {
    setEmbeddingProviderForTests({ name: 'bedrock', model: 'm', embed: async (texts) => texts.map(() => vector()) });
    listChunks.mockResolvedValueOnce([{ id: 'c1', text: 'a' }, { id: 'c2', text: 'b' }]).mockResolvedValueOnce([]);
    listCards.mockResolvedValueOnce([{ id: 'i1', text: 'z' }]).mockResolvedValueOnce([]);
    expect(await backfillEmbeddings()).toEqual({ chunks: 2, cards: 1 });
    expect(saveChunks).toHaveBeenCalledWith('m', [{ id: 'c1', embedding: vector() }, { id: 'c2', embedding: vector() }]);
    expect(saveCards).toHaveBeenCalledWith('m', [{ id: 'i1', embedding: vector() }]);
  });
});
