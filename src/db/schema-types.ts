import { customType } from 'drizzle-orm/pg-core';

/**
 * Column helpers shared by the schema files. This file imports no table, so it is safe to use at
 * the top level of a `schema-*.ts` module, which is evaluated before the body of schema.ts.
 */

/** Postgres full-text vector; drizzle has no built-in column type for it. */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

/** Titan Text Embeddings V2 at 512 dimensions (ask_chunks and ask_index_items share it). */
export const EMBEDDING_DIMENSIONS = 512;
