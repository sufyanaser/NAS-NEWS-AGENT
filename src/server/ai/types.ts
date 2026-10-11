/** Shared server-side types for the multi-provider AI layer and Arabic editorial pipeline. */
import type {
  AIErrorClass,
  AIModelCatalogItemDto,
  AIModelPricingDto,
  AIProviderId,
  AIProviderStatusDto,
  AIUsageMetricsDto,
  AttributionConfidence,
  AttributionFlagDto,
  FormatKey,
  StoryFact,
  StoryFormats,
  TestModelResponseDto,
} from '../../shared/contracts';
import type { Env } from '../env';

export type {
  AIErrorClass,
  AIModelCatalogItemDto,
  AIModelPricingDto,
  AIProviderId,
  AIProviderStatusDto,
  AIUsageMetricsDto,
  AttributionConfidence,
  AttributionFlagDto,
  FormatKey,
  StoryFact,
  StoryFormats,
  TestModelResponseDto,
};

export class AIProviderException extends Error {
  constructor(
    public readonly errorClass: AIErrorClass,
    public readonly userMessage: string,
    public readonly statusCode = 502,
    public readonly retryable = false,
  ) {
    super(userMessage);
    this.name = 'AIProviderException';
  }
}

export interface AIGenerateJsonOptions {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface AIGenerateJsonResult {
  rawText: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  provider: AIProviderId;
  model: string;
}

export interface AIProvider {
  readonly id: AIProviderId;
  readonly label: string;
  isConfigured(env: Env): boolean;
  generateStructuredJson(
    env: Env,
    options: AIGenerateJsonOptions,
    fetchFn?: typeof fetch,
  ): Promise<AIGenerateJsonResult>;
  testConnection(
    env: Env,
    model?: string,
    fetchFn?: typeof fetch,
  ): Promise<TestModelResponseDto>;
}

export interface EditorialModelSelfAssessment {
  all_claims_sourced: boolean;
  all_numbers_sourced: boolean;
  has_unattributed_major_claim: boolean;
  radio_fit_seconds: number;
}

export interface EditorialAIOutput {
  headline: string;
  facts: StoryFact[];
  attribution_flags: AttributionFlagDto[];
  formats: StoryFormats;
  editorial_notes: string;
  model_self_assessment: EditorialModelSelfAssessment;
}
