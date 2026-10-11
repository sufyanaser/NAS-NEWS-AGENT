/** Stories — draft creation, partial update (autosave), restore, source import, manual review, approval, archive, and exclusion. */
import {
  CATEGORIES,
  FORMAT_KEYS,
  LIMITS,
  SOURCE_LANGS,
  STORY_STATUS_APPROVED,
  STORY_STATUS_DRAFT,
  STORY_STATUS_EXCLUDED,
  STORY_STATUS_PUBLISHED,
  STORY_STATUS_REVIEW,
} from '../shared/contracts';
import type {
  ArchiveCountsDto,
  FormatKey,
  StoryChecks,
  StoryDto,
  StoryFact,
  StoryFormats,
  StoryPatchBody,
  StorySummaryDto,
} from '../shared/contracts';
import type { Env } from './env';
import { HttpError, json, readJson } from './http';
import { fetchAndExtractSource } from './importer';

interface StoryRow {
  id: string;
  status: string;
  source_url: string | null;
  source_name: string | null;
  publish_date: string | null;
  category: string | null;
  source_lang: string | null;
  source_text: string;
  import_failed: number;
  import_message: string | null;
  has_blocker: number;
  blocker_reason: string | null;
  headline: string | null;
  urgent_enabled: number;
  selected_formats_json: string | null;
  formats_json: string | null;
  facts_json: string | null;
  checks_facts_verified: number;
  checks_attribution_verified: number;
  exclude_reason: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  published_at: string | null;
}

const STORY_COLUMNS = [
  'id',
  'status',
  'source_url',
  'source_name',
  'publish_date',
  'category',
  'source_lang',
  'source_text',
  'import_failed',
  'import_message',
  'has_blocker',
  'blocker_reason',
  'headline',
  'urgent_enabled',
  'selected_formats_json',
  'formats_json',
  'facts_json',
  'checks_facts_verified',
  'checks_attribution_verified',
  'exclude_reason',
  'created_at',
  'updated_at',
  'approved_at',
  'published_at',
].join(', ');

const VALID_STATUSES = [
  STORY_STATUS_DRAFT,
  STORY_STATUS_REVIEW,
  STORY_STATUS_APPROVED,
  STORY_STATUS_PUBLISHED,
  STORY_STATUS_EXCLUDED,
] as const;

/** Source & editorial fields may only be edited while the story is still in Draft or Review. */
const EDITABLE_STATUSES = [STORY_STATUS_DRAFT, STORY_STATUS_REVIEW];

export const STORY_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const DEFAULT_FORMATS: StoryFormats = {
  radio: '',
  web: '',
  facebook: '',
  urgent: '',
};

const DEFAULT_SELECTED_FORMATS: FormatKey[] = ['radio', 'web', 'facebook'];

function parseFormatsJson(raw: string | null): StoryFormats {
  if (!raw) return { ...DEFAULT_FORMATS };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      radio: typeof parsed.radio === 'string' ? parsed.radio : '',
      web: typeof parsed.web === 'string' ? parsed.web : '',
      facebook: typeof parsed.facebook === 'string' ? parsed.facebook : '',
      urgent: typeof parsed.urgent === 'string' ? parsed.urgent : '',
    };
  } catch {
    return { ...DEFAULT_FORMATS };
  }
}

function parseSelectedFormatsJson(raw: string | null, urgentEnabled: boolean): FormatKey[] {
  let list: FormatKey[] = [...DEFAULT_SELECTED_FORMATS];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((x): x is FormatKey => (FORMAT_KEYS as readonly string[]).includes(String(x)));
        list = Array.from(new Set(valid));
      }
    } catch {
      // fallback to default
    }
  }
  if (urgentEnabled && !list.includes('urgent')) {
    list.push('urgent');
  }
  return list;
}

function parseFactsJson(raw: string | null): StoryFact[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        label: typeof item.label === 'string' ? item.label : '',
        value: typeof item.value === 'string' ? item.value : '',
        status: typeof item.status === 'string' ? item.status : 'وارد في المصدر',
        type:
          item.type === 'missing' || item.type === 'review-req'
            ? item.type
            : 'sourced',
      }));
  } catch {
    return [];
  }
}

function toDto(r: StoryRow): StoryDto {
  const urgentEnabled = Boolean(r.urgent_enabled);
  return {
    id: r.id,
    status: r.status,
    sourceUrl: r.source_url ?? '',
    sourceName: r.source_name ?? '',
    publishDate: r.publish_date ?? '',
    category: r.category ?? '',
    sourceLang: r.source_lang ?? '',
    sourceText: r.source_text,
    importFailed: Boolean(r.import_failed),
    importMessage: r.import_message ?? '',
    hasBlocker: Boolean(r.has_blocker),
    blockerReason: r.blocker_reason ?? '',
    headline: r.headline ?? '',
    urgentEnabled,
    selectedFormats: parseSelectedFormatsJson(r.selected_formats_json, urgentEnabled),
    formats: parseFormatsJson(r.formats_json),
    facts: parseFactsJson(r.facts_json),
    checks: {
      factsVerified: Boolean(r.checks_facts_verified),
      attributionVerified: Boolean(r.checks_attribution_verified),
    },
    excludeReason: r.exclude_reason ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    approvedAt: r.approved_at ?? null,
    publishedAt: r.published_at ?? null,
  };
}

function bad(field: string): HttpError {
  return new HttpError(400, 'invalid_input', { field });
}

function str(body: Record<string, unknown>, key: string, max: number, trim: boolean): string | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw bad(key);
  const out = trim ? v.trim() : v;
  if (out.length > max) throw bad(key);
  // eslint-disable-next-line no-control-regex
  if (trim && /[\u0000-\u001f\u007f]/.test(out)) throw bad(key);
  return out;
}

/**
 * Validates partial update payload for stories.
 */
export function parsePatch(body: Record<string, unknown>): StoryPatchBody {
  const patch: StoryPatchBody = {};
  const sourceUrl = str(body, 'sourceUrl', LIMITS.sourceUrl, true);
  const sourceName = str(body, 'sourceName', LIMITS.sourceName, true);
  const sourceText = str(body, 'sourceText', LIMITS.sourceText, false);
  const publishDate = str(body, 'publishDate', 10, true);
  const category = str(body, 'category', 100, true);
  const sourceLang = str(body, 'sourceLang', 50, true);
  const headline = str(body, 'headline', LIMITS.headline, true);
  const blockerReason = str(body, 'blockerReason', 1000, true);

  if (publishDate) {
    const d = new Date(`${publishDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== publishDate) {
      throw bad('publishDate');
    }
  }
  if (category && !(CATEGORIES as readonly string[]).includes(category)) throw bad('category');
  if (sourceLang && !(SOURCE_LANGS as readonly string[]).includes(sourceLang)) throw bad('sourceLang');

  if (body.urgentEnabled !== undefined) {
    if (typeof body.urgentEnabled !== 'boolean') throw bad('urgentEnabled');
    patch.urgentEnabled = body.urgentEnabled;
  }

  if (body.hasBlocker !== undefined) {
    if (typeof body.hasBlocker !== 'boolean') throw bad('hasBlocker');
    patch.hasBlocker = body.hasBlocker;
  }

  if (body.selectedFormats !== undefined) {
    if (!Array.isArray(body.selectedFormats)) throw bad('selectedFormats');
    const selected: FormatKey[] = [];
    for (const item of body.selectedFormats) {
      if (typeof item !== 'string' || !(FORMAT_KEYS as readonly string[]).includes(item)) {
        throw bad('selectedFormats');
      }
      if (!selected.includes(item as FormatKey)) {
        selected.push(item as FormatKey);
      }
    }
    patch.selectedFormats = selected;
  }

  if (body.formats !== undefined) {
    if (typeof body.formats !== 'object' || body.formats === null || Array.isArray(body.formats)) {
      throw bad('formats');
    }
    const fObj = body.formats as Record<string, unknown>;
    const formatsPatch: Partial<StoryFormats> = {};
    for (const k of FORMAT_KEYS) {
      if (fObj[k] !== undefined) {
        if (typeof fObj[k] !== 'string' || (fObj[k] as string).length > LIMITS.formatText) {
          throw bad(`formats.${k}`);
        }
        formatsPatch[k] = fObj[k] as string;
      }
    }
    patch.formats = formatsPatch;
  }

  if (body.facts !== undefined) {
    if (!Array.isArray(body.facts) || body.facts.length > 50) throw bad('facts');
    const facts: StoryFact[] = [];
    for (const item of body.facts) {
      if (typeof item !== 'object' || item === null) throw bad('facts');
      const f = item as Record<string, unknown>;
      if (typeof f.label !== 'string' || f.label.trim().length > 200) throw bad('facts.label');
      if (typeof f.value !== 'string' || f.value.length > 2000) throw bad('facts.value');
      const fType = f.type === 'missing' || f.type === 'review-req' ? f.type : 'sourced';
      const fStatus =
        typeof f.status === 'string' && f.status.trim().length <= 200
          ? f.status.trim()
          : fType === 'missing'
            ? 'غير مذكور في المصدر'
            : fType === 'review-req'
              ? 'المتحدث غير محدد — مراجعة إلزامية'
              : 'وارد في المصدر';
      facts.push({
        label: f.label.trim(),
        value: f.value.trim(),
        status: fStatus,
        type: fType,
      });
    }
    patch.facts = facts;
  }

  if (sourceUrl !== undefined) patch.sourceUrl = sourceUrl;
  if (sourceName !== undefined) patch.sourceName = sourceName;
  if (sourceText !== undefined) patch.sourceText = sourceText;
  if (publishDate !== undefined) patch.publishDate = publishDate;
  if (category !== undefined) patch.category = category;
  if (sourceLang !== undefined) patch.sourceLang = sourceLang;
  if (headline !== undefined) patch.headline = headline;
  if (blockerReason !== undefined) patch.blockerReason = blockerReason;
  return patch;
}

async function buildUpdate(
  env: Env,
  id: string,
  patch: StoryPatchBody,
  existing: StoryRow | null,
  now: string,
): Promise<D1PreparedStatement[]> {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  const changedFields: string[] = [];

  // Track if substantive content changed so we reset human verification checks (Specs §11.3 / Phase 6)
  let substantiveEdit = false;

  if (patch.sourceUrl !== undefined) {
    sets.push('source_url = ?');
    values.push(patch.sourceUrl === '' ? null : patch.sourceUrl);
    changedFields.push('sourceUrl');
  }
  if (patch.sourceName !== undefined) {
    sets.push('source_name = ?');
    values.push(patch.sourceName === '' ? null : patch.sourceName);
    changedFields.push('sourceName');
  }
  if (patch.publishDate !== undefined) {
    sets.push('publish_date = ?');
    values.push(patch.publishDate === '' ? null : patch.publishDate);
    changedFields.push('publishDate');
  }
  if (patch.category !== undefined) {
    sets.push('category = ?');
    values.push(patch.category === '' ? null : patch.category);
    changedFields.push('category');
  }
  if (patch.sourceLang !== undefined) {
    sets.push('source_lang = ?');
    values.push(patch.sourceLang === '' ? null : patch.sourceLang);
    changedFields.push('sourceLang');
  }
  if (patch.sourceText !== undefined) {
    sets.push('source_text = ?');
    values.push(patch.sourceText);
    changedFields.push('sourceText');
    if (existing && existing.source_text !== patch.sourceText) substantiveEdit = true;
  }
  if (patch.headline !== undefined) {
    sets.push('headline = ?');
    values.push(patch.headline === '' ? null : patch.headline);
    changedFields.push('headline');
    if (existing && (existing.headline ?? '') !== patch.headline) substantiveEdit = true;
  }

  let currentSelected = existing
    ? parseSelectedFormatsJson(existing.selected_formats_json, Boolean(existing.urgent_enabled))
    : [...DEFAULT_SELECTED_FORMATS];
  let urgentFlag = existing ? Boolean(existing.urgent_enabled) : false;

  if (patch.selectedFormats !== undefined) {
    currentSelected = [...patch.selectedFormats];
    urgentFlag = currentSelected.includes('urgent');
    changedFields.push('selectedFormats');
  }
  if (patch.urgentEnabled !== undefined) {
    urgentFlag = patch.urgentEnabled;
    if (urgentFlag && !currentSelected.includes('urgent')) {
      currentSelected.push('urgent');
    } else if (!urgentFlag) {
      currentSelected = currentSelected.filter((k) => k !== 'urgent');
    }
    changedFields.push('urgentEnabled');
  }

  if (patch.selectedFormats !== undefined || patch.urgentEnabled !== undefined) {
    sets.push('selected_formats_json = ?', 'urgent_enabled = ?');
    values.push(JSON.stringify(currentSelected), urgentFlag ? 1 : 0);
  }

  if (patch.formats !== undefined) {
    const merged: StoryFormats = existing ? parseFormatsJson(existing.formats_json) : { ...DEFAULT_FORMATS };
    for (const k of FORMAT_KEYS) {
      if (patch.formats[k] !== undefined) {
        if (merged[k] !== patch.formats[k]) substantiveEdit = true;
        merged[k] = patch.formats[k] ?? '';
      }
    }
    sets.push('formats_json = ?');
    values.push(JSON.stringify(merged));
    changedFields.push('formats');
  }

  let hasReviewReqFact = false;
  if (patch.facts !== undefined) {
    sets.push('facts_json = ?');
    values.push(JSON.stringify(patch.facts));
    changedFields.push('facts');
    substantiveEdit = true;
    hasReviewReqFact = patch.facts.some((f) => f.type === 'review-req');
  }

  if (patch.hasBlocker !== undefined || hasReviewReqFact) {
    const nextBlocker = Boolean(patch.hasBlocker) || hasReviewReqFact;
    sets.push('has_blocker = ?');
    values.push(nextBlocker ? 1 : 0);
    changedFields.push('hasBlocker');
  }

  if (patch.blockerReason !== undefined) {
    sets.push('blocker_reason = ?');
    values.push(patch.blockerReason === '' ? null : patch.blockerReason);
    changedFields.push('blockerReason');
  }

  // If substantive content changed after checks were verified, reset verification checkboxes
  if (substantiveEdit && existing && (existing.checks_facts_verified || existing.checks_attribution_verified)) {
    sets.push('checks_facts_verified = 0', 'checks_attribution_verified = 0');
  }

  if (sets.length === 0) return [];

  return [
    env.DB.prepare(`UPDATE stories SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...values, now, id),
    env.DB.prepare('INSERT INTO story_events (story_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)').bind(
      id,
      'draft_saved',
      JSON.stringify({ fields: changedFields }),
      now,
    ),
  ];
}

export async function createStory(request: Request, env: Env): Promise<Response> {
  const text = await request.text();
  let patch: StoryPatchBody = {};
  if (text.trim() !== '') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw bad('body');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw bad('body');
    patch = parsePatch(parsed as Record<string, unknown>);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const updateStmts = Object.keys(patch).length > 0 ? await buildUpdate(env, id, patch, null, now) : [];

  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO stories (id, status, source_text, selected_formats_json, formats_json, facts_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      id,
      STORY_STATUS_DRAFT,
      '',
      JSON.stringify(DEFAULT_SELECTED_FORMATS),
      JSON.stringify(DEFAULT_FORMATS),
      '[]',
      now,
      now,
    ),
    env.DB.prepare('INSERT INTO story_events (story_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)').bind(
      id,
      'draft_saved',
      JSON.stringify({ created: true }),
      now,
    ),
    ...updateStmts,
  ]);
  const row = await env.DB.prepare(`SELECT ${STORY_COLUMNS} FROM stories WHERE id = ?`).bind(id).first<StoryRow>();
  if (!row) throw new Error('story vanished after insert');
  return json({ story: toDto(row) }, 201);
}

export async function getStory(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(`SELECT ${STORY_COLUMNS} FROM stories WHERE id = ?`).bind(id).first<StoryRow>();
  if (!row) throw new HttpError(404, 'not_found');
  return json({ story: toDto(row) });
}

export async function patchStory(request: Request, env: Env, id: string): Promise<Response> {
  const patch = parsePatch(await readJson(request));
  if (Object.keys(patch).length === 0) throw bad('body');

  const row = await env.DB.prepare(`SELECT ${STORY_COLUMNS} FROM stories WHERE id = ?`).bind(id).first<StoryRow>();
  if (!row) throw new HttpError(404, 'not_found');
  if (!EDITABLE_STATUSES.includes(row.status as typeof STORY_STATUS_DRAFT)) {
    throw new HttpError(409, 'invalid_transition');
  }

  const stmts = await buildUpdate(env, id, patch, row, new Date().toISOString());
  if (stmts.length > 0) {
    await env.DB.batch(stmts);
  }
  return getStory(env, id);
}

export async function listStories(url: URL, env: Env): Promise<Response> {
  const status = url.searchParams.get('status');
  if (status !== null && status !== '' && status !== 'all' && !(VALID_STATUSES as readonly string[]).includes(status)) {
    throw bad('status');
  }

  const category = url.searchParams.get('category');
  if (category !== null && category !== '' && category !== 'all' && !(CATEGORIES as readonly string[]).includes(category)) {
    throw bad('category');
  }

  const format = url.searchParams.get('format');
  if (format !== null && format !== '' && format !== 'all' && !(FORMAT_KEYS as readonly string[]).includes(format)) {
    throw bad('format');
  }

  const qRaw = url.searchParams.get('q');
  const q = qRaw ? qRaw.trim() : '';
  if (q.length > 200) throw bad('q');

  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw === null ? 50 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw bad('limit');

  // Fetch all stories to compute exact format/status counts and filter cleanly
  const { results: allRows } = await env.DB.prepare(
    `SELECT ${STORY_COLUMNS} FROM stories ORDER BY updated_at DESC, id`,
  ).all<StoryRow>();

  const counts: ArchiveCountsDto = {
    total: allRows.length,
    byFormat: { radio: 0, web: 0, facebook: 0, urgent: 0 },
    byStatus: {
      [STORY_STATUS_DRAFT]: 0,
      [STORY_STATUS_REVIEW]: 0,
      [STORY_STATUS_APPROVED]: 0,
      [STORY_STATUS_PUBLISHED]: 0,
      [STORY_STATUS_EXCLUDED]: 0,
    },
  };

  for (const r of allRows) {
    counts.byStatus[r.status] = (counts.byStatus[r.status] ?? 0) + 1;
    const sel = parseSelectedFormatsJson(r.selected_formats_json, Boolean(r.urgent_enabled));
    for (const fmt of sel) {
      counts.byFormat[fmt] = (counts.byFormat[fmt] ?? 0) + 1;
    }
  }

  const filtered = allRows.filter((r) => {
    if (status && status !== 'all' && r.status !== status) return false;
    if (category && category !== 'all' && (r.category ?? '') !== category) return false;
    if (format && format !== 'all') {
      const sel = parseSelectedFormatsJson(r.selected_formats_json, Boolean(r.urgent_enabled));
      if (!sel.includes(format as FormatKey)) return false;
    }
    if (q) {
      const needle = q.toLowerCase();
      const hay = [
        r.headline ?? '',
        r.source_name ?? '',
        r.category ?? '',
        r.source_text ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const stories: StorySummaryDto[] = filtered.slice(0, limit).map((r) => {
    const urgentEnabled = Boolean(r.urgent_enabled);
    return {
      id: r.id,
      status: r.status,
      headline: r.headline ?? '',
      sourceName: r.source_name ?? '',
      sourceUrl: r.source_url ?? '',
      publishDate: r.publish_date ?? '',
      category: r.category ?? '',
      sourceLang: r.source_lang ?? '',
      textPreview: r.source_text.slice(0, 140),
      selectedFormats: parseSelectedFormatsJson(r.selected_formats_json, urgentEnabled),
      urgentEnabled,
      hasBlocker: Boolean(r.has_blocker),
      updatedAt: r.updated_at,
    };
  });

  return json({ stories, counts });
}

/**
 * Handles POST /api/stories/:id/import (Specs §3.3, §9)
 * Body: { url: string }
 */
export async function importStorySource(
  request: Request,
  env: Env,
  id: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const body = await readJson(request);
  const urlVal = body.url;
  if (typeof urlVal !== 'string' || !urlVal.trim()) {
    throw bad('url');
  }
  const cleanUrl = urlVal.trim();
  if (cleanUrl.length > LIMITS.sourceUrl) {
    throw bad('url');
  }

  const row = await env.DB.prepare('SELECT status, source_url, source_text FROM stories WHERE id = ?')
    .bind(id)
    .first<{ status: string; source_url: string | null; source_text: string }>();

  if (!row) throw new HttpError(404, 'not_found');
  if (!EDITABLE_STATUSES.includes(row.status as typeof STORY_STATUS_DRAFT)) {
    throw new HttpError(409, 'invalid_transition');
  }

  const result = await fetchAndExtractSource(cleanUrl, fetchFn);
  const now = new Date().toISOString();

  if (result.ok) {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE stories SET source_url = ?, source_text = ?, import_failed = 0, import_message = ?, checks_facts_verified = 0, checks_attribution_verified = 0, updated_at = ? WHERE id = ?`,
      ).bind(cleanUrl, result.sourceText, result.importMessage, now, id),
      env.DB.prepare(
        `INSERT INTO story_events (story_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)`,
      ).bind(id, 'import_attempted', JSON.stringify({ ok: true, url: cleanUrl }), now),
    ]);

    return json({
      ok: true,
      sourceText: result.sourceText,
      importMessage: result.importMessage,
    });
  } else {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE stories SET source_url = ?, import_failed = 1, import_message = ?, updated_at = ? WHERE id = ?`,
      ).bind(cleanUrl, result.importMessage, now, id),
      env.DB.prepare(
        `INSERT INTO story_events (story_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)`,
      ).bind(id, 'import_attempted', JSON.stringify({ ok: false, failureClass: result.failureClass, url: cleanUrl }), now),
    ]);

    return json({
      ok: false,
      failureClass: result.failureClass,
      importMessage: result.importMessage,
    });
  }
}

/**
 * Handles POST /api/stories/:id/start-review
 * Explicit server transition from مسودة to قيد المراجعة for manual editorial workflow before AI integration.
 * Enforces source sufficiency: source_text.trim().length >= 50 AND source_name.trim() !== ''.
 */
export async function startStoryReview(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(`SELECT ${STORY_COLUMNS} FROM stories WHERE id = ?`).bind(id).first<StoryRow>();
  if (!row) throw new HttpError(404, 'not_found');

  if (row.status !== STORY_STATUS_DRAFT && row.status !== STORY_STATUS_REVIEW) {
    throw new HttpError(409, 'invalid_transition');
  }

  const cleanText = (row.source_text ?? '').trim();
  const cleanName = (row.source_name ?? '').trim();
  if (cleanText.length < LIMITS.minExtractedChars) {
    throw bad('sourceText');
  }
  if (!cleanName) {
    throw bad('sourceName');
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE stories SET status = ?, updated_at = ? WHERE id = ?').bind(STORY_STATUS_REVIEW, now, id),
    env.DB.prepare('INSERT INTO story_events (story_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)').bind(
      id,
      'review_started',
      JSON.stringify({ mode: 'manual' }),
      now,
    ),
  ]);

  return getStory(env, id);
}

/**
 * Handles POST /api/stories/:id/checks (Specs §3.4)
 * Body: { factsVerified?: boolean, attributionVerified?: boolean }
 */
export async function updateStoryChecks(request: Request, env: Env, id: string): Promise<Response> {
  const body = await readJson(request);
  const row = await env.DB.prepare(`SELECT ${STORY_COLUMNS} FROM stories WHERE id = ?`).bind(id).first<StoryRow>();
  if (!row) throw new HttpError(404, 'not_found');
  if (!EDITABLE_STATUSES.includes(row.status as typeof STORY_STATUS_DRAFT)) {
    throw new HttpError(409, 'invalid_transition');
  }

  let factsVerified = Boolean(row.checks_facts_verified);
  let attributionVerified = Boolean(row.checks_attribution_verified);

  if (body.factsVerified !== undefined) {
    if (typeof body.factsVerified !== 'boolean') throw bad('factsVerified');
    factsVerified = body.factsVerified;
  }
  if (body.attributionVerified !== undefined) {
    if (typeof body.attributionVerified !== 'boolean') throw bad('attributionVerified');
    attributionVerified = body.attributionVerified;
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE stories SET checks_facts_verified = ?, checks_attribution_verified = ?, updated_at = ? WHERE id = ?',
    ).bind(factsVerified ? 1 : 0, attributionVerified ? 1 : 0, now, id),
    env.DB.prepare('INSERT INTO story_events (story_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)').bind(
      id,
      'check_updated',
      JSON.stringify({ factsVerified, attributionVerified }),
      now,
    ),
  ]);

  const checks: StoryChecks = { factsVerified, attributionVerified };
  const updated = await env.DB.prepare(`SELECT ${STORY_COLUMNS} FROM stories WHERE id = ?`).bind(id).first<StoryRow>();
  return json({ checks, story: updated ? toDto(updated) : undefined });
}

/**
 * Handles POST /api/stories/:id/resolve-blocker (Specs §3.4, §11.3)
 * Body: { resolutionNote: string } (or { note: string })
 * Resets checks_facts_verified and checks_attribution_verified to false.
 */
export async function resolveStoryBlocker(request: Request, env: Env, id: string): Promise<Response> {
  const body = await readJson(request);
  const rawNote = typeof body.resolutionNote === 'string' ? body.resolutionNote : typeof body.note === 'string' ? body.note : '';
  const note = rawNote.trim();
  if (!note || note.length > 1000) throw bad('resolutionNote');

  const row = await env.DB.prepare(`SELECT ${STORY_COLUMNS} FROM stories WHERE id = ?`).bind(id).first<StoryRow>();
  if (!row) throw new HttpError(404, 'not_found');
  if (!EDITABLE_STATUSES.includes(row.status as typeof STORY_STATUS_DRAFT)) {
    throw new HttpError(409, 'invalid_transition');
  }

  // Upgrade review-req facts to sourced once resolved
  const currentFacts = parseFactsJson(row.facts_json).map((f) =>
    f.type === 'review-req' ? { ...f, type: 'sourced' as const, status: 'تمت معالجة الإسناد ومراجعته يدوياً' } : f,
  );

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE stories SET has_blocker = 0, blocker_reason = NULL, facts_json = ?, checks_facts_verified = 0, checks_attribution_verified = 0, updated_at = ? WHERE id = ?',
    ).bind(JSON.stringify(currentFacts), now, id),
    env.DB.prepare('INSERT INTO story_events (story_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)').bind(
      id,
      'blocker_resolved',
      JSON.stringify({ resolutionNote: note }),
      now,
    ),
  ]);

  return getStory(env, id);
}

/**
 * Handles POST /api/stories/:id/approve (Specs §3.4, §11.1, §11.2)
 * Enforces all 5 human approval conditions on the server.
 */
export async function approveStory(env: Env, id: string, approvedByEmail = 'editor'): Promise<Response> {
  const row = await env.DB.prepare(`SELECT ${STORY_COLUMNS} FROM stories WHERE id = ?`).bind(id).first<StoryRow>();
  if (!row) throw new HttpError(404, 'not_found');

  if (row.status !== STORY_STATUS_REVIEW) {
    if (row.status === STORY_STATUS_DRAFT) {
      return json(
        {
          error: 'approval_blocked',
          reasons: ['الخبر لا يزال في حالة «مسودة»؛ يجب نقله إلى مرحلة «قيد المراجعة» أولاً.'],
        },
        422,
      );
    }
    throw new HttpError(409, 'invalid_transition');
  }

  const reasons: string[] = [];
  if ((row.source_text ?? '').trim().length < LIMITS.minExtractedChars) {
    reasons.push('النص الأصلي للمصدر غير كافٍ (أقل من 50 حرفاً).');
  }
  if (!(row.source_name ?? '').trim()) {
    reasons.push('اسم المصدر أو الجهة غير محدد.');
  }
  if (row.has_blocker) {
    reasons.push('يوجد مانع تحريري نشط يجب معالجته قبل الاعتماد.');
  }
  if (!row.checks_facts_verified) {
    reasons.push('لم يتم تأكيد مراجعة الأسماء والأرقام والتواريخ مع المصدر.');
  }
  if (!row.checks_attribution_verified) {
    reasons.push('لم يتم تأكيد دقة إسناد التصريحات وخلو الصيغ من الادعاءات غير المسندة.');
  }

  if (reasons.length > 0) {
    return json({ error: 'approval_blocked', reasons }, 422);
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE stories SET status = ?, approved_at = ?, updated_at = ? WHERE id = ?').bind(
      STORY_STATUS_APPROVED,
      now,
      now,
      id,
    ),
    env.DB.prepare('INSERT INTO story_events (story_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)').bind(
      id,
      'approved',
      JSON.stringify({ approvedBy: approvedByEmail, approvedAt: now }),
      now,
    ),
  ]);

  return getStory(env, id);
}

/**
 * Handles POST /api/stories/:id/publish (Specs §3.4, §6.2)
 * Only allowed when current status is معتمد.
 */
export async function publishStory(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(`SELECT ${STORY_COLUMNS} FROM stories WHERE id = ?`).bind(id).first<StoryRow>();
  if (!row) throw new HttpError(404, 'not_found');

  if (row.status !== STORY_STATUS_APPROVED) {
    throw new HttpError(409, 'invalid_transition');
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE stories SET status = ?, published_at = ?, updated_at = ? WHERE id = ?').bind(
      STORY_STATUS_PUBLISHED,
      now,
      now,
      id,
    ),
    env.DB.prepare('INSERT INTO story_events (story_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)').bind(
      id,
      'published',
      JSON.stringify({ publishedAt: now }),
      now,
    ),
  ]);

  return getStory(env, id);
}

/**
 * Handles POST /api/stories/:id/exclude (Specs §3.4, §6.2, §11.4)
 * Body: { reason: string }
 * Allowed from مسودة or قيد المراجعة. Never deletes story content.
 */
export async function excludeStory(request: Request, env: Env, id: string): Promise<Response> {
  const body = await readJson(request);
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason || reason.length > 1000) throw bad('reason');

  const row = await env.DB.prepare(`SELECT ${STORY_COLUMNS} FROM stories WHERE id = ?`).bind(id).first<StoryRow>();
  if (!row) throw new HttpError(404, 'not_found');

  if (!EDITABLE_STATUSES.includes(row.status as typeof STORY_STATUS_DRAFT)) {
    throw new HttpError(409, 'invalid_transition');
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE stories SET status = ?, exclude_reason = ?, updated_at = ? WHERE id = ?').bind(
      STORY_STATUS_EXCLUDED,
      reason,
      now,
      id,
    ),
    env.DB.prepare('INSERT INTO story_events (story_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)').bind(
      id,
      'excluded',
      JSON.stringify({ reason }),
      now,
    ),
  ]);

  return getStory(env, id);
}
