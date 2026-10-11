/** Anthropic Messages API native fetch adapter for Cloudflare Workers. */
import type { Env } from '../../env';
import {
  AI_ERROR_MESSAGES,
  PROVIDER_LABELS,
  executeProviderJsonRequest,
  requireProviderApiKey,
  resolveModelId,
  resolveProviderApiKey,
  runProviderConnectionTest,
} from '../catalog';
import {
  AIProviderException,
  type AIGenerateJsonOptions,
  type AIGenerateJsonResult,
  type AIProvider,
  type TestModelResponseDto,
} from '../types';

interface AnthropicMessagesResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export const anthropicProvider: AIProvider = {
  id: 'anthropic',
  label: PROVIDER_LABELS.anthropic,

  isConfigured(env: Env): boolean {
    return resolveProviderApiKey(env, 'anthropic') !== null;
  },

  async generateStructuredJson(
    env: Env,
    options: AIGenerateJsonOptions,
    fetchFn: typeof fetch = fetch,
  ): Promise<AIGenerateJsonResult> {
    const apiKey = requireProviderApiKey(env, 'anthropic');
    const model = resolveModelId('anthropic', options.model);

    const { data, latencyMs } = await executeProviderJsonRequest<AnthropicMessagesResponse>(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          system: options.systemPrompt,
          messages: [{ role: 'user', content: options.userPrompt }],
          temperature: options.temperature ?? 0.2,
          max_tokens: options.maxOutputTokens ?? 2500,
        }),
      },
      options.timeoutMs ?? 25000,
      fetchFn,
    );

    const blocks = data.content;
    const rawText = Array.isArray(blocks)
      ? blocks
          .map((block) => (typeof block?.text === 'string' ? block.text : ''))
          .join('')
          .trim()
      : '';

    if (!rawText) {
      throw new AIProviderException(
        'invalid_response',
        AI_ERROR_MESSAGES.invalid_response,
        502,
        false,
      );
    }

    const inputTokens = Math.max(0, Number(data.usage?.input_tokens ?? 0) || 0);
    const outputTokens = Math.max(0, Number(data.usage?.output_tokens ?? 0) || 0);

    return {
      rawText,
      inputTokens,
      outputTokens,
      latencyMs,
      provider: 'anthropic',
      model,
    };
  },

  async testConnection(
    env: Env,
    model?: string,
    fetchFn: typeof fetch = fetch,
  ): Promise<TestModelResponseDto> {
    return runProviderConnectionTest(this, env, model, fetchFn);
  },
};
