import { describe, expect, it } from 'vitest';
import { api, createDraft, loginCookie } from './helpers';

const SUFFICIENT_TEXT =
  'أعلنت وزارة الموارد المائية العراقية اليوم عن خطة طوارئ جديدة لمعالجة شح المياه في محافظات الفرات الأوسط والجنوب.';

describe('Editorial workspace: facts, 4 formats, and human approval workflow', () => {
  it('saves and restores headline, 4 formats, selectedFormats, and manual facts', async () => {
    const cookie = await loginCookie();
    const { id } = await createDraft(cookie, {
      sourceName: 'وكالة الأنباء العراقية',
      sourceText: SUFFICIENT_TEXT,
    });

    const patchRes = await api(`/api/stories/${id}`, {
      method: 'PATCH',
      cookie,
      body: {
        headline: 'خطة طوارئ لمعالجة شح المياه',
        selectedFormats: ['radio', 'web'],
        formats: {
          radio: 'أعلنت وزارة الموارد المائية عن خطة طوارئ لمعالجة شح المياه في الجنوب.',
          web: 'تفاصيل خطة وزارة الموارد المائية لمعالجة أزمة المياه في الفرات الأوسط.',
          facebook: 'الموارد المائية تطلق خطة طوارئ لمواجهة الجفاف.',
          urgent: 'عاجل | خطة طوارئ مائية في محافظات الجنوب',
        },
        facts: [
          { label: 'الجهة المعلنة', value: 'وزارة الموارد المائية', status: 'مؤكد في المصدر', type: 'sourced' },
          { label: 'الميزانية المخصصة', value: 'غير مذكور في المصدر', status: 'معلومة ناقصة', type: 'missing' },
        ],
      },
    });

    expect(patchRes.status).toBe(200);
    const { story } = await patchRes.json<{ story: Record<string, unknown> }>();
    expect(story.headline).toBe('خطة طوارئ لمعالجة شح المياه');
    expect(story.selectedFormats).toEqual(['radio', 'web']);
    expect(story.urgentEnabled).toBe(false);
    expect((story.formats as Record<string, string>).radio).toContain('خطة طوارئ');
    expect((story.formats as Record<string, string>).web).toContain('تفاصيل خطة');
    expect((story.facts as unknown[]).length).toBe(2);
    expect(story.hasBlocker).toBe(false);
  });

  it('enforces all 5 human approval conditions and resets checks after substantive edit or blocker resolution', async () => {
    const cookie = await loginCookie();
    const { id } = await createDraft(cookie, {
      sourceName: 'يونيسف العراق',
      sourceText: SUFFICIENT_TEXT,
    });

    // 1. Cannot approve while still in مسودة
    const earlyApprove = await api(`/api/stories/${id}/approve`, { method: 'POST', cookie });
    expect(earlyApprove.status).toBe(422);

    // 2. Transition مسودة -> قيد المراجعة
    const startRes = await api(`/api/stories/${id}/start-review`, { method: 'POST', cookie });
    expect(startRes.status).toBe(200);
    expect((await startRes.json<{ story: { status: string } }>()).story.status).toBe('قيد المراجعة');

    // 3. Cannot approve without both human verification checkboxes
    const noChecksApprove = await api(`/api/stories/${id}/approve`, { method: 'POST', cookie });
    expect(noChecksApprove.status).toBe(422);

    // 4. Set both human verification checks
    const checksRes = await api(`/api/stories/${id}/checks`, {
      method: 'POST',
      cookie,
      body: { factsVerified: true, attributionVerified: true },
    });
    expect(checksRes.status).toBe(200);
    expect((await checksRes.json<{ story: { checks: { factsVerified: boolean; attributionVerified: boolean } } }>()).story.checks).toEqual({
      factsVerified: true,
      attributionVerified: true,
    });

    // 5. Substantive edit to formats resets both verification checkboxes to false
    const editRes = await api(`/api/stories/${id}`, {
      method: 'PATCH',
      cookie,
      body: { formats: { radio: 'نص إذاعي محدّث بعد التحقق' } },
    });
    expect(editRes.status).toBe(200);
    expect((await editRes.json<{ story: { checks: { factsVerified: boolean; attributionVerified: boolean } } }>()).story.checks).toEqual({
      factsVerified: false,
      attributionVerified: false,
    });

    // 6. Flagging a blocker blocks approval even if checks are re-enabled
    await api(`/api/stories/${id}`, {
      method: 'PATCH',
      cookie,
      body: { hasBlocker: true, blockerReason: 'نسبة 40% غير مسندة لجهة رسمية' },
    });
    await api(`/api/stories/${id}/checks`, {
      method: 'POST',
      cookie,
      body: { factsVerified: true, attributionVerified: true },
    });
    const blockedApprove = await api(`/api/stories/${id}/approve`, { method: 'POST', cookie });
    expect(blockedApprove.status).toBe(422);

    // 7. Resolving blocker clears hasBlocker and resets checks so editor must re-verify
    const resolveRes = await api(`/api/stories/${id}/resolve-blocker`, {
      method: 'POST',
      cookie,
      body: { note: 'تم حذف النسبة غير المسندة' },
    });
    expect(resolveRes.status).toBe(200);
    const resolvedStory = (await resolveRes.json<{ story: { hasBlocker: boolean; checks: { factsVerified: boolean; attributionVerified: boolean } } }>()).story;
    expect(resolvedStory.hasBlocker).toBe(false);
    expect(resolvedStory.checks).toEqual({ factsVerified: false, attributionVerified: false });

    // 8. Re-verify checks and approve -> معتمد
    await api(`/api/stories/${id}/checks`, {
      method: 'POST',
      cookie,
      body: { factsVerified: true, attributionVerified: true },
    });
    const approveRes = await api(`/api/stories/${id}/approve`, { method: 'POST', cookie });
    expect(approveRes.status).toBe(200);
    const approvedStory = (await approveRes.json<{ story: { status: string; approvedAt: string } }>()).story;
    expect(approvedStory.status).toBe('معتمد');
    expect(approvedStory.approvedAt).toBeTruthy();

    // 9. Mark published -> منشور
    const publishRes = await api(`/api/stories/${id}/publish`, { method: 'POST', cookie });
    expect(publishRes.status).toBe(200);
    const publishedStory = (await publishRes.json<{ story: { status: string; publishedAt: string } }>()).story;
    expect(publishedStory.status).toBe('منشور');
    expect(publishedStory.publishedAt).toBeTruthy();
  });

  it('excludes a story with a required reason', async () => {
    const cookie = await loginCookie();
    const { id } = await createDraft(cookie, { sourceName: 'مصدر غير موثق', sourceText: 'خبر قصير' });

    const missingReason = await api(`/api/stories/${id}/exclude`, { method: 'POST', cookie, body: { reason: '' } });
    expect(missingReason.status).toBe(400);

    const exRes = await api(`/api/stories/${id}/exclude`, {
      method: 'POST',
      cookie,
      body: { reason: 'المصدر غير رسمي ولا يمكن التحقق من صحته' },
    });
    expect(exRes.status).toBe(200);
    const excluded = (await exRes.json<{ story: { status: string; excludeReason: string } }>()).story;
    expect(excluded.status).toBe('مستبعد');
    expect(excluded.excludeReason).toBe('المصدر غير رسمي ولا يمكن التحقق من صحته');
  });
});

describe('Automatic multi-format archive classification without duplicate rows', () => {
  it('classifies a multi-format story across Radio, Web, Facebook, and Urgent filters with a single DB record', async () => {
    const cookie = await loginCookie();
    const { id } = await createDraft(cookie, {
      sourceName: 'وكالة الأنباء العراقية',
      category: 'اقتصادي',
      sourceText: SUFFICIENT_TEXT,
      headline: 'تقرير اقتصادي مشترك للإذاعة والموقع',
      selectedFormats: ['radio', 'web'],
    });

    const allRes = await (await api('/api/stories', { cookie })).json<{
      stories: { id: string }[];
      counts: { total: number; byFormat: Record<string, number> };
    }>();
    expect(allRes.counts.total).toBe(1);
    expect(allRes.counts.byFormat.radio).toBe(1);
    expect(allRes.counts.byFormat.web).toBe(1);
    expect(allRes.counts.byFormat.facebook).toBe(0);
    expect(allRes.counts.byFormat.urgent).toBe(0);

    const radioList = await (await api('/api/stories?format=radio', { cookie })).json<{ stories: { id: string }[] }>();
    expect(radioList.stories.map((s) => s.id)).toEqual([id]);

    const webList = await (await api('/api/stories?format=web', { cookie })).json<{ stories: { id: string }[] }>();
    expect(webList.stories.map((s) => s.id)).toEqual([id]);

    const fbList = await (await api('/api/stories?format=facebook', { cookie })).json<{ stories: { id: string }[] }>();
    expect(fbList.stories).toHaveLength(0);

    // Enable urgent -> appears in urgent filter too, still 1 total story in DB
    await api(`/api/stories/${id}`, {
      method: 'PATCH',
      cookie,
      body: { urgentEnabled: true },
    });

    const urgentList = await (await api('/api/stories?format=urgent', { cookie })).json<{
      stories: { id: string }[];
      counts: { total: number; byFormat: Record<string, number> };
    }>();
    expect(urgentList.stories.map((s) => s.id)).toEqual([id]);
    expect(urgentList.counts.total).toBe(1);
    expect(urgentList.counts.byFormat.urgent).toBe(1);

    // Search & category filter
    const qMatch = await (await api('/api/stories?q=اقتصادي&category=اقتصادي', { cookie })).json<{ stories: { id: string }[] }>();
    expect(qMatch.stories.map((s) => s.id)).toEqual([id]);

    const qMiss = await (await api('/api/stories?q=رياضة', { cookie })).json<{ stories: { id: string }[] }>();
    expect(qMiss.stories).toHaveLength(0);
  });
});

describe('Settings API (/api/settings)', () => {
  it('reads and updates editorial settings in D1 without exposing AI_API_KEY', async () => {
    const cookie = await loginCookie();
    const getRes = await api('/api/settings', { cookie });
    expect(getRes.status).toBe(200);
    const initial = (await getRes.json<{ settings: { stationName: string; aiConfigured: boolean } }>()).settings;
    expect(initial.stationName).toBe('NAS FM — إذاعة ناس');

    const putRes = await api('/api/settings', {
      method: 'PUT',
      cookie,
      body: {
        stationName: 'إذاعة ناس 98.7 FM — بغداد',
        editorialStyle: 'موجز تحليلي موثق بالمصادر',
        radioLength: '30–45 ثانية (65–100 كلمة)',
        modelProvider: 'anthropic',
        modelName: 'claude-sonnet-4-20250514',
      },
    });
    expect(putRes.status).toBe(200);
    const updatedText = await putRes.clone().text();
    expect(updatedText).not.toContain('canary');
    const updated = (await putRes.json<{ settings: Record<string, unknown> }>()).settings;
    expect(updated.stationName).toBe('إذاعة ناس 98.7 FM — بغداد');
    expect(updated.editorialStyle).toBe('موجز تحليلي موثق بالمصادر');
  });
});
