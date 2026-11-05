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
  /** Asks for JSON matching this schema as the reply, which costs far fewer tokens than a tool call. */
  outputSchema?: Record<string, unknown>;
  /** Per-request timeout (ms) for long jobs such as document transcription. */
  timeoutMs?: number;
}

export interface LlmResult {
  model: string;
  content: LlmContentBlock[];
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

export interface LlmProvider {
  readonly name: string;
  complete(req: LlmRequest): Promise<LlmResult>;
}

export function outputConfigFor(req: LlmRequest) {
  if (!req.effort && !req.outputSchema) return {};
  return {
    output_config: {
      ...(req.effort ? { effort: req.effort } : {}),
      ...(req.outputSchema ? { format: { type: 'json_schema' as const, schema: req.outputSchema } } : {}),
    },
  };
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
