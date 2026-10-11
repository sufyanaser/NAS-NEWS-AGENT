import { describe, expect, it, vi } from 'vitest';
import {
  CANARY_AI_API_KEY,
  DEFAULT_MODEL_BY_PROVIDER,
  MODEL_CATALOG,
  calculateEstimatedCostUsd,
  getModelCatalogItem,
  normalizeProviderId,
  resolveModelId,
} from '../src/server/ai/catalog';
import {
  generateWithRetry,
  getProvider,
  getProvidersStatus,
  isAnyProviderConfigured,
  isProviderConfigured,
  testProviderConnection,
} from '../src/server/ai/registry';
import { AIProviderException, type AIProviderId } from '../src/server/ai/types';
import type { Env } from '../src/server/env';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    ASSETS: {} as Fetcher,
    ALLOWED_ORIGIN: 'https://nr.nasfm.info',
    AI_API_KEY: CANARY_AI_API_KEY,
    ...overrides,
  };
}

describe('AI Catalog & Helpers', () => {
  it('contains verified active models for all 4 providers with non-guaranteed free quota pricing notes and no experimental (-exp) IDs', () => {
    const providers: AIProviderId[] = ['gemini', 'openai', 'anthropic', 'openrouter'];
    for (const provider of providers) {
      const models = MODEL_CATALOG.filter((m) => m.provider === provider);
      expect(models.length).toBeGreaterThanOrEqual(2);
      for (const m of models) {
        expect(m.available).toBe(true);
        expect(m.id).not.toContain('-exp');
        expect(m.pricing.verifiedAt).toBe('2026-10-11');
        expect(m.pricing.pricingNote).toContain('مضمونة');
      }
    }
    expect(getModelCatalogItem('anthropic', 'claude-haiku-4-5-20251001')?.available).toBe(true);
    expect(getModelCatalogItem('openrouter', 'google/gemma-3-27b-it:free')?.available).toBe(true);
  });

  it('normalizes provider IDs from diverse inputs and defaults to gemini', () => {
    expect(normalizeProviderId('gemini')).toBe('gemini');
    expect(normalizeProviderId('google')).toBe('gemini');
    expect(normalizeProviderId('Google')).toBe('gemini');
    expect(normalizeProviderId('Google Gemini')).toBe('gemini');
    expect(normalizeProviderId('openai')).toBe('openai');
    expect(normalizeProviderId('OpenAI')).toBe('openai');
    expect(normalizeProviderId('OpenAI GPT')).toBe('openai');
    expect(normalizeProviderId('anthropic')).toBe('anthropic');
    expect(normalizeProviderId('Anthropic Claude')).toBe('anthropic');
    expect(normalizeProviderId('openrouter')).toBe('openrouter');
    expect(normalizeProviderId('OpenRouter')).toBe('openrouter');
    expect(normalizeProviderId('')).toBe('gemini');
    expect(normalizeProviderId(null)).toBe('gemini');
    expect(normalizeProviderId(undefined)).toBe('gemini');
  });

  it('resolves valid models per provider, allows custom/legacy IDs, and falls back when model belongs to another provider', () => {
    expect(resolveModelId('gemini', 'gemini-2.5-pro')).toBe('gemini-2.5-pro');
    expect(resolveModelId('gemini', '')).toBe(DEFAULT_MODEL_BY_PROVIDER.gemini);
    expect(resolveModelId('openai', 'gemini-2.5-flash')).toBe(DEFAULT_MODEL_BY_PROVIDER.openai);
    expect(resolveModelId('anthropic', 'gpt-4.1-mini')).toBe(DEFAULT_MODEL_BY_PROVIDER.anthropic);
    expect(resolveModelId('anthropic', 'claude-haiku-4-5-20251001')).toBe(
      'claude-haiku-4-5-20251001',
    );
    expect(resolveModelId('anthropic', 'claude-3-5-haiku-latest')).toBe('claude-3-5-haiku-latest');
    expect(resolveModelId('openrouter', 'google/gemma-3-27b-it:free')).toBe(
      'google/gemma-3-27b-it:free',
    );
    expect(resolveModelId('openrouter', 'qwen/qwen-2.5-72b-instruct:free')).toBe(
      'qwen/qwen-2.5-72b-instruct:free',
    );
    expect(getModelCatalogItem('openai', 'gpt-4.1')?.tier).toBe('paid');
  });

  it('calculates estimated cost USD accurately for free vs paid models', () => {
    // Free tier models return 0
    expect(calculateEstimatedCostUsd('gemini', 'gemini-2.5-flash', 50_000, 10_000)).toBe(0);
    expect(
      calculateEstimatedCostUsd(
        'openrouter',
        'meta-llama/llama-3.3-70b-instruct:free',
        100_000,
        50_000,
      ),
    ).toBe(0);

    // Paid models compute exact cost rounded to 6 decimal places
    // gpt-4.1-mini: $0.40 / 1M input, $1.60 / 1M output
    expect(calculateEstimatedCostUsd('openai', 'gpt-4.1-mini', 10_000, 5_000)).toBe(0.012);

    // claude-sonnet-4-20250514: $3.00 / 1M input, $15.00 / 1M output
    expect(
      calculateEstimatedCostUsd('anthropic', 'claude-sonnet-4-20250514', 2_000, 1_000),
    ).toBe(0.021);

    // Zero tokens returns 0
    expect(calculateEstimatedCostUsd('openai', 'gpt-4.1', 0, 0)).toBe(0);
  });

  it('treats the Vitest canary key on AI_API_KEY as unconfigured unless set on a provider binding', () => {
    const defaultEnv = makeEnv();
    expect(isProviderConfigured(defaultEnv, 'gemini')).toBe(false);
    expect(isProviderConfigured(defaultEnv, 'openai')).toBe(false);
    expect(isAnyProviderConfigured(defaultEnv)).toBe(false);

    const configuredGeminiEnv = makeEnv({ GEMINI_API_KEY: 'gm-real-key' });
    expect(isProviderConfigured(configuredGeminiEnv, 'gemini')).toBe(true);
    expect(isProviderConfigured(configuredGeminiEnv, 'openai')).toBe(false);
    expect(isAnyProviderConfigured(configuredGeminiEnv)).toBe(true);

    const statusList = getProvidersStatus(configuredGeminiEnv);
    expect(statusList.find((s) => s.provider === 'gemini')?.configured).toBe(true);
    expect(statusList.find((s) => s.provider === 'openai')?.configured).toBe(false);
  });
});

describe('Provider Adapters & Error Classification', () => {
  it('generates structured JSON with Google Gemini using x-goog-api-key header (never URL query)', async () => {
    const secretKey = 'gemini-secret-key-xyz-999';
    const env = makeEnv({ GEMINI_API_KEY: secretKey });
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    const mockFetch: typeof fetch = vi.fn(async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: '{"headline":"عنوان تجريبي"}' }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 120,
            candidatesTokenCount: 45,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const provider = getProvider('gemini');
    const res = await provider.generateStructuredJson(
      env,
      {
        model: 'gemini-2.5-flash',
        systemPrompt: 'نظام',
        userPrompt: 'مستخدم',
      },
      mockFetch,
    );

    expect(capturedUrl).not.toContain(secretKey);
    expect(capturedUrl).not.toContain('key=');
    expect(capturedHeaders['x-goog-api-key']).toBe(secretKey);
    expect(res.rawText).toBe('{"headline":"عنوان تجريبي"}');
    expect(res.inputTokens).toBe(120);
    expect(res.outputTokens).toBe(45);
    expect(res.provider).toBe('gemini');
  });

  it('generates structured JSON with OpenAI, Anthropic, and OpenRouter and parses token counts', async () => {
    const env = makeEnv({
      OPENAI_API_KEY: 'sk-openai-test',
      ANTHROPIC_API_KEY: 'sk-ant-test',
      OPENROUTER_API_KEY: 'sk-or-test',
    });

    const openAiFetch: typeof fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"headline":"خبر أوبن إيه آي"}' } }],
          usage: { prompt_tokens: 200, completion_tokens: 80 },
        }),
        { status: 200 },
      );
    });

    const openAiRes = await getProvider('openai').generateStructuredJson(
      env,
      { model: 'gpt-4.1-mini', systemPrompt: 'sys', userPrompt: 'usr' },
      openAiFetch,
    );
    expect(openAiRes.rawText).toBe('{"headline":"خبر أوبن إيه آي"}');
    expect(openAiRes.inputTokens).toBe(200);
    expect(openAiRes.outputTokens).toBe(80);

    const anthropicFetch: typeof fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: '{"headline":"خبر أنثروبيك"}' }],
          usage: { input_tokens: 310, output_tokens: 95 },
        }),
        { status: 200 },
      );
    });

    const anthropicRes = await getProvider('anthropic').generateStructuredJson(
      env,
      { model: 'claude-sonnet-4-20250514', systemPrompt: 'sys', userPrompt: 'usr' },
      anthropicFetch,
    );
    expect(anthropicRes.rawText).toBe('{"headline":"خبر أنثروبيك"}');
    expect(anthropicRes.inputTokens).toBe(310);
    expect(anthropicRes.outputTokens).toBe(95);

    const openRouterFetch: typeof fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"headline":"خبر أوبن راوتر"}' } }],
          usage: { prompt_tokens: 150, completion_tokens: 60 },
        }),
        { status: 200 },
      );
    });

    const openRouterRes = await getProvider('openrouter').generateStructuredJson(
      env,
      {
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        systemPrompt: 'sys',
        userPrompt: 'usr',
      },
      openRouterFetch,
    );
    expect(openRouterRes.rawText).toBe('{"headline":"خبر أوبن راوتر"}');
    expect(openRouterRes.inputTokens).toBe(150);
    expect(openRouterRes.outputTokens).toBe(60);
  });

  it('classifies not_configured, auth_error (401/403), quota_exceeded (402), rate_limited (429), provider_down (503), and timeout', async () => {
    const unconfiguredEnv = makeEnv();
    await expect(
      getProvider('openai').generateStructuredJson(unconfiguredEnv, {
        model: 'gpt-4.1-mini',
        systemPrompt: 's',
        userPrompt: 'u',
      }),
    ).rejects.toMatchObject({
      errorClass: 'not_configured',
      statusCode: 503,
      retryable: false,
    });

    const env = makeEnv({ OPENAI_API_KEY: 'sk-test-secret' });

    const cases: Array<{
      status: number;
      body?: string;
      expectedClass: string;
      expectedStatus: number;
      retryable: boolean;
    }> = [
      { status: 401, expectedClass: 'auth_error', expectedStatus: 502, retryable: false },
      { status: 403, expectedClass: 'auth_error', expectedStatus: 502, retryable: false },
      { status: 402, expectedClass: 'quota_exceeded', expectedStatus: 429, retryable: false },
      { status: 429, expectedClass: 'rate_limited', expectedStatus: 429, retryable: true },
      { status: 503, expectedClass: 'provider_down', expectedStatus: 502, retryable: true },
    ];

    for (const c of cases) {
      const mockFetch: typeof fetch = vi.fn(
        async () => new Response(c.body ?? 'error', { status: c.status }),
      );
      await expect(
        getProvider('openai').generateStructuredJson(
          env,
          { model: 'gpt-4.1-mini', systemPrompt: 's', userPrompt: 'u' },
          mockFetch,
        ),
      ).rejects.toMatchObject({
        errorClass: c.expectedClass,
        statusCode: c.expectedStatus,
        retryable: c.retryable,
      });
    }

    // Timeout via AbortError
    const timeoutFetch: typeof fetch = vi.fn(async () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    });

    await expect(
      getProvider('openai').generateStructuredJson(
        env,
        { model: 'gpt-4.1-mini', systemPrompt: 's', userPrompt: 'u', timeoutMs: 50 },
        timeoutFetch,
      ),
    ).rejects.toMatchObject({
      errorClass: 'timeout',
      statusCode: 504,
      retryable: true,
    });
  });

  it('retries once on transient 429/503 in generateWithRetry and does NOT retry on 401 auth_error', async () => {
    const env = makeEnv({ GEMINI_API_KEY: 'gm-retry-key' });

    let transientCalls = 0;
    const transientFetch: typeof fetch = vi.fn(async () => {
      transientCalls += 1;
      if (transientCalls === 1) {
        return new Response('Rate limit exceeded', { status: 429 });
      }
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
        { status: 200 },
      );
    });

    const result = await generateWithRetry(
      env,
      {
        providerId: 'gemini',
        model: 'gemini-2.5-flash',
        systemPrompt: 's',
        userPrompt: 'u',
      },
      transientFetch,
    );
    expect(transientCalls).toBe(2);
    expect(result.rawText).toBe('{"ok":true}');

    let authCalls = 0;
    const authFetch: typeof fetch = vi.fn(async () => {
      authCalls += 1;
      return new Response('Unauthorized', { status: 401 });
    });

    await expect(
      generateWithRetry(
        env,
        {
          providerId: 'gemini',
          model: 'gemini-2.5-flash',
          systemPrompt: 's',
          userPrompt: 'u',
        },
        authFetch,
      ),
    ).rejects.toBeInstanceOf(AIProviderException);
    expect(authCalls).toBe(1);
  });

  it('testProviderConnection returns status without throwing and NEVER leaks secret key on upstream echo', async () => {
    const env = makeEnv({
      ANTHROPIC_API_KEY: CANARY_AI_API_KEY,
    });

    const echoingErrorFetch: typeof fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: `Invalid API Key provided: ${CANARY_AI_API_KEY}`,
          },
        }),
        { status: 401 },
      );
    });

    const status = await testProviderConnection(
      env,
      { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
      echoingErrorFetch,
    );

    expect(status.ok).toBe(false);
    expect(status.configured).toBe(true);
    expect(status.connected).toBe(false);
    expect(status.errorClass).toBe('auth_error');
    expect(JSON.stringify(status)).not.toContain(CANARY_AI_API_KEY);
  });
});
