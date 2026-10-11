/**
 * Arabic editorial AI pipeline orchestration:
 * - Source sufficiency & 20,000-char length guard (Specs §7.2)
 * - Prompt construction with `<source_text>` isolation
 * - Provider invocation & structured JSON validation
 * - Server-side `hasBlocker` computation (Specs §7.3)
 * - Non-blocking `numberWarnings` superset check (Specs §8.1)
 * - Manual edit preservation when `overwriteExisting !== true`
 */
import { FORMAT_KEYS, LIMITS } from '../../shared/contracts';
import type { Env } from '../env';
import { HttpError } from '../http';
import {
  calculateEstimatedCostUsd,
  normalizeProviderId,
  resolveModelId,
} from './catalog';
import { buildEditorialSystemPrompt, buildEditorialUserPrompt } from './prompts';
import { generateWithRetry } from './registry';
import {
  checkNumberSuperset,
  computeServerBlocker,
  parseAndValidateEditorialJson,
} from './schema';
import type {
  AIUsageMetricsDto,
  AttributionFlagDto,
  FormatKey,
  StoryFact,
  StoryFormats,
} from './types';

export const MAX_EXTRACT_SOURCE_CHARS = 20_000;
export const SOURCE_TOO_LONG_MESSAGE = 'المادة طويلة جداً، يرجى تلخيصها أو تقسيمها';

export class EditorialPipelineValidationError extends HttpError {
  public readonly userMessage: string;

  constructor(
    code: string,
    message: string,
    extra: Record<string, unknown> = {},
  ) {
    super(400, code, { message, ...extra });
    this.message = message;
    this.userMessage = message;
    this.name = 'EditorialPipelineValidationError';
  }
}

export interface RunEditorialPipelineInput {
  story: {
    id: string;
    sourceText: string;
    sourceName: string;
    sourceLang: string;
    category: string;
    publishDate: string;
    urgentEnabled: boolean;
    selectedFormats: FormatKey[];
    currentHeadline: string;
    currentFormats: StoryFormats;
  };
  settings: {
    stationName: string;
    editorialStyle: string;
    radioLength: string;
    modelProvider: string;
    modelName: string;
  };
  requestOptions?: {
    provider?: string;
    model?: string;
    overwriteExisting?: boolean;
  };
}

export interface RunEditorialPipelineResult {
  headline: string;
  formats: StoryFormats;
  facts: StoryFact[];
  hasBlocker: boolean;
  blockerReason: string;
  usage: AIUsageMetricsDto;
  editorialNotes: string;
  attributionFlags: AttributionFlagDto[];
  numberWarnings: string[];
  preservedManualFormats: FormatKey[];
}

export interface EditorialPipelineDeps {
  generateFn: typeof generateWithRetry;
  costFn: typeof calculateEstimatedCostUsd;
  normalizeProviderFn: typeof normalizeProviderId;
  resolveModelFn: typeof resolveModelId;
}

const DEFAULT_PIPELINE_DEPS: EditorialPipelineDeps = {
  generateFn: generateWithRetry,
  costFn: calculateEstimatedCostUsd,
  normalizeProviderFn: normalizeProviderId,
  resolveModelFn: resolveModelId,
};

/**
 * Validates source text length and source name sufficiency before invoking any AI model (Specs §7.2).
 */
export function validateEditorialSource(sourceText: string, sourceName: string): void {
  if (typeof sourceText !== 'string' || sourceText.length > MAX_EXTRACT_SOURCE_CHARS) {
    throw new EditorialPipelineValidationError('source_too_long', SOURCE_TOO_LONG_MESSAGE, {
      field: 'sourceText',
    });
  }

  if (sourceText.trim().length < LIMITS.minExtractedChars) {
    throw new EditorialPipelineValidationError(
      'invalid_input',
      'النص المصدري قصير جداً؛ يجب ألا يقل عن 50 حرفاً قبل الاستخراج التحريري.',
      { field: 'sourceText' },
    );
  }

  if (typeof sourceName !== 'string' || sourceName.trim().length === 0) {
    throw new EditorialPipelineValidationError(
      'invalid_input',
      'يرجى تحديد اسم المصدر قبل بدء الاستخراج التحريري.',
      { field: 'sourceName' },
    );
  }
}

/**
 * Executes the complete Arabic editorial AI pipeline.
 */
export async function runEditorialPipeline(
  env: Env,
  input: RunEditorialPipelineInput,
  deps: Partial<EditorialPipelineDeps> = DEFAULT_PIPELINE_DEPS,
): Promise<RunEditorialPipelineResult> {
  // 1. Source sufficiency & length validation (Specs §7.2b & §7.2c)
  validateEditorialSource(input.story.sourceText, input.story.sourceName);

  const generateFn = deps.generateFn ?? DEFAULT_PIPELINE_DEPS.generateFn;
  const normalizeProviderFn =
    deps.normalizeProviderFn ?? DEFAULT_PIPELINE_DEPS.normalizeProviderFn;
  const resolveModelFn = deps.resolveModelFn ?? DEFAULT_PIPELINE_DEPS.resolveModelFn;
  const costFn = deps.costFn ?? DEFAULT_PIPELINE_DEPS.costFn;

  // 2. Resolve provider and model (request override > settings default)
  const rawProvider = input.requestOptions?.provider ?? input.settings.modelProvider;
  const providerId = normalizeProviderFn(rawProvider);
  const rawModel = input.requestOptions?.model ?? input.settings.modelName;
  const modelId = resolveModelFn(providerId, rawModel);

  // 3. Build system and user prompts
  const systemPrompt = buildEditorialSystemPrompt({
    stationName: input.settings.stationName,
    editorialStyle: input.settings.editorialStyle,
    radioLength: input.settings.radioLength,
    urgentEnabled: input.story.urgentEnabled,
    selectedFormats: input.story.selectedFormats,
  });

  const userPrompt = buildEditorialUserPrompt({
    sourceText: input.story.sourceText,
    sourceName: input.story.sourceName,
    sourceLang: input.story.sourceLang,
    category: input.story.category,
    publishDate: input.story.publishDate,
    urgentEnabled: input.story.urgentEnabled,
    selectedFormats: input.story.selectedFormats,
  });

  // 4. Call AI provider
  const genResult = await generateFn(env, {
    providerId,
    model: modelId,
    systemPrompt,
    userPrompt,
    temperature: 0.2,
    maxOutputTokens: 2500,
    timeoutMs: 25_000,
  });

  // 5. Parse and strictly validate JSON schema
  const aiOutput = parseAndValidateEditorialJson(genResult.rawText, {
    urgentEnabled: input.story.urgentEnabled,
    selectedFormats: input.story.selectedFormats,
  });

  // 6. Server-side blocker calculation (Specs §7.3)
  const { hasBlocker, blockerReason } = computeServerBlocker(aiOutput);

  // 7. Non-blocking number superset check (Specs §8.1)
  const numberWarnings = checkNumberSuperset(input.story.sourceText, aiOutput);

  // 8. Protect manual edits unless overwriteExisting === true
  const overwriteExisting = input.requestOptions?.overwriteExisting === true;
  const preservedManualFormats: FormatKey[] = [];

  const finalHeadline =
    !overwriteExisting && input.story.currentHeadline.trim().length > 0
      ? input.story.currentHeadline
      : aiOutput.headline;

  const finalFormats: StoryFormats = {
    radio: '',
    web: '',
    facebook: '',
    urgent: '',
  };

  for (const key of FORMAT_KEYS) {
    const existingText = input.story.currentFormats[key] ?? '';
    if (!overwriteExisting && existingText.trim().length > 0) {
      finalFormats[key] = existingText;
      preservedManualFormats.push(key);
    } else {
      finalFormats[key] = aiOutput.formats[key] ?? '';
    }
  }

  // 9. Compute token usage & estimated cost
  const inputTokens = Math.max(0, genResult.inputTokens || 0);
  const outputTokens = Math.max(0, genResult.outputTokens || 0);
  const estimatedCostUsd = costFn(
    genResult.provider,
    genResult.model,
    inputTokens,
    outputTokens,
  );

  const usage: AIUsageMetricsDto = {
    provider: genResult.provider,
    model: genResult.model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCostUsd,
    latencyMs: genResult.latencyMs,
  };

  return {
    headline: finalHeadline,
    formats: finalFormats,
    facts: aiOutput.facts,
    hasBlocker,
    blockerReason,
    usage,
    editorialNotes: aiOutput.editorial_notes,
    attributionFlags: aiOutput.attribution_flags,
    numberWarnings,
    preservedManualFormats,
  };
}
