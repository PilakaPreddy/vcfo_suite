import { addLlmUsage, NO_LLM_USAGE, type LlmProvider, type LlmUsage } from './index';

export interface ModelSpend {
  model: string;
  calls: number;
  usage: LlmUsage;
}

export interface MeteredProvider extends LlmProvider {
  /** What was spent so far, per model. A call that later fails stays counted. */
  spend(): ModelSpend[];
  lastModel(): string | null;
}

/** Wraps a provider so every call on a path is counted, whatever happens to the answer afterwards. */
export function meterProvider(inner: LlmProvider): MeteredProvider {
  const byModel = new Map<string, ModelSpend>();
  let lastModel: string | null = null;
  return {
    name: inner.name,
    async complete(req) {
      const result = await inner.complete(req);
      lastModel = result.model;
      const seen = byModel.get(result.model) ?? { model: result.model, calls: 0, usage: NO_LLM_USAGE };
      byModel.set(result.model, { model: result.model, calls: seen.calls + 1, usage: addLlmUsage(seen.usage, result.usage) });
      return result;
    },
    spend: () => [...byModel.values()],
    lastModel: () => lastModel,
  };
}
