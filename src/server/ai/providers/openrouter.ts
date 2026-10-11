/** OpenRouter Chat Completions native fetch adapter for Cloudflare Workers. */
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

interface OpenRouterChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export const openrouterProvider: AIProvider = {
  id: 'openrouter',
  label: PROVIDER_LABELS.openrouter,

  isConfigured(env: Env): boolean {
    return resolveProviderApiKey(env, 'openrouter') !== null;
  },

  async generateStructuredJson(
    env: Env,
    options: AIGenerateJsonOptions,
    fetchFn: typeof fetch = fetch,
  ): Promise<AIGenerateJsonResult> {
    const apiKey = requireProviderApiKey(env, 'openrouter');
    const model = resolveModelId('openrouter', options.model);

    const { data, latencyMs } = await executeProviderJsonRequest<OpenRouterChatCompletionResponse>(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://nr.nasfm.info',
          'X-Title': 'NAS Newsroom',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: options.systemPrompt },
            { role: 'user', content: options.userPrompt },
          ],
          temperature: options.temperature ?? 0.2,
          max_tokens: options.maxOutputTokens ?? 2500,
        }),
      },
      options.timeoutMs ?? 25000,
      fetchFn,
    );

    const content = data.choices?.[0]?.message?.content;
    const rawText = typeof content === 'string' ? content.trim() : '';

    if (!rawText) {
      throw new AIProviderException(
        'invalid_response',
        AI_ERROR_MESSAGES.invalid_response,
        502,
        false,
      );
    }

    const inputTokens = Math.max(0, Number(data.usage?.prompt_tokens ?? 0) || 0);
    const outputTokens = Math.max(0, Number(data.usage?.completion_tokens ?? 0) || 0);

    return {
      rawText,
      inputTokens,
      outputTokens,
      latencyMs,
      provider: 'openrouter',
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
