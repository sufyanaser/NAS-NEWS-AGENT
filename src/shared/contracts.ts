/** Constants and DTOs shared between Worker and Client. */

export const STORY_STATUS_DRAFT = 'مسودة';

export const SOURCE_LANGS = ['العربية', 'الإنجليزية'] as const;
export const CATEGORIES = [
  'تعليمي / خدمي',
  'خدمي / بيئي',
  'بيئي / محلي',
  'محلي',
  'سياسي',
  'اقتصادي',
] as const;

export const LIMITS = {
  sourceUrl: 2048,
  sourceName: 200,
  /** Saving must never reject long pasted text; the 20,000-char cap applies at extraction time (Specs §7.2c). */
  sourceText: 100_000,
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

export interface StoryDto {
  id: string;
  status: string;
  sourceUrl: string;
  sourceName: string;
  publishDate: string;
  category: string;
  sourceLang: string;
  sourceText: string;
  createdAt: string;
  updatedAt: string;
}

export interface StorySummaryDto {
  id: string;
  status: string;
  sourceName: string;
  sourceUrl: string;
  textPreview: string;
  updatedAt: string;
}

export interface StoryPatchBody {
  sourceUrl?: string;
  sourceName?: string;
  publishDate?: string;
  category?: string;
  sourceLang?: string;
  sourceText?: string;
}
