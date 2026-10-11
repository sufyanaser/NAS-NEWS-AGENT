/** Constants shared by the Worker (validation) and the browser (UI limits). */

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
} as const;

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
