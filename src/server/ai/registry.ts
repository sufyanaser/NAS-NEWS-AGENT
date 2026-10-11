/** Multi-provider AI registry, status inspection, retry wrapper, and connection tester. */
import type { Env } from '../env';
import {
  MODEL_CATALOG,
  PROVIDER_LABELS,
  normalizeProviderId,
  resolveModelId,
} from './catalog';
import { anthropicProvider } from './providers/anthropic';
import { geminiProvider } from './providers/gemini';
import { openaiProvider } from './providers/openai';
import { openrouterProvider } from './providers/openrouter';
import {
  AIProviderException,
  type AIGenerateJsonResult,
  type AIProvider,
  type AIProviderId,
  type AIProviderStatusDto,
  type TestModelResponseDto,
} from './types';

const PROVIDERS: Record<AIProviderId, AIProvider> = {
  gemini: geminiProvider,
  openai: openaiProvider,
  anthropic: anthropicProvider,
  openrouter: openrouterProvider,
};

export const ALL_PROVIDER_IDS: readonly AIProviderId[] = [
  'gemini',
  'openai',
  'anthropic',
  'openrouter',
];

export function getProvider(providerId: AIProviderId): AIProvider {
  return PROVIDERS[providerId] ?? geminiProvider;
}

export function isProviderConfigured(env: Env, providerId: AIProviderId): boolean {
  return getProvider(providerId).isConfigured(env);
}

export function isAnyProviderConfigured(env: Env, activeProviderRaw?: string | null): boolean {
  if (activeProviderRaw) {
    const activeId = normalizeProviderId(activeProviderRaw);
    if (isProviderConfigured(env, activeId)) {
      return true;
    }
  }
  return ALL_PROVIDER_IDS.some((id) => isProviderConfigured(env, id));
}

export function getProvidersStatus(env: Env): AIProviderStatusDto[] {
  return ALL_PROVIDER_IDS.map((providerId) => ({
    provider: providerId,
    label: PROVIDER_LABELS[providerId],
    configured: isProviderConfigured(env, providerId),
    models: MODEL_CATALOG.filter((item) => item.provider === providerId),
  }));
}

export async function generateWithRetry(
  env: Env,
  params: {
    providerId: AIProviderId;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    maxOutputTokens?: number;
    timeoutMs?: number;
  },
  fetchFn: typeof fetch = fetch,
): Promise<AIGenerateJsonResult> {
  const provider = getProvider(params.providerId);
  const model = resolveModelId(params.providerId, params.model);
  const options = {
    model,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    temperature: params.temperature,
    maxOutputTokens: params.maxOutputTokens,
    timeoutMs: params.timeoutMs,
  };

  try {
    return await provider.generateStructuredJson(env, options, fetchFn);
  } catch (err) {
    if (err instanceof AIProviderException && err.retryable === true) {
      return await provider.generateStructuredJson(env, options, fetchFn);
    }
    throw err;
  }
}

export async function testProviderConnection(
  env: Env,
  params: { provider?: string; model?: string },
  fetchFn: typeof fetch = fetch,
): Promise<TestModelResponseDto> {
  const providerId = normalizeProviderId(params.provider);
  const provider = getProvider(providerId);
  const model = resolveModelId(providerId, params.model);
  return provider.testConnection(env, model, fetchFn);
}
