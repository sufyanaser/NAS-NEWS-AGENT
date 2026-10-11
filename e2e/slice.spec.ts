import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const creds = (): { email: string; password: string } => JSON.parse(readFileSync('.wrangler/e2e-creds.json', 'utf8'));
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

async function login(page: Page): Promise<void> {
  const { email, password } = creds();
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.locator('#btn-login').click();
  await expect(page).toHaveURL(/\/stories\/new$/);
  await expect(page.locator('#f-source-text')).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

/** Every interactive control must lie inside the viewport horizontally (nothing clipped off-screen). */
async function expectControlsInsideViewport(page: Page): Promise<void> {
  const vw = page.viewportSize()?.width ?? 0;
  const boxes = await page.locator('input:visible, select:visible, textarea:visible, button:visible').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { id: e.id || e.tagName, left: r.left, right: r.right };
    }),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const b of boxes) {
    expect(b.left, `${b.id} left`).toBeGreaterThanOrEqual(-0.5);
    expect(b.right, `${b.id} right`).toBeLessThanOrEqual(vw + 0.5);
  }
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

test.describe('authentication', () => {
  test('unauthenticated visit is redirected to the RTL login screen', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/stories/new');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('#login-email')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectControlsInsideViewport(page);
    // The only expected console error is the browser logging the 401 of the session probe.
    expect(errors.filter((e) => !e.includes('401'))).toEqual([]);
  });

  test('wrong password shows a clear error and grants no session', async ({ page, context }) => {
    const { email } = creds();
    await page.goto('/login');
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill('definitely-not-the-password');
    await page.locator('#btn-login').click();
    await expect(page.locator('#login-error')).toBeVisible();
    await expect(page.locator('#login-error')).toContainText('غير صحيحة');
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.cookies()).find((c) => c.name === 'nas_session')).toBeUndefined();
    await page.goto('/stories/new');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('correct login creates a hardened session cookie that JavaScript cannot read', async ({ page, context }) => {
    const errors = collectErrors(page);
    await login(page);
    const cookie = (await context.cookies()).find((c) => c.name === 'nas_session');
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe('Strict');
    expect(cookie?.path).toBe('/');
    expect(await page.evaluate(() => document.cookie)).not.toContain('nas_session');
    expect(errors.filter((e) => !e.includes('401'))).toEqual([]);
  });

  test('logout revokes the session on the server (old cookie stops working)', async ({ page, context, request }) => {
    await login(page);
    const old = (await context.cookies()).find((c) => c.name === 'nas_session');
    expect(old).toBeDefined();
    await page.locator('#btn-logout').click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.cookies()).find((c) => c.name === 'nas_session')).toBeUndefined();

    // Replay the captured cookie from a clean client: the server must reject it.
    const replay = await request.get('/api/session', { headers: { Cookie: `nas_session=${old?.value}` } });
    expect(replay.status()).toBe(401);
    await page.goto('/stories/new');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('draft persistence', () => {
  test('saves automatically on the server, then restores after reload and from the drafts list', async ({ page }) => {
    const errors = collectErrors(page);
    await login(page);
    const marker = `E2E-${Date.now()}`;
    const text = `أعلنت الجهة المختصة اليوم عن قرار جديد. ${marker}\nسطر ثانٍ فيه رقم 12,500.`;

    await expect(page.locator('#save-state')).toContainText('لم تُحفظ بعد');
    await page.locator('#f-source-name').fill('وكالة الاختبار');
    await page.locator('#f-source-url').fill('https://example.org/news/e2e');
    await page.locator('#f-publish-date').fill('2026-10-11');
    await page.locator('#f-category').selectOption('محلي');
    await page.locator('#f-source-lang').selectOption('العربية');
    await page.locator('#f-source-text').fill(text);

    await expect(page.locator('#save-state')).toContainText('جارٍ الحفظ');
    await expect(page.locator('#save-state')).toHaveAttribute('data-state', 'saved');
    await expect(page.locator('#save-state')).toContainText('محفوظ');
    await expect(page).toHaveURL(new RegExp(`/stories/${UUID}$`));
    const draftUrl = page.url();

    // 1) Reload restores everything from the server.
    await page.reload();
    await expect(page.locator('#f-source-text')).toHaveValue(text);
    await expect(page.locator('#f-source-name')).toHaveValue('وكالة الاختبار');
    await expect(page.locator('#f-source-url')).toHaveValue('https://example.org/news/e2e');
    await expect(page.locator('#f-publish-date')).toHaveValue('2026-10-11');
    await expect(page.locator('#f-category')).toHaveValue('محلي');
    await expect(page.locator('#f-source-lang')).toHaveValue('العربية');
    await expect(page.locator('#save-state')).toHaveAttribute('data-state', 'saved');

    // 2) A fresh "new story" screen lists the draft; opening it restores it.
    await page.locator('a.nav-item', { hasText: 'خبر جديد' }).click();
    await expect(page).toHaveURL(/\/stories\/new$/);
    await expect(page.locator('#f-source-text')).toHaveValue('');
    const item = page.locator('#drafts-list a.draft-item', { hasText: marker });
    await expect(item).toBeVisible();
    await item.click();
    await expect(page).toHaveURL(draftUrl);
    await expect(page.locator('#f-source-text')).toHaveValue(text);

    expect(errors.filter((e) => !e.includes('401'))).toEqual([]);
  });

  test('the explicit save button saves immediately and updates an existing draft in place', async ({ page }) => {
    await login(page);
    await page.locator('#f-source-text').fill('نسخة أولى');
    await page.locator('#btn-save').click();
    await expect(page.locator('#save-state')).toHaveAttribute('data-state', 'saved');
    const url = page.url();
    await page.locator('#f-source-text').fill('نسخة ثانية معدّلة');
    await page.locator('#btn-save').click();
    await expect(page.locator('#save-state')).toHaveAttribute('data-state', 'saved');
    expect(page.url()).toBe(url); // same draft, not a new one
    await page.reload();
    await expect(page.locator('#f-source-text')).toHaveValue('نسخة ثانية معدّلة');
  });

  test('a failed save never loses the text, never claims success, and recovers on retry', async ({ page }) => {
    await login(page);
    await page.locator('#f-source-text').fill('الأساس المحفوظ');
    await page.locator('#btn-save').click();
    await expect(page.locator('#save-state')).toHaveAttribute('data-state', 'saved');

    // Simulate the network dropping for every save request.
    await page.route('**/api/stories/*', (route) => (route.request().method() === 'PATCH' ? route.abort('failed') : route.continue()));
    const unsaved = 'نص جديد لم يصل إلى الخادم بعد';
    await page.locator('#f-source-text').fill(unsaved);
    await expect(page.locator('#save-state')).toHaveAttribute('data-state', 'failed', { timeout: 15_000 });
    await expect(page.locator('#save-state')).toContainText('تعذّر الحفظ');
    await expect(page.locator('#save-state')).not.toContainText('محفوظ');
    await expect(page.locator('#save-error')).toBeVisible();
    await expect(page.locator('#f-source-text')).toHaveValue(unsaved); // nothing lost
    await expect(page.locator('#btn-retry')).toBeVisible();

    // Server still holds the last confirmed version.
    const url = page.url();
    const id = url.split('/').pop();
    await page.unroute('**/api/stories/*');
    const during = await page.request.get(`/api/stories/${id}`);
    expect((await during.json()).story.sourceText).toBe('الأساس المحفوظ');

    await page.locator('#btn-retry').click();
    await expect(page.locator('#save-state')).toHaveAttribute('data-state', 'saved');
    await page.reload();
    await expect(page.locator('#f-source-text')).toHaveValue(unsaved);
  });

  test('a failed first save keeps the text and creates the draft on retry', async ({ page }) => {
    await login(page);
    await page.route('**/api/stories', (route) => (route.request().method() === 'POST' ? route.abort('failed') : route.continue()));
    const text = 'نص قبل أول حفظ ناجح';
    await page.locator('#f-source-text').fill(text);
    await page.locator('#btn-save').click();
    await expect(page.locator('#save-state')).toHaveAttribute('data-state', 'failed');
    await expect(page.locator('#f-source-text')).toHaveValue(text);
    await expect(page).toHaveURL(/\/stories\/new$/); // no draft URL was claimed
    await page.unroute('**/api/stories');
    await page.locator('#btn-retry').click();
    await expect(page.locator('#save-state')).toHaveAttribute('data-state', 'saved');
    await expect(page).toHaveURL(new RegExp(`/stories/${UUID}$`));
  });

  test('an expired session keeps the text on screen and tells the editor', async ({ page }) => {
    await login(page);
    await page.locator('#f-source-text').fill('قبل انتهاء الجلسة');
    await page.locator('#btn-save').click();
    await expect(page.locator('#save-state')).toHaveAttribute('data-state', 'saved');
    await page.route('**/api/stories/*', (route) =>
      route.request().method() === 'PATCH' ? route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthenticated"}' }) : route.continue(),
    );
    await page.locator('#f-source-text').fill('كتبته بعد انتهاء الجلسة');
    await expect(page.locator('#save-state')).toHaveAttribute('data-state', 'failed', { timeout: 15_000 });
    await expect(page.locator('#session-lost')).toBeVisible();
    await expect(page.locator('#f-source-text')).toHaveValue('كتبته بعد انتهاء الجلسة');
  });

  test('leaving through the app menu flushes pending edits instead of dropping them', async ({ page }) => {
    await login(page);
    await page.locator('#f-source-text').fill('بداية');
    await page.locator('#btn-save').click();
    await expect(page.locator('#save-state')).toHaveAttribute('data-state', 'saved');
    const id = page.url().split('/').pop();
    await page.locator('#f-source-text').fill('تعديل لم يُحفظ بالتوقيت بعد'); // debounce still pending
    await page.locator('a.nav-item', { hasText: 'خبر جديد' }).click();
    await expect(page).toHaveURL(/\/stories\/new$/);
    const res = await page.request.get(`/api/stories/${id}`);
    expect((await res.json()).story.sourceText).toBe('تعديل لم يُحفظ بالتوقيت بعد');
  });

  test('unknown draft id shows a clear not-found card', async ({ page }) => {
    await login(page);
    await page.goto('/stories/00000000-0000-4000-8000-000000000000');
    await expect(page.locator('#load-error')).toContainText('غير موجودة');
  });
});

test.describe('secure source import & manual fallback (SC-02)', () => {
  test('import failure shows friendly Arabic message and preserves manual text (SC-02)', async ({ page }) => {
    await login(page);
    const manualStory = 'تقرير ميداني عن شح المياه في الديوانية تم إدخاله يدوياً من قبل المحرر.';

    // 1) Fill URL that triggers a blocked failure (e.g. metadata or loopback IP)
    await page.locator('#f-source-url').fill('https://127.0.0.1/article');
    // Pre-fill manual text to ensure it is not lost
    await page.locator('#f-source-text').fill(manualStory);

    // 2) Click "قراءة الرابط"
    await page.locator('#btn-import').click();

    // 3) Import status alert appears with friendly message
    const alert = page.locator('#import-status');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('يمنع');

    // 4) Verify manual text is completely preserved
    await expect(page.locator('#f-source-text')).toHaveValue(manualStory);
    await expect(page.locator('#f-source-url')).toHaveValue('https://127.0.0.1/article');
  });

  test('successful import populates textarea and updates character counter', async ({ page }) => {
    await login(page);

    // Mock the backend import response to simulate successful external fetch
    await page.route('**/api/stories/*/import', (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          sourceText: 'أعلنت منظمة يونيسف في تقرير رسمي عن تفاقم شح المياه في محافظة الديوانية.',
          importMessage: 'تمت قراءة نص المادة بنجاح من المصدر.',
        }),
      });
    });

    await page.locator('#f-source-url').fill('https://ina.iq/water-crisis');
    await page.locator('#btn-import').click();

    const alert = page.locator('#import-status');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('تم');

    await expect(page.locator('#f-source-text')).toHaveValue('أعلنت منظمة يونيسف في تقرير رسمي عن تفاقم شح المياه في محافظة الديوانية.');
    await expect(page.locator('#char-counter')).not.toHaveText('0 حرف');
  });
});

test.describe('layout', () => {
  test('editor screen has no horizontal overflow, clipped controls, or placeholder buttons', async ({ page }) => {
    await login(page);
    await expectNoHorizontalOverflow(page);
    await expectControlsInsideViewport(page);
    const labels = await page.locator('button:visible').allTextContents();
    // Only real, working actions exist in this slice.
    expect(labels.map((l) => l.trim()).sort()).toEqual(['تسجيل الخروج', 'حفظ المسودة', 'قراءة الرابط'].sort());
    // Short fields must not stretch across the whole page on large screens.
    const w = await page.locator('#f-publish-date').evaluate((e) => e.getBoundingClientRect().width);
    expect(w).toBeLessThanOrEqual(300);
  });

  test('the browser bundle exposes no API key or server-only identifiers', async ({ request }) => {
    const js = await (await request.get('/app.js')).text();
    for (const needle of ['AI_API_KEY', 'SESSION_SIGNING_KEY', 'password_hash', 'sk-']) expect(js).not.toContain(needle);
  });

  test('static pages ship the security headers', async ({ request }) => {
    const res = await request.get('/login');
    const h = res.headers();
    expect(h['content-security-policy']).toContain("default-src 'self'");
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['strict-transport-security']).not.toContain('includeSubDomains');
  });
});
