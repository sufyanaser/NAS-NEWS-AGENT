import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { api, createDraft, loginCookie } from './helpers';

interface Story {
  id: string;
  status: string;
  sourceUrl: string;
  sourceName: string;
  publishDate: string;
  category: string;
  sourceLang: string;
  sourceText: string;
  updatedAt: string;
}

async function getStory(cookie: string, id: string): Promise<Story> {
  const res = await api(`/api/stories/${id}`, { cookie });
  expect(res.status).toBe(200);
  return ((await res.json()) as { story: Story }).story;
}

describe('draft persistence (Specs §3.2, §10)', () => {
  it('creates an empty draft immediately with status مسودة', async () => {
    const cookie = await loginCookie();
    const story = await createDraft(cookie);
    const full = await getStory(cookie, story.id);
    expect(full.status).toBe('مسودة');
    expect(full.sourceText).toBe('');
    expect(full.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('creates a draft with initial fields in one request', async () => {
    const cookie = await loginCookie();
    const story = await createDraft(cookie, { sourceName: 'وكالة الأنباء', sourceText: 'نص أولي' });
    const full = await getStory(cookie, story.id);
    expect(full.sourceName).toBe('وكالة الأنباء');
    expect(full.sourceText).toBe('نص أولي');
  });

  it('saves source fields and restores them exactly, including Arabic and whitespace in the text', async () => {
    const cookie = await loginCookie();
    const { id } = await createDraft(cookie);
    const text = 'أعلنت وزارة التربية عن موعد الامتحانات.\n\n  سطر بمسافات  \nSecond line 12,500 دينار';
    const res = await api(`/api/stories/${id}`, {
      method: 'PATCH',
      cookie,
      body: {
        sourceUrl: 'https://example.org/news/1',
        sourceName: 'وزارة التربية',
        publishDate: '2026-10-11',
        category: 'محلي',
        sourceLang: 'العربية',
        sourceText: text,
      },
    });
    expect(res.status).toBe(200);
    const restored = await getStory(cookie, id);
    expect(restored).toMatchObject({
      sourceUrl: 'https://example.org/news/1',
      sourceName: 'وزارة التربية',
      publishDate: '2026-10-11',
      category: 'محلي',
      sourceLang: 'العربية',
      status: 'مسودة',
    });
    expect(restored.sourceText).toBe(text); // byte-exact, not trimmed
  });

  it('partial updates change only the supplied fields', async () => {
    const cookie = await loginCookie();
    const { id } = await createDraft(cookie, { sourceName: 'A', sourceText: 'hello' });
    await api(`/api/stories/${id}`, { method: 'PATCH', cookie, body: { sourceName: 'B' } });
    const s = await getStory(cookie, id);
    expect(s.sourceName).toBe('B');
    expect(s.sourceText).toBe('hello');
  });

  it('clearing an optional field stores it as empty', async () => {
    const cookie = await loginCookie();
    const { id } = await createDraft(cookie, { sourceName: 'A' });
    await api(`/api/stories/${id}`, { method: 'PATCH', cookie, body: { sourceName: '' } });
    expect((await getStory(cookie, id)).sourceName).toBe('');
  });

  it('accepts a half-typed URL so autosave of the text is never blocked by it', async () => {
    const cookie = await loginCookie();
    const { id } = await createDraft(cookie);
    const res = await api(`/api/stories/${id}`, { method: 'PATCH', cookie, body: { sourceUrl: 'https://exa', sourceText: 'x' } });
    expect(res.status).toBe(200);
  });

  it('accepts long pasted text (well beyond the 20,000-char extraction cap)', async () => {
    const cookie = await loginCookie();
    const { id } = await createDraft(cookie);
    const long = 'ن'.repeat(50_000);
    expect((await api(`/api/stories/${id}`, { method: 'PATCH', cookie, body: { sourceText: long } })).status).toBe(200);
    expect((await getStory(cookie, id)).sourceText).toHaveLength(50_000);
  });

  it('bumps updated_at and appends a draft_saved audit event that records field names, not text', async () => {
    const cookie = await loginCookie();
    const { id } = await createDraft(cookie);
    const before = await getStory(cookie, id);
    await new Promise((r) => setTimeout(r, 15));
    await api(`/api/stories/${id}`, { method: 'PATCH', cookie, body: { sourceText: 'نص سري للتحرير' } });
    const after = await getStory(cookie, id);
    expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(before.updatedAt));

    const events = await env.DB.prepare('SELECT event_type, detail FROM story_events WHERE story_id = ? ORDER BY id').bind(id).all<{
      event_type: string;
      detail: string;
    }>();
    expect(events.results.map((e) => e.event_type)).toEqual(['draft_saved', 'draft_saved']);
    expect(events.results[1]?.detail).toBe('{"fields":["sourceText"]}');
    expect(events.results.every((e) => !e.detail.includes('نص سري'))).toBe(true);
  });

  it('lists drafts newest-first for restoring after reopening the app', async () => {
    const cookie = await loginCookie();
    const a = await createDraft(cookie, { sourceName: 'الأول', sourceText: 'نص الأول' });
    await new Promise((r) => setTimeout(r, 15));
    const b = await createDraft(cookie, { sourceName: 'الثاني', sourceText: 'نص الثاني' });
    const res = await api('/api/stories?status=' + encodeURIComponent('مسودة'), { cookie });
    const { stories } = (await res.json()) as { stories: { id: string; sourceName: string; textPreview: string }[] };
    expect(stories.map((s) => s.id)).toEqual([b.id, a.id]);
    expect(stories[0]?.textPreview).toBe('نص الثاني');
  });
});

describe('validation', () => {
  it('rejects bad field values with 400 invalid_input naming the field', async () => {
    const cookie = await loginCookie();
    const { id } = await createDraft(cookie);
    const cases: [Record<string, unknown>, string][] = [
      [{ publishDate: '2026-13-45' }, 'publishDate'],
      [{ publishDate: '11/10/2026' }, 'publishDate'],
      [{ category: 'غير موجود' }, 'category'],
      [{ sourceLang: 'الفرنسية' }, 'sourceLang'],
      [{ sourceName: 'x'.repeat(201) }, 'sourceName'],
      [{ sourceUrl: 'https://a.b/\nx' }, 'sourceUrl'],
      [{ sourceText: 123 }, 'sourceText'],
      [{ sourceText: 'x'.repeat(100_001) }, 'sourceText'],
    ];
    for (const [body, field] of cases) {
      const res = await api(`/api/stories/${id}`, { method: 'PATCH', cookie, body });
      expect(res.status, JSON.stringify(body).slice(0, 60)).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_input', field });
    }
  });

  it('rejects an empty patch and unknown ids', async () => {
    const cookie = await loginCookie();
    const { id } = await createDraft(cookie);
    expect((await api(`/api/stories/${id}`, { method: 'PATCH', cookie, body: {} })).status).toBe(400);
    const ghost = '22222222-2222-4222-8222-222222222222';
    expect((await api(`/api/stories/${ghost}`, { cookie })).status).toBe(404);
    expect((await api(`/api/stories/${ghost}`, { method: 'PATCH', cookie, body: { sourceName: 'x' } })).status).toBe(404);
    expect((await api('/api/stories/not-a-uuid', { cookie })).status).toBe(404);
  });

  it('a rejected patch changes nothing (no text lost or corrupted)', async () => {
    const cookie = await loginCookie();
    const { id } = await createDraft(cookie, { sourceText: 'محفوظ' });
    await api(`/api/stories/${id}`, { method: 'PATCH', cookie, body: { sourceText: 'جديد', publishDate: 'bad' } });
    expect((await getStory(cookie, id)).sourceText).toBe('محفوظ');
  });

  it('validates list parameters', async () => {
    const cookie = await loginCookie();
    expect((await api('/api/stories?status=bogus', { cookie })).status).toBe(400);
    expect((await api('/api/stories?limit=0', { cookie })).status).toBe(400);
    expect((await api('/api/stories?limit=51', { cookie })).status).toBe(400);
  });

  it('DELETE is not available (no permanent deletion in MVP)', async () => {
    const cookie = await loginCookie();
    const { id } = await createDraft(cookie);
    expect((await api(`/api/stories/${id}`, { method: 'DELETE', cookie })).status).toBe(405);
    expect((await getStory(cookie, id)).id).toBe(id);
  });

  it('refuses edits to stories that are already approved/published/excluded', async () => {
    const cookie = await loginCookie();
    const { id } = await createDraft(cookie);
    for (const status of ['معتمد', 'منشور', 'مستبعد']) {
      await env.DB.prepare('UPDATE stories SET status = ? WHERE id = ?').bind(status, id).run();
      const res = await api(`/api/stories/${id}`, { method: 'PATCH', cookie, body: { sourceName: 'x' } });
      expect(res.status, status).toBe(409);
      expect(await res.json()).toEqual({ error: 'invalid_transition' });
    }
  });
});
