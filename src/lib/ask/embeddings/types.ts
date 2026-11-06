import { EMBEDDING_DIMENSIONS } from '@/db/schema-types';

export { EMBEDDING_DIMENSIONS };

/**
 * `none` means no vectors at all: search runs on full-text alone. It is the default, so a machine
 * without AWS credentials keeps working.
 */
export type EmbeddingProviderName = 'bedrock' | 'none';

export interface EmbeddingProvider {
  readonly name: EmbeddingProviderName;
  /** Stored in `embedding_model`, so vectors from another model can be found and rebuilt. */
  readonly model: string;
  /** One vector per text, in input order, each `EMBEDDING_DIMENSIONS` long and normalised. */
  embed(texts: readonly string[]): Promise<number[][]>;
}

/** A question's vector, with the model that made it: only vectors from one model can be compared. */
export interface QueryVector {
  values: number[];
  model: string;
}
