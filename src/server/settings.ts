/** Settings — GET and PUT /api/settings, plus POST /api/settings/test-model (Specs §3.5). Never exposes AI secrets. */
import type { SettingsDto, SettingsPutBody } from '../shared/contracts';
import { normalizeProviderId, resolveModelId } from './ai/catalog';
import {
  getProvidersStatus,
  isAnyProviderConfigured,
  isProviderConfigured,
  testProviderConnection,
} from './ai/registry';
import type { Env } from './env';
import { HttpError, json, readJson } from './http';

export interface SettingsRow {
  id: number;
  station_name: string;
  editorial_style: string;
  radio_length: string;
  model_provider: string;
  model_name: string;
  updated_at: string;
}

const SETTINGS_COLUMNS =
  'id, station_name, editorial_style, radio_length, model_provider, model_name, updated_at';

const FORBIDDEN_SECRET_KEYS = [
  'apiKey',
  'api_key',
  'AI_API_KEY',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY',
  'secret',
  'secretKey',
  'token',
] as const;

// In-memory sliding window rate limiter for POST /api/settings/test-model (max 10 tests / 60s per user)
const TEST_MODEL_WINDOW_MS = 60_000;
const TEST_MODEL_MAX_REQUESTS = 10;
const testModelBuckets = new Map<string, number[]>();

export function resetTestModelRateLimit(): void {
  testModelBuckets.clear();
}

function checkTestModelRateLimit(userId: string): boolean {
  const now = Date.now();
  const prev = testModelBuckets.get(userId) ?? [];
  const active = prev.filter((ts) => now - ts < TEST_MODEL_WINDOW_MS);
  if (active.length >= TEST_MODEL_MAX_REQUESTS) {
    testModelBuckets.set(userId, active);
    return false;
  }
  active.push(now);
  testModelBuckets.set(userId, active);
  return true;
}

function toSettingsDto(r: SettingsRow, env: Env): SettingsDto {
  const normalizedProvider = normalizeProviderId(r.model_provider);
  const configuredForSelected = isProviderConfigured(env, normalizedProvider);
  const anyConfigured = isAnyProviderConfigured(env, r.model_provider);
  return {
    stationName: r.station_name,
    editorialStyle: r.editorial_style,
    radioLength: r.radio_length,
    modelProvider: r.model_provider,
    modelName: r.model_name,
    // Strictly boolean status: never reveals any part of any secret key
    aiConfigured: configuredForSelected || anyConfigured,
    updatedAt: r.updated_at,
    providers: getProvidersStatus(env),
  };
}

function bad(field: string): HttpError {
  return new HttpError(400, 'invalid_input', { field });
}

export async function getSettingsRow(env: Env): Promise<SettingsRow> {
  let row = await env.DB.prepare(`SELECT ${SETTINGS_COLUMNS} FROM settings WHERE id = 1`).first<SettingsRow>();
  if (!row) {
    const now = new Date().toISOString();
    await env.DB.prepare('INSERT OR IGNORE INTO settings (id, updated_at) VALUES (1, ?)').bind(now).run();
    row = await env.DB.prepare(`SELECT ${SETTINGS_COLUMNS} FROM settings WHERE id = 1`).first<SettingsRow>();
  }
  if (!row) throw new Error('settings row missing');
  return row;
}

export async function getSettings(env: Env): Promise<Response> {
  const row = await getSettingsRow(env);
  return json({ settings: toSettingsDto(row, env) });
}

export async function putSettings(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);

  // Reject any attempt to pass an API key or secret from the browser
  for (const key of FORBIDDEN_SECRET_KEYS) {
    if (key in body) {
      throw bad('apiKey');
    }
  }

  const patch: SettingsPutBody = {};
  const checkStr = (k: keyof SettingsPutBody, max: number) => {
    const v = body[k];
    if (v === undefined) return;
    if (typeof v !== 'string') throw bad(k);
    const trimmed = v.trim();
    if (!trimmed || trimmed.length > max) throw bad(k);
    patch[k] = trimmed;
  };

  checkStr('stationName', 150);
  checkStr('editorialStyle', 150);
  checkStr('radioLength', 50);
  checkStr('modelProvider', 100);
  checkStr('modelName', 100);

  if (Object.keys(patch).length === 0) throw bad('body');

  const sets: string[] = [];
  const vals: string[] = [];

  if (patch.stationName !== undefined) {
    sets.push('station_name = ?');
    vals.push(patch.stationName);
  }
  if (patch.editorialStyle !== undefined) {
    sets.push('editorial_style = ?');
    vals.push(patch.editorialStyle);
  }
  if (patch.radioLength !== undefined) {
    sets.push('radio_length = ?');
    vals.push(patch.radioLength);
  }
  if (patch.modelProvider !== undefined) {
    sets.push('model_provider = ?');
    vals.push(patch.modelProvider);
  }
  if (patch.modelName !== undefined) {
    sets.push('model_name = ?');
    vals.push(patch.modelName);
  }

  const now = new Date().toISOString();
  await env.DB.prepare('INSERT OR IGNORE INTO settings (id, updated_at) VALUES (1, ?)').bind(now).run();
  await env.DB.prepare(`UPDATE settings SET ${sets.join(', ')}, updated_at = ? WHERE id = 1`)
    .bind(...vals, now)
    .run();

  return getSettings(env);
}

/**
 * Handles POST /api/settings/test-model
 * Tests server-side connectivity for the specified or saved AI provider & model without exposing any secrets.
 */
export async function testModelSettings(
  request: Request,
  env: Env,
  userId: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  if (!checkTestModelRateLimit(userId)) {
    return json(
      {
        error: 'rate_limited',
        message: 'تم تجاوز الحد المسموح لاختبار الاتصال. يرجى الانتظار دقيقة قبل المحاولة مجدداً.',
      },
      429,
    );
  }

  if (env.LOGIN_LIMITER) {
    const { success } = await env.LOGIN_LIMITER.limit({ key: `test-model:${userId}` });
    if (!success) {
      return json(
        {
          error: 'rate_limited',
          message: 'تم تجاوز الحد المسموح لاختبار الاتصال. يرجى الانتظار دقيقة قبل المحاولة مجدداً.',
        },
        429,
      );
    }
  }

  const rawText = await request.text();
  let body: Record<string, unknown> = {};
  if (rawText.trim() !== '') {
    try {
      const parsed = JSON.parse(rawText);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw bad('body');
      }
      body = parsed as Record<string, unknown>;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw bad('body');
    }
  }

  for (const key of FORBIDDEN_SECRET_KEYS) {
    if (key in body) {
      throw bad('apiKey');
    }
  }

  const row = await getSettingsRow(env);
  const reqProvider =
    typeof body.provider === 'string' && body.provider.trim()
      ? body.provider.trim()
      : row.model_provider;
  const providerId = normalizeProviderId(reqProvider);
  const reqModel =
    typeof body.model === 'string' && body.model.trim()
      ? body.model.trim()
      : row.model_name;
  const modelId = resolveModelId(providerId, reqModel);

  const result = await testProviderConnection(
    env,
    { provider: providerId, model: modelId },
    fetchFn,
  );
  return json(result);
}
