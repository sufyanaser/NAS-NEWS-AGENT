/** Constants and DTOs shared between Worker and Client. */

export const STORY_STATUS_DRAFT = 'مسودة';
export const STORY_STATUS_REVIEW = 'قيد المراجعة';
export const STORY_STATUS_APPROVED = 'معتمد';
export const STORY_STATUS_PUBLISHED = 'منشور';
export const STORY_STATUS_EXCLUDED = 'مستبعد';

export const STORY_STATUSES = [
  STORY_STATUS_DRAFT,
  STORY_STATUS_REVIEW,
  STORY_STATUS_APPROVED,
  STORY_STATUS_PUBLISHED,
  STORY_STATUS_EXCLUDED,
] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];

export const SOURCE_LANGS = ['العربية', 'الإنجليزية'] as const;
export const CATEGORIES = [
  'تعليمي / خدمي',
  'خدمي / بيئي',
  'بيئي / محلي',
  'محلي',
  'سياسي',
  'اقتصادي',
  'ثقافي',
  'رياضي',
] as const;

export const FORMAT_KEYS = ['radio', 'web', 'facebook', 'urgent'] as const;
export type FormatKey = (typeof FORMAT_KEYS)[number];

export const FORMAT_LABELS: Record<FormatKey, string> = {
  radio: 'الموجز الإذاعي',
  web: 'خبر الموقع',
  facebook: 'منشور التواصل',
  urgent: 'الشريط العاجل',
};

export const LIMITS = {
  sourceUrl: 2048,
  sourceName: 200,
  headline: 300,
  /** Saving must never reject long pasted text; the 20,000-char cap applies at extraction time (Specs §7.2c). */
  sourceText: 100_000,
  formatText: 50_000,
  /** Maximum bytes read from imported article body (Specs §9.2 #4). */
  maxImportBytes: 2 * 1024 * 1024,
  /** Minimum extracted text length for sufficiency (Specs §9.1). */
  minExtractedChars: 50,
  /** Import fetch timeout in milliseconds (Specs §9.2 #3). */
  importTimeoutMs: 8000,
  /** Maximum allowable redirects (Specs §9.2 #5). */
  maxRedirects: 3,
} as const;

export type ImportFailureClass =
  | 'network_error'
  | 'blocked'
  | 'unsupported_content'
  | 'insufficient_extract';

export interface ImportSuccessResult {
  ok: true;
  sourceText: string;
  importMessage: string;
}

export interface ImportFailureResult {
  ok: false;
  failureClass: ImportFailureClass;
  importMessage: string;
}

export type ImportResponse = ImportSuccessResult | ImportFailureResult;

export type FactType = 'sourced' | 'missing' | 'review-req';

export interface StoryFact {
  label: string;
  value: string;
  status: string;
  type: FactType;
}

export interface StoryFormats {
  radio: string;
  web: string;
  facebook: string;
  urgent: string;
}

export interface StoryChecks {
  factsVerified: boolean;
  attributionVerified: boolean;
}

export type AIProviderId = 'gemini' | 'openai' | 'anthropic' | 'openrouter';

export interface AIModelPricingDto {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  isFreeTier: boolean;
  pricingNote: string;
  verifiedAt: string;
}

export interface AIModelCatalogItemDto {
  id: string;
  provider: AIProviderId;
  label: string;
  tier: 'free' | 'paid';
  pricing: AIModelPricingDto;
  recommendedFor: string;
  available: boolean;
}

export interface AIProviderStatusDto {
  provider: AIProviderId;
  label: string;
  configured: boolean;
  models: AIModelCatalogItemDto[];
}

export type AttributionConfidence = 'official' | 'attributed' | 'unattributed';

export interface AttributionFlagDto {
  claim: string;
  attributedTo: string | null;
  confidence: AttributionConfidence;
}

export interface AIUsageMetricsDto {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
}

export interface StoryAIMetadataDto {
  usage?: AIUsageMetricsDto;
  editorialNotes?: string;
  attributionFlags?: AttributionFlagDto[];
  numberWarnings?: string[];
  generatedAt?: string;
}

export interface StoryDto {
  id: string;
  status: string;
  sourceUrl: string;
  sourceName: string;
  publishDate: string;
  category: string;
  sourceLang: string;
  sourceText: string;
  importFailed: boolean;
  importMessage: string;
  hasBlocker: boolean;
  blockerReason: string;
  headline: string;
  urgentEnabled: boolean;
  selectedFormats: FormatKey[];
  formats: StoryFormats;
  facts: StoryFact[];
  checks: StoryChecks;
  excludeReason: string;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  publishedAt: string | null;
  aiMetadata?: StoryAIMetadataDto;
}

export interface StorySummaryDto {
  id: string;
  status: string;
  headline: string;
  sourceName: string;
  sourceUrl: string;
  publishDate: string;
  category: string;
  sourceLang: string;
  textPreview: string;
  selectedFormats: FormatKey[];
  urgentEnabled: boolean;
  hasBlocker: boolean;
  updatedAt: string;
}

export interface ArchiveCountsDto {
  total: number;
  byFormat: Record<FormatKey, number>;
  byStatus: Record<string, number>;
}

export interface StoryListResponse {
  stories: StorySummaryDto[];
  counts?: ArchiveCountsDto;
}

export interface StoryPatchBody {
  sourceUrl?: string;
  sourceName?: string;
  publishDate?: string;
  category?: string;
  sourceLang?: string;
  sourceText?: string;
  headline?: string;
  urgentEnabled?: boolean;
  selectedFormats?: FormatKey[];
  formats?: Partial<StoryFormats>;
  facts?: StoryFact[];
  hasBlocker?: boolean;
  blockerReason?: string;
}

export interface StoryExtractRequestDto {
  provider?: string;
  model?: string;
  overwriteExisting?: boolean;
}

export interface StoryExtractResponseDto {
  story: StoryDto;
  usage: AIUsageMetricsDto;
  editorialNotes: string;
  attributionFlags: AttributionFlagDto[];
  numberWarnings: string[];
  preservedManualFormats?: FormatKey[];
}

export type AIErrorClass =
  | 'not_configured'
  | 'auth_error'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'timeout'
  | 'invalid_response'
  | 'provider_down';

export interface TestModelRequestDto {
  provider?: string;
  model?: string;
}

export interface TestModelResponseDto {
  ok: boolean;
  provider: string;
  model: string;
  configured: boolean;
  connected: boolean;
  latencyMs: number;
  message: string;
  errorClass?: AIErrorClass;
}

export interface SettingsDto {
  stationName: string;
  editorialStyle: string;
  radioLength: string;
  modelProvider: string;
  modelName: string;
  aiConfigured: boolean;
  updatedAt: string;
  providers?: AIProviderStatusDto[];
}

export interface SettingsPutBody {
  stationName?: string;
  editorialStyle?: string;
  radioLength?: string;
  modelProvider?: string;
  modelName?: string;
}
