import 'server-only';

import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import { toLlmResult, type LlmProvider, type LlmRequest, type LlmResult } from './index';

/**
 * Amazon Bedrock adapter (Mantle Messages endpoint). AWS credentials come
 * from the standard provider chain (App Runner instance role in AWS).
 * Bedrock model ids take an `anthropic.` prefix; env ids without it get one.
 */
export function createBedrockProvider(region: string): LlmProvider {
  const client = new AnthropicBedrockMantle({ awsRegion: region, maxRetries: 2, timeout: 60_000 });
  const modelId = (model: string) => (model.startsWith('anthropic.') ? model : `anthropic.${model}`);
  return {
    name: 'bedrock',
    async complete(req: LlmRequest): Promise<LlmResult> {
      const response = await client.beta.messages.create({
        model: modelId(req.model),
        max_tokens: req.maxTokens,
        system: req.system,
        messages: req.messages,
        ...(req.tools && req.tools.length > 0 ? { tools: req.tools, tool_choice: { type: 'auto' } } : {}),
        ...(req.effort ? { output_config: { effort: req.effort } } : {}),
      }, req.timeoutMs ? { timeout: req.timeoutMs } : undefined);
      return toLlmResult(response);
    },
  };
}
