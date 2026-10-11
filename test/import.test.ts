import { describe, expect, it } from 'vitest';
import { extractArticleText, validateUrlForSsrf } from '../src/server/importer';
import { api, createDraft, loginCookie } from './helpers';

describe('SSRF Protection (Specs §9.2)', () => {
  it('rejects non-https schemes', () => {
    expect(validateUrlForSsrf('http://example.com').ok).toBe(false);
    expect(validateUrlForSsrf('ftp://example.com').ok).toBe(false);
    expect(validateUrlForSsrf('file:///etc/passwd').ok).toBe(false);
    expect(validateUrlForSsrf('javascript:alert(1)').ok).toBe(false);
  });

  it('rejects userinfo in URL', () => {
    expect(validateUrlForSsrf('https://admin:pass@example.com').ok).toBe(false);
  });

  it('rejects localhost and local hostnames', () => {
    expect(validateUrlForSsrf('https://localhost/api').ok).toBe(false);
    expect(validateUrlForSsrf('https://app.localhost/').ok).toBe(false);
    expect(validateUrlForSsrf('https://database.internal/').ok).toBe(false);
    expect(validateUrlForSsrf('https://service.local/').ok).toBe(false);
  });

  it('rejects IPv4 loopback, private networks, and cloud metadata', () => {
    expect(validateUrlForSsrf('https://127.0.0.1/').ok).toBe(false);
    expect(validateUrlForSsrf('https://127.0.1.5/').ok).toBe(false);
    expect(validateUrlForSsrf('https://10.0.0.1/admin').ok).toBe(false);
    expect(validateUrlForSsrf('https://172.16.0.1/').ok).toBe(false);
    expect(validateUrlForSsrf('https://172.31.255.255/').ok).toBe(false);
    expect(validateUrlForSsrf('https://192.168.1.1/').ok).toBe(false);
    expect(validateUrlForSsrf('https://169.254.169.254/latest/meta-data').ok).toBe(false);
    expect(validateUrlForSsrf('https://0.0.0.0/').ok).toBe(false);
  });

  it('rejects IPv6 loopback and link-local', () => {
    expect(validateUrlForSsrf('https://[::1]/').ok).toBe(false);
    expect(validateUrlForSsrf('https://[fe80::1]/').ok).toBe(false);
    expect(validateUrlForSsrf('https://[fc00::1]/').ok).toBe(false);
  });

  it('accepts legitimate public HTTPS URLs', () => {
    expect(validateUrlForSsrf('https://ina.iq/article-123').ok).toBe(true);
    expect(validateUrlForSsrf('https://unicef.org/iraq/water-report').ok).toBe(true);
    expect(validateUrlForSsrf('https://news.ycombinator.com/').ok).toBe(true);
  });
});

describe('HTML Article Text Extractor (Specs §3.3)', () => {
  it('strips scripts, styles, nav, footer, header and extracts article body', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>تقرير المياه</title><style>.hidden { display: none; }</style></head>
        <body>
          <header><nav><a href="/">الرئيسية</a></nav></header>
          <aside>إعلانات تجارية</aside>
          <article>
            <h1>أزمة المياه في الديوانية</h1>
            <p>أعلنت منظمة يونيسف عن تفاقم شح المياه في مناطق الفرات الأوسط.</p>
            <p>وبلغ عدد المتأثرين أكثر من 15,000 عائلة خلال شهر أيلول الماضي.</p>
          </article>
          <footer>جميع الحقوق محفوظة 2026</footer>
          <script>console.log("tracking");</script>
        </body>
      </html>
    `;
    const text = extractArticleText(html);
    expect(text).toContain('أزمة المياه في الديوانية');
    expect(text).toContain('أعلنت منظمة يونيسف عن تفاقم شح المياه');
    expect(text).toContain('15,000 عائلة');
    expect(text).not.toContain('الرئيسية');
    expect(text).not.toContain('إعلانات تجارية');
    expect(text).not.toContain('جميع الحقوق محفوظة');
    expect(text).not.toContain('tracking');
  });

  it('decodes HTML entities properly', () => {
    const html = '<article><p>وزارة النفط &amp; شركة &quot;سومو&quot; &#160; تعلنان الأرقام</p></article>';
    const text = extractArticleText(html);
    expect(text).toContain('وزارة النفط & شركة "سومو" تعلنان الأرقام');
  });
});

describe('POST /api/stories/:id/import endpoint (Specs §3.3, §9, §12)', () => {
  it('requires authentication and csrf header', async () => {
    const unauth = await api('/api/stories/some-id/import', {
      method: 'POST',
      body: { url: 'https://example.com/test' },
    });
    expect(unauth.status).toBe(401);

    const cookie = await loginCookie();
    const noCsrf = await api('/api/stories/some-id/import', {
      method: 'POST',
      cookie,
      noClientHeader: true,
      body: { url: 'https://example.com/test' },
    });
    expect(noCsrf.status).toBe(403);
  });

  it('rejects SSRF attempts with HTTP 200 and blocked failureClass', async () => {
    const cookie = await loginCookie();
    const draft = await createDraft(cookie);

    const res = await api(`/api/stories/${draft.id}/import`, {
      method: 'POST',
      cookie,
      body: { url: 'https://169.254.169.254/latest/meta-data' },
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean; failureClass: string; importMessage: string };
    expect(data.ok).toBe(false);
    expect(data.failureClass).toBe('blocked');
    expect(data.importMessage).toContain('يمنع');
  });

  it('rejects non-existent story with 404', async () => {
    const cookie = await loginCookie();
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await api(`/api/stories/${fakeId}/import`, {
      method: 'POST',
      cookie,
      body: { url: 'https://ina.iq/article' },
    });
    expect(res.status).toBe(404);
  });

  it('preserves existing source_text upon import failure (SC-02)', async () => {
    const cookie = await loginCookie();
    const draft = await createDraft(cookie, {
      sourceName: 'يونيسف',
      sourceText: 'نص يدوي محفوظ مسبقاً لم يضع أثناء المحاولة.',
    });

    const res = await api(`/api/stories/${draft.id}/import`, {
      method: 'POST',
      cookie,
      body: { url: 'https://127.0.0.1/blocked' },
    });
    expect(res.status).toBe(200);

    // Verify story was not overwritten
    const checkRes = await api(`/api/stories/${draft.id}`, { cookie });
    const { story } = await checkRes.json() as { story: { sourceText: string; sourceUrl: string } };
    expect(story.sourceText).toBe('نص يدوي محفوظ مسبقاً لم يضع أثناء المحاولة.');
    expect(story.sourceUrl).toBe('https://127.0.0.1/blocked');
  });
});
