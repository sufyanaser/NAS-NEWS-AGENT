/** Stories — draft creation, partial update (autosave), restore. Specs §3.2, §10. */
import { CATEGORIES, LIMITS, SOURCE_LANGS, STORY_STATUS_DRAFT } from '../shared/contracts';
import type { StoryDto, StoryPatchBody, StorySummaryDto } from '../shared/contracts';
import type { Env } from './env';
import { HttpError, json, readJson } from './http';

interface StoryRow {
  id: string;
  status: string;
  source_url: string | null;
  source_name: string | null;
  publish_date: string | null;
  category: string | null;
  source_lang: string | null;
  source_text: string;
  created_at: string;
  updated_at: string;
}

const STORY_COLUMNS =
  'id, status, source_url, source_name, publish_date, category, source_lang, source_text, created_at, updated_at';

const VALID_STATUSES = ['مسودة', 'قيد المراجعة', 'معتمد', 'منشور', 'مستبعد'];
/** Source fields may only be edited while the story is still being worked on. */
const EDITABLE_STATUSES = ['مسودة', 'قيد المراجعة'];

export const STORY_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function toDto(r: StoryRow): StoryDto {
  return {
    id: r.id,
    status: r.status,
    sourceUrl: r.source_url ?? '',
    sourceName: r.source_name ?? '',
    publishDate: r.publish_date ?? '',
    category: r.category ?? '',
    sourceLang: r.source_lang ?? '',
    sourceText: r.source_text,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function bad(field: string): HttpError {
  return new HttpError(400, 'invalid_input', { field });
}

function str(body: Record<string, unknown>, key: keyof StoryPatchBody, max: number, trim: boolean): string | undefined {
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
 * Validates only what is present. The URL is stored as typed (length-limited, no control chars): strict
 * URL/SSRF validation belongs to the import step, and rejecting half-typed URLs here would make autosave
 * of the *text* fail.
 */
export function parsePatch(body: Record<string, unknown>): StoryPatchBody {
  const patch: StoryPatchBody = {};
  const sourceUrl = str(body, 'sourceUrl', LIMITS.sourceUrl, true);
  const sourceName = str(body, 'sourceName', LIMITS.sourceName, true);
  const sourceText = str(body, 'sourceText', LIMITS.sourceText, false);
  const publishDate = str(body, 'publishDate', 10, true);
  const category = str(body, 'category', 100, true);
  const sourceLang = str(body, 'sourceLang', 50, true);

  if (publishDate) {
    const d = new Date(`${publishDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== publishDate) {
      throw bad('publishDate');
    }
  }
  if (category && !(CATEGORIES as readonly string[]).includes(category)) throw bad('category');
  if (sourceLang && !(SOURCE_LANGS as readonly string[]).includes(sourceLang)) throw bad('sourceLang');

  if (sourceUrl !== undefined) patch.sourceUrl = sourceUrl;
  if (sourceName !== undefined) patch.sourceName = sourceName;
  if (sourceText !== undefined) patch.sourceText = sourceText;
  if (publishDate !== undefined) patch.publishDate = publishDate;
  if (category !== undefined) patch.category = category;
  if (sourceLang !== undefined) patch.sourceLang = sourceLang;
  return patch;
}

const COLUMN_OF: Record<keyof StoryPatchBody, string> = {
  sourceUrl: 'source_url',
  sourceName: 'source_name',
  publishDate: 'publish_date',
  category: 'category',
  sourceLang: 'source_lang',
  sourceText: 'source_text',
};

async function buildUpdate(env: Env, id: string, patch: StoryPatchBody, now: string): Promise<D1PreparedStatement[]> {
  const fields = Object.keys(patch) as (keyof StoryPatchBody)[];
  const sets = fields.map((f) => `${COLUMN_OF[f]} = ?`);
  const values = fields.map((f) => {
    const v = patch[f] as string;
    return f === 'sourceText' ? v : v === '' ? null : v;
  });
  return [
    env.DB.prepare(`UPDATE stories SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...values, now, id),
    // The audit trail records WHICH fields changed, never the text itself.
    env.DB.prepare('INSERT INTO story_events (story_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)').bind(
      id,
      'draft_saved',
      JSON.stringify({ fields }),
      now,
    ),
  ];
}

export async function createStory(request: Request, env: Env): Promise<Response> {
  // Body is optional; a client may create the draft with its first fields in one request.
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
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO stories (id, status, source_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(id, STORY_STATUS_DRAFT, '', now, now),
    env.DB.prepare('INSERT INTO story_events (story_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)').bind(
      id,
      'draft_saved',
      JSON.stringify({ created: true }),
      now,
    ),
    ...(Object.keys(patch).length > 0 ? await buildUpdate(env, id, patch, now) : []),
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

  const row = await env.DB.prepare('SELECT status FROM stories WHERE id = ?').bind(id).first<{ status: string }>();
  if (!row) throw new HttpError(404, 'not_found');
  if (!EDITABLE_STATUSES.includes(row.status)) throw new HttpError(409, 'invalid_transition');

  await env.DB.batch(await buildUpdate(env, id, patch, new Date().toISOString()));
  return getStory(env, id);
}

export async function listStories(url: URL, env: Env): Promise<Response> {
  const status = url.searchParams.get('status');
  if (status !== null && !VALID_STATUSES.includes(status)) throw bad('status');
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw === null ? 20 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw bad('limit');

  const where = status ? 'WHERE status = ?' : '';
  const stmt = env.DB.prepare(
    `SELECT id, status, source_name, source_url, SUBSTR(source_text, 1, 120) AS preview, updated_at
       FROM stories ${where} ORDER BY updated_at DESC, id LIMIT ?`,
  );
  const { results } = await (status ? stmt.bind(status, limit) : stmt.bind(limit)).all<{
    id: string;
    status: string;
    source_name: string | null;
    source_url: string | null;
    preview: string;
    updated_at: string;
  }>();
  const stories: StorySummaryDto[] = results.map((r) => ({
    id: r.id,
    status: r.status,
    sourceName: r.source_name ?? '',
    sourceUrl: r.source_url ?? '',
    textPreview: r.preview,
    updatedAt: r.updated_at,
  }));
  return json({ stories });
}
