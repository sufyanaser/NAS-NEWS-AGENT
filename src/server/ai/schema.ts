/**
 * Structured AI output parser, strict schema validator, server-side editorial blocker
 * computation (Specs §7.3), and non-blocking number superset check (Specs §8.1).
 */
import {
  AIProviderException,
  type AttributionConfidence,
  type AttributionFlagDto,
  type EditorialAIOutput,
  type EditorialModelSelfAssessment,
  type FormatKey,
  type StoryFact,
  type StoryFormats,
} from './types';

export interface ValidateEditorialJsonOptions {
  urgentEnabled: boolean;
  selectedFormats: FormatKey[];
}

export interface ServerBlockerResult {
  hasBlocker: boolean;
  blockerReason: string;
}

const INVALID_SCHEMA_MESSAGE = 'أعاد النموذج استجابة غير متوافقة مع المخطط التحريري المطلوب.';

const VALID_FACT_TYPES = new Set(['sourced', 'missing', 'review-req']);
const VALID_ATTRIBUTION_CONFIDENCE = new Set<AttributionConfidence>([
  'official',
  'attributed',
  'unattributed',
]);

/**
 * Strips optional markdown code fences (e.g. ```json ... ```) around a JSON payload.
 */
function stripMarkdownCodeFence(rawText: string): string {
  const trimmed = rawText.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenceMatch && typeof fenceMatch[1] === 'string') {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

function throwInvalidSchema(): never {
  throw new AIProviderException('invalid_response', INVALID_SCHEMA_MESSAGE, 502, false);
}

function defaultStatusForFactType(type: 'sourced' | 'missing' | 'review-req'): string {
  if (type === 'missing') return 'غير مذكور في المصدر';
  if (type === 'review-req') return 'المتحدث غير محدد — مراجعة إلزامية';
  return 'وارد في المصدر';
}

/**
 * Parses and strictly validates the model's raw JSON text against the NAS Newsroom editorial schema.
 */
export function parseAndValidateEditorialJson(
  rawText: string,
  options: ValidateEditorialJsonOptions,
): EditorialAIOutput {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throwInvalidSchema();
  }

  const cleaned = stripMarkdownCodeFence(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throwInvalidSchema();
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throwInvalidSchema();
  }

  const root = parsed as Record<string, unknown>;

  // 1. Validate headline
  if (typeof root.headline !== 'string' || root.headline.trim().length === 0) {
    throwInvalidSchema();
  }
  const headline = root.headline.trim();

  // 2. Validate facts array
  if (!Array.isArray(root.facts)) {
    throwInvalidSchema();
  }
  const facts: StoryFact[] = root.facts.map((item): StoryFact => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throwInvalidSchema();
    }
    const f = item as Record<string, unknown>;
    if (typeof f.label !== 'string' || f.label.trim().length === 0) {
      throwInvalidSchema();
    }
    if (typeof f.value !== 'string' || f.value.trim().length === 0) {
      throwInvalidSchema();
    }
    if (typeof f.type !== 'string' || !VALID_FACT_TYPES.has(f.type)) {
      throwInvalidSchema();
    }
    const factType = f.type as 'sourced' | 'missing' | 'review-req';
    const status =
      typeof f.status === 'string' && f.status.trim().length > 0
        ? f.status.trim()
        : defaultStatusForFactType(factType);

    return {
      label: f.label.trim(),
      value: f.value.trim(),
      status,
      type: factType,
    };
  });

  // 3. Validate attribution_flags array
  if (!Array.isArray(root.attribution_flags)) {
    throwInvalidSchema();
  }
  const attributionFlags: AttributionFlagDto[] = root.attribution_flags.map(
    (item): AttributionFlagDto => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        throwInvalidSchema();
      }
      const a = item as Record<string, unknown>;
      if (typeof a.claim !== 'string' || a.claim.trim().length === 0) {
        throwInvalidSchema();
      }
      if (
        typeof a.confidence !== 'string' ||
        !VALID_ATTRIBUTION_CONFIDENCE.has(a.confidence as AttributionConfidence)
      ) {
        throwInvalidSchema();
      }
      const rawAttr = a.attributedTo !== undefined ? a.attributedTo : a.attributed_to;
      if (rawAttr !== undefined && rawAttr !== null && typeof rawAttr !== 'string') {
        throwInvalidSchema();
      }
      const attributedTo =
        typeof rawAttr === 'string' && rawAttr.trim().length > 0 ? rawAttr.trim() : null;

      return {
        claim: a.claim.trim(),
        attributedTo,
        confidence: a.confidence as AttributionConfidence,
      };
    },
  );

  // 4. Validate formats object
  if (
    typeof root.formats !== 'object' ||
    root.formats === null ||
    Array.isArray(root.formats)
  ) {
    throwInvalidSchema();
  }
  const rawFormats = root.formats as Record<string, unknown>;
  if (
    typeof rawFormats.radio !== 'string' ||
    typeof rawFormats.web !== 'string' ||
    typeof rawFormats.facebook !== 'string'
  ) {
    throwInvalidSchema();
  }
  if (
    rawFormats.urgent !== undefined &&
    rawFormats.urgent !== null &&
    typeof rawFormats.urgent !== 'string'
  ) {
    throwInvalidSchema();
  }

  const allowUrgent =
    Boolean(options.urgentEnabled) || options.selectedFormats.includes('urgent');
  const formats: StoryFormats = {
    radio: rawFormats.radio.trim(),
    web: rawFormats.web.trim(),
    facebook: rawFormats.facebook.trim(),
    urgent:
      allowUrgent && typeof rawFormats.urgent === 'string' ? rawFormats.urgent.trim() : '',
  };

  // 5. Validate model_self_assessment object
  if (
    typeof root.model_self_assessment !== 'object' ||
    root.model_self_assessment === null ||
    Array.isArray(root.model_self_assessment)
  ) {
    throwInvalidSchema();
  }
  const rawMsa = root.model_self_assessment as Record<string, unknown>;
  if (typeof rawMsa.has_unattributed_major_claim !== 'boolean') {
    throwInvalidSchema();
  }

  const modelSelfAssessment: EditorialModelSelfAssessment = {
    all_claims_sourced:
      typeof rawMsa.all_claims_sourced === 'boolean'
        ? rawMsa.all_claims_sourced
        : !rawMsa.has_unattributed_major_claim,
    all_numbers_sourced:
      typeof rawMsa.all_numbers_sourced === 'boolean' ? rawMsa.all_numbers_sourced : true,
    has_unattributed_major_claim: rawMsa.has_unattributed_major_claim,
    radio_fit_seconds:
      typeof rawMsa.radio_fit_seconds === 'number' && Number.isFinite(rawMsa.radio_fit_seconds)
        ? rawMsa.radio_fit_seconds
        : 30,
  };

  // 6. Normalize editorial_notes
  const editorialNotes =
    typeof root.editorial_notes === 'string'
      ? root.editorial_notes.trim()
      : typeof rawMsa.notes === 'string'
        ? rawMsa.notes.trim()
        : '';

  return {
    headline,
    facts,
    attribution_flags: attributionFlags,
    formats,
    editorial_notes: editorialNotes,
    model_self_assessment: modelSelfAssessment,
  };
}

/**
 * Recomputes `hasBlocker` on the server from structural sub-fields (Specs §7.3, SC-03).
 * Never trusts a single boolean flag if any `review-req` fact or `unattributed` claim exists.
 */
export function computeServerBlocker(output: EditorialAIOutput): ServerBlockerResult {
  const reviewReqFacts = output.facts.filter((f) => f.type === 'review-req');
  const unattributedFlags = output.attribution_flags.filter(
    (a) => a.confidence === 'unattributed',
  );
  const selfFlagged = output.model_self_assessment.has_unattributed_major_claim === true;

  const hasBlocker =
    reviewReqFacts.length > 0 || unattributedFlags.length > 0 || selfFlagged;

  if (!hasBlocker) {
    return {
      hasBlocker: false,
      blockerReason: '',
    };
  }

  const details: string[] = [];
  for (const f of reviewReqFacts) {
    details.push(`${f.label}: ${f.value}`);
  }
  for (const a of unattributedFlags) {
    if (!details.some((d) => d.includes(a.claim))) {
      details.push(`ادعاء غير مسند: «${a.claim}»`);
    }
  }

  const blockerReason =
    details.length > 0
      ? `مانع تحريري: يتضمن الخبر ادعاءات أو معلومات غير مسندة لمتحدث محدد تتطلب مراجعة بشرية إلزامية (${details.slice(0, 3).join(' — ')}).`
      : 'مانع تحريري: رصد النظام ادعاءً رئيسياً غير مسند إلى متحدث أو جهة محددة في المصدر — يتطلب المراجعة البشرية الإلزامية.';

  return {
    hasBlocker: true,
    blockerReason,
  };
}

/**
 * Converts Eastern Arabic (`٠-٩`) and Extended Arabic-Indic (`۰-۹`) numerals to Western digits (`0-9`),
 * normalizes decimal/thousand separators for reliable numeric token comparison.
 */
export function normalizeNumericText(text: string): string {
  return text
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0))
    .replace(/\u066B/g, '.')
    .replace(/(\d)[,\u066C](?=\d{3}(?:\D|$))/g, '$1');
}

function extractNumericTokens(text: string): string[] {
  const normalized = normalizeNumericText(text);
  const matches = normalized.match(/\d+(?:\.\d+)?/g);
  return matches ? matches : [];
}

function canonicalNumberKey(numStr: string): string {
  const parsed = Number(numStr);
  return Number.isFinite(parsed) ? String(parsed) : numStr;
}

/**
 * Non-blocking number superset check (Specs §8.1):
 * Verifies that every numeric token appearing in the generated headline and formats
 * also appears in `sourceText`. Supports both Arabic (`٠-٩`) and Western (`0-9`) numerals.
 */
export function checkNumberSuperset(
  sourceText: string,
  output: EditorialAIOutput,
): string[] {
  const sourceTokens = extractNumericTokens(sourceText);
  const allowedTokens = new Set<string>();
  for (const token of sourceTokens) {
    allowedTokens.add(token);
    allowedTokens.add(canonicalNumberKey(token));
  }

  const generatedSegments = [
    output.headline,
    output.formats.radio,
    output.formats.web,
    output.formats.facebook,
    output.formats.urgent,
  ].filter((segment) => typeof segment === 'string' && segment.trim().length > 0);

  const missingNumbers: string[] = [];
  const seenMissing = new Set<string>();

  for (const segment of generatedSegments) {
    const tokens = extractNumericTokens(segment);
    for (const token of tokens) {
      const canonical = canonicalNumberKey(token);
      if (!allowedTokens.has(token) && !allowedTokens.has(canonical)) {
        if (!seenMissing.has(canonical)) {
          seenMissing.add(canonical);
          missingNumbers.push(token);
        }
      }
    }
  }

  return missingNumbers.map(
    (num) =>
      `تحذير مطابقة الأرقام: الرقم (${num}) ظهر في النص المولد ولكنه غير موجود صراحةً في نص المصدر.`,
  );
}
