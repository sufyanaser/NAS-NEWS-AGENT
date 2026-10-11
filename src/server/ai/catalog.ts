/** Verified AI provider and model catalog with pricing metadata for NAS Newsroom. */
import type { Env } from '../env';
import {
  AIProviderException,
  type AIErrorClass,
  type AIModelCatalogItemDto,
  type AIProvider,
  type AIProviderId,
  type TestModelResponseDto,
} from './types';

export const CANARY_AI_API_KEY = 'test-canary-ai-key-DO-NOT-LEAK-9f3a';

export const AI_ERROR_MESSAGES: Record<AIErrorClass, string> = {
  not_configured:
    'مزود الذكاء الاصطناعي غير مهيأ على الخادم. يرجى ضبط مفتاح المزود في أسرار Cloudflare Worker.',
  auth_error:
    'فشل التحقق من مفتاح المزود في الخادم. يرجى مراجعة إعدادات السر في Cloudflare Worker.',
  quota_exceeded: 'تم تجاوز الحصة المتاحة أو الرصيد لدى مزود الذكاء الاصطناعي.',
  rate_limited: 'تم تجاوز حد الطلبات المؤقت لدى المزود. يرجى المحاولة بعد قليل.',
  timeout: 'انتهت مهلة الاتصال بمزود الذكاء الاصطناعي قبل اكتمال الاستجابة.',
  provider_down:
    'مزود الذكاء الاصطناعي غير متاح مؤقتاً. يمكنك المحاولة مجدداً أو المتابعة بالتحرير اليدوي.',
  invalid_response: 'أعاد المزود استجابة غير صالحة ولا تطابق التنسيق المطلوب.',
};

export const PROVIDER_LABELS: Record<AIProviderId, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  openrouter: 'OpenRouter',
};

export const DEFAULT_PROVIDER_ID: AIProviderId = 'gemini';

export const DEFAULT_MODEL_BY_PROVIDER: Record<AIProviderId, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-sonnet-4-20250514',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
};

export const MODEL_CATALOG: readonly AIModelCatalogItemDto[] = [
  {
    id: 'gemini-2.5-flash',
    provider: 'gemini',
    label: 'Gemini 2.5 Flash (موصى به — متوازن وسريع)',
    tier: 'free',
    pricing: {
      inputPerMillionUsd: 0.15,
      outputPerMillionUsd: 0.6,
      isFreeTier: true,
      pricingNote:
        'الحصة المجانية في Google AI Studio غير مضمونة وتخضع لأهلية الحساب وحدود الطلبات اليومية (Rate Limits)؛ وفي الطبقة المدفوعة 0.15$ للمدخلات / 0.60$ للمخرجات لكل مليون توكن',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'الاستخراج التحريري اليومي والصياغة الإذاعية السريعة',
    available: true,
  },
  {
    id: 'gemini-2.5-flash-lite',
    provider: 'gemini',
    label: 'Gemini 2.5 Flash-Lite (اقتصادي فائق السرعة)',
    tier: 'free',
    pricing: {
      inputPerMillionUsd: 0.075,
      outputPerMillionUsd: 0.3,
      isFreeTier: true,
      pricingNote:
        'الحصة المجانية في Google AI Studio غير مضمونة وتخضع لأهلية الحساب وحدود الاستخدام؛ وفي الطبقة المدفوعة 0.075$ للمدخلات / 0.30$ للمخرجات لكل مليون توكن',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'الأخبار القصيرة والمعالجة السريعة منخفضة التكلفة',
    available: true,
  },
  {
    id: 'gemini-2.5-pro',
    provider: 'gemini',
    label: 'Gemini 2.5 Pro (تحليل معمق)',
    tier: 'paid',
    pricing: {
      inputPerMillionUsd: 1.25,
      outputPerMillionUsd: 10.0,
      isFreeTier: false,
      pricingNote:
        'مدفوع حسب الاستخدام: 1.25$ للمدخلات / 10.00$ للمخرجات لكل مليون توكن (الحصة المجانية غير مضمونة وتتطلب تفعيل الفوترة أو أهلية AI Studio)',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'التقارير المركبة والترجمة التحريرية الدقيقة من الإنجليزية',
    available: true,
  },
  {
    id: 'gpt-4.1-mini',
    provider: 'openai',
    label: 'GPT-4.1 Mini (سريع ومتوازن التكلفة)',
    tier: 'paid',
    pricing: {
      inputPerMillionUsd: 0.4,
      outputPerMillionUsd: 1.6,
      isFreeTier: false,
      pricingNote:
        'مدفوع حسب الاستخدام: 0.40$ للمدخلات / 1.60$ للمخرجات لكل مليون توكن (لا توجد طبقة مجانية مضمونة في OpenAI API ويتطلب رصيداً فعالاً)',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'الصياغة الإخبارية السريعة والالتزام الصارم بمخطط JSON',
    available: true,
  },
  {
    id: 'gpt-4.1',
    provider: 'openai',
    label: 'GPT-4.1 (دقة تحريرية عالية)',
    tier: 'paid',
    pricing: {
      inputPerMillionUsd: 2.0,
      outputPerMillionUsd: 8.0,
      isFreeTier: false,
      pricingNote:
        'مدفوع حسب الاستخدام: 2.00$ للمدخلات / 8.00$ للمخرجات لكل مليون توكن (لا توجد طبقة مجانية مضمونة في OpenAI API ويتطلب رصيداً فعالاً)',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'التحرير الإذاعي المتقدم ومطابقة الإسناد الصارمة',
    available: true,
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    label: 'GPT-4o Mini (اقتصادي)',
    tier: 'paid',
    pricing: {
      inputPerMillionUsd: 0.15,
      outputPerMillionUsd: 0.6,
      isFreeTier: false,
      pricingNote:
        'مدفوع حسب الاستخدام: 0.15$ للمدخلات / 0.60$ للمخرجات لكل مليون توكن (لا توجد طبقة مجانية مضمونة في OpenAI API ويتطلب رصيداً فعالاً)',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'المعالجة الاقتصادية السريعة',
    available: true,
  },
  {
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    label: 'Claude Sonnet 4 (جودة لغوية عربية ممتازة)',
    tier: 'paid',
    pricing: {
      inputPerMillionUsd: 3.0,
      outputPerMillionUsd: 15.0,
      isFreeTier: false,
      pricingNote:
        'مدفوع حسب الاستخدام: 3.00$ للمدخلات / 15.00$ للمخرجات لكل مليون توكن (لا توجد طبقة مجانية مضمونة في Anthropic API ويتطلب رصيداً مسبق الدفع)',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'الصياغة العربية الرصينة وتحليل المصادر الطويلة',
    available: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    label: 'Claude Haiku 4.5 (سريع واقتصادي)',
    tier: 'paid',
    pricing: {
      inputPerMillionUsd: 1.0,
      outputPerMillionUsd: 5.0,
      isFreeTier: false,
      pricingNote:
        'مدفوع حسب الاستخدام: 1.00$ للمدخلات / 5.00$ للمخرجات لكل مليون توكن (لا توجد طبقة مجانية مضمونة في Anthropic API ويتطلب رصيداً مسبق الدفع)',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'الاستخراج السريع للمسودات اليومية',
    available: true,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    provider: 'openrouter',
    label: 'Llama 3.3 70B Instruct (مجاني عبر OpenRouter)',
    tier: 'free',
    pricing: {
      inputPerMillionUsd: 0,
      outputPerMillionUsd: 0,
      isFreeTier: true,
      pricingNote:
        'الحصة المجانية (0.00$) عبر OpenRouter غير مضمونة وتخضع لحدود معدل الطلبات (Rate Limits) وأهلية المزود وتوافر السعة',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'التجربة المجانية والتوليد الاحتياطي',
    available: true,
  },
  {
    id: 'google/gemma-3-27b-it:free',
    provider: 'openrouter',
    label: 'Gemma 3 27B Instruct (مجاني عبر OpenRouter)',
    tier: 'free',
    pricing: {
      inputPerMillionUsd: 0,
      outputPerMillionUsd: 0,
      isFreeTier: true,
      pricingNote:
        'الحصة المجانية (0.00$) عبر OpenRouter غير مضمونة وتخضع لحدود معدل الطلبات اليومية (Rate Limits) وتوافر المزود',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'التوليد السريع المجاني عبر بوابة موحدة',
    available: true,
  },
  {
    id: 'qwen/qwen-2.5-72b-instruct:free',
    provider: 'openrouter',
    label: 'Qwen 2.5 72B Instruct (مجاني — داعم للعربية)',
    tier: 'free',
    pricing: {
      inputPerMillionUsd: 0,
      outputPerMillionUsd: 0,
      isFreeTier: true,
      pricingNote:
        'الحصة المجانية (0.00$) عبر OpenRouter غير مضمونة وتخضع لحدود الطلبات اليومية (Rate Limits) وأهلية الحساب',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'المعالجة العربية متعددة الصيغ بدون تكلفة',
    available: true,
  },
];

export function normalizeProviderId(raw?: string | null): AIProviderId {
  if (!raw || typeof raw !== 'string') {
    return DEFAULT_PROVIDER_ID;
  }
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_PROVIDER_ID;
  }
  if (normalized === 'openrouter' || normalized.includes('openrouter')) {
    return 'openrouter';
  }
  if (normalized === 'openai' || normalized.includes('openai')) {
    return 'openai';
  }
  if (
    normalized === 'anthropic' ||
    normalized.includes('anthropic') ||
    normalized.includes('claude')
  ) {
    return 'anthropic';
  }
  if (
    normalized === 'gemini' ||
    normalized === 'google' ||
    normalized.includes('gemini') ||
    normalized.includes('google')
  ) {
    return 'gemini';
  }
  return DEFAULT_PROVIDER_ID;
}

export function getModelCatalogItem(
  provider: AIProviderId,
  modelId: string,
): AIModelCatalogItemDto | undefined {
  return MODEL_CATALOG.find((item) => item.provider === provider && item.id === modelId);
}

export function resolveModelId(provider: AIProviderId, requestedModel?: string | null): string {
  if (!requestedModel || typeof requestedModel !== 'string') {
    return DEFAULT_MODEL_BY_PROVIDER[provider];
  }
  const trimmed = requestedModel.trim();
  if (!trimmed) {
    return DEFAULT_MODEL_BY_PROVIDER[provider];
  }

  // Exact match for this provider in catalog
  const directMatch = getModelCatalogItem(provider, trimmed);
  if (directMatch) {
    return directMatch.id;
  }

  // If the requested model belongs to a different provider in the catalog, fallback to provider default
  const otherProviderMatch = MODEL_CATALOG.find(
    (item) => item.id === trimmed && item.provider !== provider,
  );
  if (otherProviderMatch) {
    return DEFAULT_MODEL_BY_PROVIDER[provider];
  }

  // Guard against cross-provider prefixes when switching providers
  const lower = trimmed.toLowerCase();
  if (provider !== 'gemini' && provider !== 'openrouter' && lower.startsWith('gemini-')) {
    return DEFAULT_MODEL_BY_PROVIDER[provider];
  }
  if (provider !== 'openai' && provider !== 'openrouter' && lower.startsWith('gpt-')) {
    return DEFAULT_MODEL_BY_PROVIDER[provider];
  }
  if (provider !== 'anthropic' && provider !== 'openrouter' && lower.startsWith('claude-')) {
    return DEFAULT_MODEL_BY_PROVIDER[provider];
  }

  return trimmed;
}

export function calculateEstimatedCostUsd(
  provider: AIProviderId,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const safeInput = Math.max(0, Number.isFinite(inputTokens) ? inputTokens : 0);
  const safeOutput = Math.max(0, Number.isFinite(outputTokens) ? outputTokens : 0);
  if (safeInput === 0 && safeOutput === 0) {
    return 0;
  }

  const item = getModelCatalogItem(provider, modelId);
  if (!item || item.tier === 'free' || item.pricing.isFreeTier) {
    return 0;
  }

  const cost =
    (safeInput / 1_000_000) * item.pricing.inputPerMillionUsd +
    (safeOutput / 1_000_000) * item.pricing.outputPerMillionUsd;

  return Number(cost.toFixed(6));
}

export function resolveProviderApiKey(env: Env, provider: AIProviderId): string | null {
  const providerBindings: Record<AIProviderId, string | undefined> = {
    gemini: env.GEMINI_API_KEY,
    openai: env.OPENAI_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    openrouter: env.OPENROUTER_API_KEY,
  };
  const direct = providerBindings[provider];
  if (typeof direct === 'string' && direct.trim().length > 0) {
    return direct.trim();
  }

  const fallback = env.AI_API_KEY;
  if (
    typeof fallback === 'string' &&
    fallback.trim().length > 0 &&
    fallback.trim() !== CANARY_AI_API_KEY
  ) {
    return fallback.trim();
  }

  return null;
}

export function requireProviderApiKey(env: Env, provider: AIProviderId): string {
  const key = resolveProviderApiKey(env, provider);
  if (!key) {
    throw new AIProviderException('not_configured', AI_ERROR_MESSAGES.not_configured, 503, false);
  }
  return key;
}

export async function executeProviderJsonRequest<T>(
  url: string,
  init: RequestInit,
  timeoutMs = 25000,
  fetchFn: typeof fetch = fetch,
): Promise<{ data: T; latencyMs: number }> {
  const startMs = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response: Response;
  try {
    const abortPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => {
          reject(new AIProviderException('timeout', AI_ERROR_MESSAGES.timeout, 504, true));
        },
        { once: true },
      );
    });

    response = await Promise.race([
      fetchFn(url, {
        ...init,
        signal: controller.signal,
      }),
      abortPromise,
    ]);
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof AIProviderException) {
      throw err;
    }
    if (
      timedOut ||
      (err instanceof Error &&
        (err.name === 'AbortError' ||
          err.name === 'TimeoutError' ||
          /abort|timed?\s*out/i.test(err.message)))
    ) {
      throw new AIProviderException('timeout', AI_ERROR_MESSAGES.timeout, 504, true);
    }
    throw new AIProviderException('provider_down', AI_ERROR_MESSAGES.provider_down, 502, true);
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Math.max(1, Date.now() - startMs);

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    const status = response.status;
    if (status === 401 || status === 403) {
      throw new AIProviderException('auth_error', AI_ERROR_MESSAGES.auth_error, 502, false);
    }
    if (
      status === 402 ||
      /insufficient_quota|quota_exceeded|credit balance is too low|billing_hard_limit_reached/i.test(
        bodyText,
      )
    ) {
      throw new AIProviderException('quota_exceeded', AI_ERROR_MESSAGES.quota_exceeded, 429, false);
    }
    if (status === 429) {
      throw new AIProviderException('rate_limited', AI_ERROR_MESSAGES.rate_limited, 429, true);
    }
    if (status >= 500) {
      throw new AIProviderException('provider_down', AI_ERROR_MESSAGES.provider_down, 502, true);
    }
    throw new AIProviderException(
      'invalid_response',
      AI_ERROR_MESSAGES.invalid_response,
      502,
      false,
    );
  }

  try {
    const data = (await response.json()) as T;
    if (!data || typeof data !== 'object') {
      throw new AIProviderException(
        'invalid_response',
        AI_ERROR_MESSAGES.invalid_response,
        502,
        false,
      );
    }
    return { data, latencyMs };
  } catch (err) {
    if (err instanceof AIProviderException) {
      throw err;
    }
    throw new AIProviderException(
      'invalid_response',
      AI_ERROR_MESSAGES.invalid_response,
      502,
      false,
    );
  }
}

export async function runProviderConnectionTest(
  provider: AIProvider,
  env: Env,
  model?: string,
  fetchFn: typeof fetch = fetch,
): Promise<TestModelResponseDto> {
  const resolvedModel = resolveModelId(provider.id, model);
  if (!provider.isConfigured(env)) {
    return {
      ok: false,
      provider: provider.id,
      model: resolvedModel,
      configured: false,
      connected: false,
      latencyMs: 0,
      message: AI_ERROR_MESSAGES.not_configured,
      errorClass: 'not_configured',
    };
  }

  const startMs = Date.now();
  try {
    const result = await provider.generateStructuredJson(
      env,
      {
        model: resolvedModel,
        systemPrompt: 'أعد كائن JSON صالح فقط.',
        userPrompt: '{"ping":"ok"}',
        temperature: 0,
        maxOutputTokens: 32,
        timeoutMs: 10000,
      },
      fetchFn,
    );
    return {
      ok: true,
      provider: provider.id,
      model: resolvedModel,
      configured: true,
      connected: true,
      latencyMs: result.latencyMs,
      message: `تم الاتصال بنجاح بمزود ${provider.label} (${resolvedModel}).`,
    };
  } catch (err) {
    const latencyMs = Math.max(1, Date.now() - startMs);
    if (err instanceof AIProviderException) {
      return {
        ok: false,
        provider: provider.id,
        model: resolvedModel,
        configured: err.errorClass !== 'not_configured',
        connected: false,
        latencyMs,
        message: err.userMessage,
        errorClass: err.errorClass,
      };
    }
    return {
      ok: false,
      provider: provider.id,
      model: resolvedModel,
      configured: true,
      connected: false,
      latencyMs,
      message: AI_ERROR_MESSAGES.provider_down,
      errorClass: 'provider_down',
    };
  }
}
