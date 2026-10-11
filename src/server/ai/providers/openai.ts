/** OpenAI Chat Completions native fetch adapter for Cloudflare Workers. */
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

interface OpenAIChatCompletionResponse {
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

export const openaiProvider: AIProvider = {
  id: 'openai',
  label: PROVIDER_LABELS.openai,

  isConfigured(env: Env): boolean {
    return resolveProviderApiKey(env, 'openai') !== null;
  },

  async generateStructuredJson(
    env: Env,
    options: AIGenerateJsonOptions,
    fetchFn: typeof fetch = fetch,
  ): Promise<AIGenerateJsonResult> {
    const apiKey = requireProviderApiKey(env, 'openai');
    const model = resolveModelId('openai', options.model);

    const { data, latencyMs } = await executeProviderJsonRequest<OpenAIChatCompletionResponse>(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: options.systemPrompt },
            { role: 'user', content: options.userPrompt },
          ],
          response_format: { type: 'json_object' },
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
      provider: 'openai',
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
