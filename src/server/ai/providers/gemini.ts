/** Google Gemini native fetch adapter for Cloudflare Workers. */
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

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export const geminiProvider: AIProvider = {
  id: 'gemini',
  label: PROVIDER_LABELS.gemini,

  isConfigured(env: Env): boolean {
    return resolveProviderApiKey(env, 'gemini') !== null;
  },

  async generateStructuredJson(
    env: Env,
    options: AIGenerateJsonOptions,
    fetchFn: typeof fetch = fetch,
  ): Promise<AIGenerateJsonResult> {
    const apiKey = requireProviderApiKey(env, 'gemini');
    const model = resolveModelId('gemini', options.model);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const { data, latencyMs } = await executeProviderJsonRequest<GeminiGenerateContentResponse>(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: options.systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: options.userPrompt }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: options.temperature ?? 0.2,
            maxOutputTokens: options.maxOutputTokens ?? 2500,
          },
        }),
      },
      options.timeoutMs ?? 25000,
      fetchFn,
    );

    const parts = data.candidates?.[0]?.content?.parts;
    const rawText = Array.isArray(parts)
      ? parts
          .map((part) => (typeof part?.text === 'string' ? part.text : ''))
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

    const inputTokens = Math.max(0, Number(data.usageMetadata?.promptTokenCount ?? 0) || 0);
    const outputTokens = Math.max(0, Number(data.usageMetadata?.candidatesTokenCount ?? 0) || 0);

    return {
      rawText,
      inputTokens,
      outputTokens,
      latencyMs,
      provider: 'gemini',
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
