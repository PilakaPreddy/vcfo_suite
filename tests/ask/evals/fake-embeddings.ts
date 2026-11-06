import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from '@/lib/ask/embeddings/types';

/**
 * A stand-in for Titan where AWS is not available: a normalised bag of hashed words and character
 * trigrams. Similar spelling gives similar vectors, so it proves the plumbing (storage, the cosine
 * query, the model filter, the fusion). It says nothing about how well Titan finds similar meaning.
 */
export const FAKE_EMBEDDING_MODEL = 'fake-trigram-512';

function bucket(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) hash = Math.imul(hash ^ token.charCodeAt(i), 16777619);
  return (hash >>> 0) % EMBEDDING_DIMENSIONS;
}

export function fakeVector(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    vector[bucket(word)]! += 2;
    const padded = ` ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) vector[bucket(padded.slice(i, i + 3))]! += 1;
  }
  const length = Math.hypot(...vector) || 1;
  return vector.map((v) => v / length);
}

export const fakeEmbeddingProvider: EmbeddingProvider = {
  name: 'bedrock',
  model: FAKE_EMBEDDING_MODEL,
  embed: async (texts) => texts.map(fakeVector),
};
