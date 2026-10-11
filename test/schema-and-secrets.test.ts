import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { api, createDraft, loginCookie } from './helpers';

describe('database migrations (Specs §4)', () => {
  it('creates exactly the specified tables and indexes', async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
    ).all<{ name: string }>();
    expect(tables.results.map((t) => t.name)).toEqual(['sessions', 'settings', 'stories', 'story_events', 'users']);

    const indexes = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name").all<{ name: string }>();
    expect(indexes.results.map((i) => i.name)).toEqual(['idx_events_story', 'idx_sessions_user', 'idx_stories_status', 'idx_stories_updated']);
  });

  it('seeds the single settings row and forbids a second one', async () => {
    const row = await env.DB.prepare('SELECT * FROM settings').all<{ id: number; model_name: string }>();
    expect(row.results).toHaveLength(1);
    expect(row.results[0]?.id).toBe(1);
    await expect(env.DB.prepare('INSERT INTO settings (id) VALUES (2)').run()).rejects.toThrow();
  });

  it('enforces the story status CHECK constraint and the draft default', async () => {
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO stories (id) VALUES (?)').bind(id).run();
    const row = await env.DB.prepare('SELECT status, source_text FROM stories WHERE id = ?').bind(id).first<{ status: string; source_text: string }>();
    expect(row).toEqual({ status: 'مسودة', source_text: '' });
    await expect(env.DB.prepare("UPDATE stories SET status = 'غير صالح' WHERE id = ?").bind(id).run()).rejects.toThrow();
  });

  it('enforces unique user emails', async () => {
    const ins = (id: string) =>
      env.DB.prepare('INSERT INTO users (id, email, password_hash, password_salt) VALUES (?, ?, ?, ?)').bind(id, 'a@b.test', 'h', 's').run();
    await ins('u1');
    await expect(ins('u2')).rejects.toThrow();
  });
});

describe('API key protection (Specs §12.5)', () => {
  it('never reveals AI_API_KEY in any API response, header, or error', async () => {
    const canary = env.AI_API_KEY;
    expect(canary).toContain('canary');
    const cookie = await loginCookie();
    const { id } = await createDraft(cookie, { sourceText: 'x' });

    const responses: Response[] = [
      await api('/api/session', { cookie }),
      await api('/api/stories', { cookie }),
      await api(`/api/stories/${id}`, { cookie }),
      await api('/api/stories/bad', { cookie }),
      await api('/api/nothing-here', { cookie }),
      await api('/api/settings', { cookie }), // not implemented in this slice -> 404, still must not leak
      await api('/api/session'), // 401
      await api('/api/auth/login', { method: 'POST', body: { email: 'a', password: 'b' } }),
    ];
    for (const r of responses) {
      const text = await r.clone().text();
      const headers = JSON.stringify([...r.headers.entries()]);
      expect(text).not.toContain(canary);
      expect(headers).not.toContain(canary);
    }
  });

  it('internal errors return a generic body with no stack or details', async () => {
    const cookie = await loginCookie();
    const { id } = await createDraft(cookie);
    // Break the audit table reversibly so the PATCH batch fails with an unexpected DB error.
    await env.DB.exec('ALTER TABLE story_events RENAME TO story_events_broken');
    try {
      const res = await api(`/api/stories/${id}`, { method: 'PATCH', cookie, body: { sourceName: 'x' } });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'internal_error' });
    } finally {
      await env.DB.exec('ALTER TABLE story_events_broken RENAME TO story_events');
    }
  });

  it('API responses carry no-store and nosniff', async () => {
    const res = await api('/api/session');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
