/** Settings — GET and PUT /api/settings (Specs §3.5). Never exposes AI_API_KEY. */
import type { SettingsDto, SettingsPutBody } from '../shared/contracts';
import type { Env } from './env';
import { HttpError, json, readJson } from './http';

interface SettingsRow {
  id: number;
  station_name: string;
  editorial_style: string;
  radio_length: string;
  model_provider: string;
  model_name: string;
  updated_at: string;
}

const SETTINGS_COLUMNS = 'id, station_name, editorial_style, radio_length, model_provider, model_name, updated_at';

function toSettingsDto(r: SettingsRow, env: Env): SettingsDto {
  return {
    stationName: r.station_name,
    editorialStyle: r.editorial_style,
    radioLength: r.radio_length,
    modelProvider: r.model_provider,
    modelName: r.model_name,
    // Strictly boolean status: never reveals any part of AI_API_KEY
    aiConfigured: Boolean(env.AI_API_KEY && env.AI_API_KEY.trim().length > 0),
    updatedAt: r.updated_at,
  };
}

function bad(field: string): HttpError {
  return new HttpError(400, 'invalid_input', { field });
}

export async function getSettings(env: Env): Promise<Response> {
  let row = await env.DB.prepare(`SELECT ${SETTINGS_COLUMNS} FROM settings WHERE id = 1`).first<SettingsRow>();
  if (!row) {
    const now = new Date().toISOString();
    await env.DB.prepare('INSERT OR IGNORE INTO settings (id, updated_at) VALUES (1, ?)').bind(now).run();
    row = await env.DB.prepare(`SELECT ${SETTINGS_COLUMNS} FROM settings WHERE id = 1`).first<SettingsRow>();
  }
  if (!row) throw new Error('settings row missing');
  return json({ settings: toSettingsDto(row, env) });
}

export async function putSettings(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);

  // Reject any attempt to pass an API key from the browser
  if ('apiKey' in body || 'AI_API_KEY' in body || 'api_key' in body) {
    throw bad('apiKey');
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
