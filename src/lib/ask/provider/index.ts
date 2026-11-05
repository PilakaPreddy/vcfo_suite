import 'server-only';

import type Anthropic from '@anthropic-ai/sdk';
import { askConfig } from '@/lib/ask/config';
import { anthropicApiKey } from '@/lib/secrets/app-secrets';

/**
 * Provider seam (OD1). Both adapters speak the Messages API shape, so the
 * pipeline never knows whether a call went to Anthropic or Bedrock.
 */
export type LlmMessage = Anthropic.Beta.BetaMessageParam;
export type LlmTool = Anthropic.Beta.BetaTool;
export type LlmSystemBlock = Anthropic.Beta.BetaTextBlockParam;
type LlmContentBlock = Anthropic.Beta.BetaContentBlock;

export interface LlmRequest {
  model: string;
  system: LlmSystemBlock[];
  messages: LlmMessage[];
  tools?: LlmTool[];
  maxTokens: number;
  /** Only sent when set — models without effort support reject it. */
  effort?: 'low' | 'medium' | 'high';
  /** Per-request timeout (ms) for long jobs such as document transcription. */
  timeoutMs?: number;
}

export interface LlmUsage {
  /** Uncached input only; cache reads and writes are counted apart, as the API reports them. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const NO_LLM_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export function addLlmUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

export interface LlmResult {
  model: string;
  content: LlmContentBlock[];
  stopReason: string | null;
  usage: LlmUsage;
}

/** The one mapping from an API response to the seam, shared by both adapters. */
export function toLlmResult(response: Anthropic.Beta.BetaMessage): LlmResult {
  return {
    model: response.model,
    content: response.content,
    stopReason: response.stop_reason,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

export interface LlmProvider {
  readonly name: string;
  complete(req: LlmRequest): Promise<LlmResult>;
}

let override: LlmProvider | null | undefined;

/** Tests inject a mock provider; `undefined` restores env resolution. */
export function setAskProviderForTests(provider: LlmProvider | null | undefined): void {
  override = provider;
}

let cached: { key: string; provider: LlmProvider | null } | null = null;

/**
 * The configured provider, or null when no credentials exist locally
 * (mirrors the email console-skip: deterministic paths keep working).
 */
export async function getAskProvider(): Promise<LlmProvider | null> {
  if (override !== undefined) return override;
  const config = askConfig();
  // The key's source only (env or Secrets Manager); the value is read per call (M7).
  const key = `${config.provider}:${config.bedrockRegion ?? ''}:${anthropicApiKey.source()}`;
  if (cached?.key === key) return cached.provider;

  let provider: LlmProvider | null = null;
  if (config.provider === 'bedrock') {
    if (config.bedrockRegion) {
      const { createBedrockProvider } = await import('./bedrock');
      provider = createBedrockProvider(config.bedrockRegion);
    }
  } else if (anthropicApiKey.configured()) {
    const { createAnthropicProvider } = await import('./anthropic');
    provider = createAnthropicProvider({ refusalFallback: config.refusalFallback });
  }
  cached = { key, provider };
  return provider;
}
