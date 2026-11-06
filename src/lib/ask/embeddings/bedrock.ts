import 'server-only';

import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from './types';

/** Titan takes one text per call, so a batch runs a few calls at a time, in input order. */
const CONCURRENCY = 5;

/** Titan Text Embeddings V2 on demand. The SDK loads on the first call, so a `none` machine never pays for it. */
export function bedrockEmbeddingProvider(region: string, model: string): EmbeddingProvider {
  let client: Promise<import('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient> | null = null;
  const connect = () =>
    (client ??= import('@aws-sdk/client-bedrock-runtime').then(
      ({ BedrockRuntimeClient }) =>
        new BedrockRuntimeClient({ region, maxAttempts: 2, requestHandler: { connectionTimeout: 2_000, requestTimeout: 10_000 } }),
    ));

  const embedOne = async (text: string): Promise<number[]> => {
    const { InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
    const response = await (await connect()).send(
      new InvokeModelCommand({
        modelId: model,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({ inputText: text, dimensions: EMBEDDING_DIMENSIONS, normalize: true }),
      }),
    );
    const { embedding } = JSON.parse(new TextDecoder().decode(response.body)) as { embedding?: number[] };
    if (embedding?.length !== EMBEDDING_DIMENSIONS) throw new Error(`Titan returned ${embedding?.length ?? 0} dimensions`);
    return embedding;
  };

  return {
    name: 'bedrock',
    model,
    async embed(texts) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += CONCURRENCY) {
        out.push(...(await Promise.all(texts.slice(i, i + CONCURRENCY).map(embedOne))));
      }
      return out;
    },
  };
}
