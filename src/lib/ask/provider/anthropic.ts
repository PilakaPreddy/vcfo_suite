import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { toLlmResult, type LlmProvider, type LlmRequest, type LlmResult } from './index';
import { anthropicApiKey } from '@/lib/secrets/app-secrets';
import { withSecretRetry, type RuntimeSecret } from '@/lib/secrets/runtime-secret';

/** The API refused the key (HTTP 401): it was rotated or revoked. */
function isUnauthorized(err: unknown): boolean {
  return (err as { status?: unknown } | null)?.status === 401;
}

/**
 * Anthropic API adapter. System blocks carry their own `cache_control`
 * (set by generate.ts on the stable prefix). The server-side refusal
 * fallback is on by default so a classifier false positive is rescued by
 * another model inside the same call rather than failing the answer.
 *
 * KEY (M7): the API key comes from `anthropicApiKey` (Secrets Manager when
 * ANTHROPIC_API_KEY_SECRET_ID is set, else ANTHROPIC_API_KEY). A 401 drops the cached key
 * and the call runs once more with the value read again, so a rotation needs no redeploy.
 */
export function createAnthropicProvider(opts: { refusalFallback: boolean; apiKey?: RuntimeSecret }): LlmProvider {
  const secret = opts.apiKey ?? anthropicApiKey;
  let sdk: { key: string; client: Anthropic } | null = null;
  const clientFor = (key: string): Anthropic => {
    if (sdk?.key !== key)
      sdk = {
        key,
        client: new Anthropic({ apiKey: key, maxRetries: 2, timeout: 60_000 }),
      };
    return sdk.client;
  };
  return {
    name: 'anthropic',
    complete(req: LlmRequest): Promise<LlmResult> {
      return withSecretRetry(secret, (key) => send(clientFor(key), req, opts.refusalFallback), isUnauthorized);
    },
  };
}

async function send(client: Anthropic, req: LlmRequest, refusalFallback: boolean): Promise<LlmResult> {
  const response = await client.beta.messages.create(
    {
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: req.messages,
      ...(req.tools && req.tools.length > 0 ? { tools: req.tools, tool_choice: { type: 'auto' } } : {}),
      ...(req.effort ? { output_config: { effort: req.effort } } : {}),
      ...(refusalFallback
        ? {
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default' as const,
          }
        : {}),
    },
    req.timeoutMs ? { timeout: req.timeoutMs } : undefined,
  );
  return toLlmResult(response);
}
