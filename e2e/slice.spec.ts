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

    // 2) "New Story" screen has no drafts list; drafts are resumed from Archive.
    await page.locator('a.nav-item', { hasText: 'خبر جديد' }).click();
    await expect(page).toHaveURL(/\/stories\/new$/);
    await expect(page.locator('#f-source-text')).toHaveValue('');
    await expect(page.locator('#drafts-list')).toHaveCount(0);
    await expect(page.locator('#drafts-card')).toHaveCount(0);

    await page.locator('#nav-archive').click();
    await expect(page).toHaveURL(/\/archive$/);
    const item = page.locator('#archive-list li.draft-item', { hasText: marker });
    await expect(item).toBeVisible();
    await item.locator('a', { hasText: 'بيانات المصدر' }).click();
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
    const labels = await page.locator('button:visible:not(.ctx-clip-btn)').allTextContents();
    // Only real, working actions exist on the initial New Story screen.
    expect(labels.map((l) => l.trim()).sort()).toEqual(['+ خبر جديد', 'تسجيل الخروج', 'حفظ المسودة', 'قراءة الرابط'].sort());
    // Short fields must not stretch across the whole page on large screens.
    const w = await page.locator('#f-publish-date').evaluate((e) => e.getBoundingClientRect().width);
    expect(w).toBeLessThanOrEqual(360);
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

test.describe('full 5-screen editorial workflow, archive classification, and settings', () => {
  test('completes full journey: New Story -> Review & Edit (facts, 4 formats, blocker, approval, publish) -> Archive filters -> Settings', async ({ page }) => {
    const errors = collectErrors(page);
    await login(page);

    const uniqueTag = `NAS-FULL-${Date.now()}`;
    const sourceBody = `أعلنت وزارة الموارد المائية العراقية اليوم في بيان رسمي عن إطلاق خطة طوارئ شاملة لمعالجة شح المياه في محافظات الجنوب (${uniqueTag}) بتكلفة أولية قدرها 50 مليار دينار عراقي.`;

    // 1. New Story screen: fill source + select formats (radio, web, urgent; uncheck facebook)
    await page.locator('#f-source-name').fill('وزارة الموارد المائية');
    await page.locator('#f-category').selectOption('محلي');
    await page.locator('#f-source-lang').selectOption('العربية');
    await page.locator('#chk-fmt-facebook').uncheck();
    await page.locator('#chk-fmt-urgent').check();
    await page.locator('#f-source-text').fill(sourceBody);

    await expect(page.locator('#sufficiency-badge')).toContainText('مادة كافية');
    await expect(page.locator('#btn-proceed-review')).toBeVisible();

    // Proceed to Review & Edit
    await page.locator('#btn-proceed-review').click();
    await expect(page).toHaveURL(new RegExp(`/stories/${UUID}/review$`));

    // Verify split workspace loaded source and transitioned to قيد المراجعة
    await expect(page.locator('#review-source-name')).toContainText('وزارة الموارد المائية');
    await expect(page.locator('#review-source-body')).toContainText(uniqueTag);
    await expect(page.locator('#top-story-status')).toContainText('قيد المراجعة');

    // 2. Add manual facts
    await page.locator('#input-fact-label').fill('التكلفة الأولية');
    await page.locator('#input-fact-value').fill('50 مليار دينار عراقي');
    await page.locator('#select-fact-type').selectOption('sourced');
    await page.locator('#btn-add-fact').click();
    await expect(page.locator('#facts-list-container')).toContainText('50 مليار دينار عراقي');

    // 3. Edit headline and formats (Radio, Web, Urgent)
    await page.locator('#editor-headline-input').fill(`خطة طوارئ مائية للجنوب ${uniqueTag}`);
    await page.locator('#editor-format-textarea').fill('أعلنت وزارة الموارد المائية إطلاق خطة طوارئ شاملة لمعالجة شح المياه في الجنوب بتكلفة خمسين مليار دينار.');
    await expect(page.locator('#radio-duration-meter')).toContainText('ثانية');

    await page.locator('#tab-fmt-web').click();
    await page.locator('#editor-format-textarea').fill('تفاصيل بيان وزارة الموارد المائية حول خطة الطوارئ المائية في الجنوب.');

    await page.locator('#tab-fmt-urgent').click();
    await page.locator('#editor-format-textarea').fill('عاجل | الموارد المائية تطلق خطة طوارئ لمعالجة شح المياه في الجنوب');

    await page.locator('#btn-review-save').click();
    await expect(page.locator('#review-save-state')).toHaveAttribute('data-state', 'saved');

    // 4. Approval gates: approve button disabled before checks
    await expect(page.locator('#btn-approve-story')).toBeDisabled();
    await page.locator('#chk-verify-facts').check();
    await page.locator('#chk-verify-attribution').check();
    await expect(page.locator('#btn-approve-story')).toBeEnabled();

    // Approve story -> معتمد
    await page.locator('#btn-approve-story').click();
    await expect(page.locator('#top-story-status')).toContainText('معتمد');
    await expect(page.locator('#post-approval-publish-box')).toBeVisible();

    // Mark published -> منشور
    await page.locator('#btn-mark-published').click();
    await expect(page.locator('#top-story-status')).toContainText('منشور');

    // 5. Navigate to Archive and verify automatic multi-format classification without duplicate rows
    await page.locator('#nav-archive').click();
    await expect(page).toHaveURL(/\/archive$/);
    await expect(page.locator('#archive-list')).toContainText(uniqueTag);

    // Filter by Radio -> story appears
    await page.locator('#archive-fmt-radio').click();
    await expect(page.locator('#archive-list')).toContainText(uniqueTag);

    // Filter by Urgent -> story appears
    await page.locator('#archive-fmt-urgent').click();
    await expect(page.locator('#archive-list')).toContainText(uniqueTag);

    // Filter by Facebook (unchecked) -> story does not appear
    await page.locator('#archive-fmt-facebook').click();
    await expect(page.locator('#archive-list-host')).not.toContainText(uniqueTag);

    // 6. Navigate to Settings and verify D1 persistence + AI status
    await page.locator('#nav-settings').click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator('#setting-ai-status')).toContainText('Not Configured');
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    await page.locator('#setting-station-name').fill('إذاعة ناس 98.7 FM');
    await page.locator('#btn-save-settings').click();
    await expect(page.locator('#settings-feedback')).toContainText('تم حفظ إعدادات غرفة الأخبار');
    await expect(page.locator('#sidebar-station-name')).toContainText('إذاعة ناس 98.7 FM');

    await expectNoHorizontalOverflow(page);
    expect(errors.filter((e) => !e.includes('401'))).toEqual([]);
  });
});

test.describe('workstation UX reorganization (Fixed Shell, Contextual Copy/Paste, Smart Date, Icons)', () => {
  test('Smart Date Input pre-fills local today date on new story and preserves saved date on existing story', async ({ page }) => {
    await login(page);
    const localToday = await page.evaluate(() => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    });
    await expect(page.locator('#f-publish-date')).toHaveValue(localToday);

    // Save with custom date and verify it is not overwritten on reload
    await page.locator('#f-publish-date').fill('2025-12-31');
    await page.locator('#f-source-name').fill('مصدر التاريخ');
    await page.locator('#f-source-text').fill('نص خبر لاختبار حفظ التاريخ المخصص وعدم استبداله عند إعادة التحميل.');
    await page.locator('#btn-save').click();
    await expect(page.locator('#save-state')).toHaveAttribute('data-state', 'saved');

    await page.reload();
    await expect(page.locator('#f-publish-date')).toHaveValue('2025-12-31');
  });

  test('Contextual Copy/Paste controls appear on focus/hover and exclude select/date inputs', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await login(page);

    // Select and Date fields must NOT be wrapped with contextual clipboard bars
    const selectHasClip = await page.locator('#f-category').evaluate((el) => Boolean(el.closest('.field-clip-wrap')));
    const dateHasClip = await page.locator('#f-publish-date').evaluate((el) => Boolean(el.closest('.field-clip-wrap')));
    expect(selectHasClip).toBe(false);
    expect(dateHasClip).toBe(false);

    // URL field: when empty, only "لصق رابط" is visible (copy button is hidden)
    const urlCopyBtn = page.locator('[data-clip-copy="f-source-url"]');
    const urlPasteBtn = page.locator('[data-clip-paste="f-source-url"]');
    await expect(urlCopyBtn).toBeHidden();
    await expect(urlPasteBtn).not.toBeHidden();

    // Write to clipboard and click "لصق رابط"
    await page.evaluate(() => navigator.clipboard.writeText('https://example.org/pasted-url'));
    await page.locator('#f-source-url').focus();
    await urlPasteBtn.click({ force: true });
    await expect(page.locator('#f-source-url')).toHaveValue('https://example.org/pasted-url');
    await expect(urlCopyBtn).not.toBeHidden();

    // Source text copy & paste
    await page.locator('#f-source-name').fill('وكالة الأنباء');
    const sampleText = 'نص طويل بما يكفي لتجاوز خمسين حرفاً واختبار أزرار النسخ واللصق السياقية في مساحة العمل.';
    await page.locator('#f-source-text').fill(sampleText);
    await page.locator('#f-source-text').focus();
    await page.locator('[data-clip-copy="f-source-text"]').click({ force: true });
    await expect(page.locator('[data-clip-feedback="f-source-text"]')).toContainText('تم النسخ');

    // Navigate to Review & Edit and verify read-only source box has Copy only
    await page.locator('#btn-proceed-review').click();
    await expect(page).toHaveURL(new RegExp(`/stories/${UUID}/review$`));
    await expect(page.locator('[data-clip-copy="review-source-body"]')).toHaveCount(1);
    await expect(page.locator('[data-clip-paste="review-source-body"]')).toHaveCount(0);
    await expect(page.locator('[data-clip-copy="editor-headline-input"]')).toHaveCount(1);
    await expect(page.locator('[data-clip-paste="editor-headline-input"]')).toHaveCount(1);
    await expect(page.locator('[data-clip-copy="editor-format-textarea"]')).toHaveCount(1);
    await expect(page.locator('[data-clip-paste="editor-format-textarea"]')).toHaveCount(1);
  });

  test('Desktop Fixed Shell (1920x1080, 1440x900, 1366x768) has zero page scroll, zero sidebar scroll, and zero broken icons; Mobile (390x844, 360x800) has zero horizontal overflow', async ({ page }) => {
    await login(page);
    await page.locator('#f-source-name').fill('وكالة الأنباء العراقية');
    await page.locator('#f-source-text').fill('نص تجريبي لفحص ثبات الغلاف الهندسي وعدم وجود تمرير خارجي على أجهزة سطح المكتب في جميع الشاشات الخمس.');
    await page.locator('#btn-proceed-review').click();
    await expect(page).toHaveURL(new RegExp(`/stories/${UUID}/review$`));
    const reviewPath = new URL(page.url()).pathname;

    const desktopSizes = [
      { width: 1920, height: 1080 },
      { width: 1440, height: 900 },
      { width: 1366, height: 768 },
    ];
    const routes = ['/stories/new', reviewPath, '/archive', '/settings'];

    for (const size of desktopSizes) {
      await page.setViewportSize(size);
      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator('.sidebar')).toBeVisible();
        const metrics = await page.evaluate(async () => {
          const allImgs = Array.from(document.querySelectorAll('img'));
          await Promise.all(
            allImgs.map((img) =>
              img.complete
                ? Promise.resolve()
                : new Promise<void>((resolve) => {
                    img.addEventListener('load', () => resolve(), { once: true });
                    img.addEventListener('error', () => resolve(), { once: true });
                  }),
            ),
          );
          const doc = document.documentElement;
          const sidebar = document.querySelector('.sidebar') as HTMLElement;
          const logoutBtn = document.querySelector('#btn-logout') as HTMLElement;
          const fmtTextarea = document.querySelector('#editor-format-textarea') as HTMLElement | null;
          const hintRow = document.querySelector('.format-hint-row') as HTMLElement | null;
          const approvalCard = document.querySelector('#card-approval') as HTMLElement | null;
          const imgs = allImgs.map((img) => ({
            src: img.getAttribute('src'),
            loaded: img.complete && img.naturalWidth > 0,
          }));
          return {
            docScrollH: doc.scrollHeight,
            winH: window.innerHeight,
            docScrollW: doc.scrollWidth,
            winW: window.innerWidth,
            sidebarScrollH: sidebar.scrollHeight,
            sidebarClientH: sidebar.clientHeight,
            logoutBottom: logoutBtn.getBoundingClientRect().bottom,
            textareaBottom: fmtTextarea ? fmtTextarea.getBoundingClientRect().bottom : 0,
            hintRowTop: hintRow ? hintRow.getBoundingClientRect().top : 9999,
            approvalBottom: approvalCard ? approvalCard.getBoundingClientRect().bottom : 0,
            brokenImgs: imgs.filter((i) => !i.loaded),
          };
        });
        expect(metrics.docScrollH, `Desktop ${size.width}x${size.height} ${route} vertical scroll`).toBeLessThanOrEqual(metrics.winH);
        expect(metrics.docScrollW, `Desktop ${size.width}x${size.height} ${route} horizontal scroll`).toBeLessThanOrEqual(metrics.winW);
        expect(metrics.sidebarScrollH, `Desktop ${size.width}x${size.height} ${route} sidebar scroll`).toBeLessThanOrEqual(metrics.sidebarClientH);
        expect(metrics.logoutBottom, `Desktop ${size.width}x${size.height} ${route} #btn-logout inside viewport`).toBeLessThanOrEqual(metrics.winH);
        expect(metrics.textareaBottom, `Desktop ${size.width}x${size.height} ${route} textarea no overlap with hint row`).toBeLessThanOrEqual(metrics.hintRowTop + 1);
        expect(metrics.approvalBottom, `Desktop ${size.width}x${size.height} ${route} #card-approval inside viewport`).toBeLessThanOrEqual(metrics.winH);
        expect(metrics.brokenImgs, `Desktop ${size.width}x${size.height} ${route} broken images`).toEqual([]);
      }
    }

    const mobileSizes = [
      { width: 390, height: 844 },
      { width: 360, height: 800 },
    ];
    for (const size of mobileSizes) {
      await page.setViewportSize(size);
      for (const route of routes) {
        await page.goto(route);
        await expectNoHorizontalOverflow(page);
      }
    }
  });
});
