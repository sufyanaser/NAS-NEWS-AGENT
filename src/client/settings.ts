/** Settings screen ("الإعدادات") backed by D1 settings table without exposing AI secrets. */
import type { AIModelCatalogItemDto, AIProviderId, AIProviderStatusDto, SettingsDto } from '../shared/contracts';
import { ApiError, api } from './api';
import { clear, h } from './dom';
import type { EditorHandle } from './editor';

export interface SettingsOptions {
  onSessionLost: () => void;
  onSettingsSaved?: (settings: SettingsDto) => void;
}

const EDITORIAL_STYLES = [
  'إخباري إذاعي رصين ومباشر',
  'موجز تحليلي موثق بالمصادر',
  'تغطية ميدانية سريعة ومختصرة',
];

const RADIO_LENGTHS = [
  '20–40 ثانية (45–90 كلمة)',
  '30–45 ثانية (65–100 كلمة)',
  '15–25 ثانية (35–55 كلمة — موجز سريع)',
];

const MODEL_PROVIDERS: { value: AIProviderId; label: string }[] = [
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openai', label: 'OpenAI GPT' },
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'openrouter', label: 'OpenRouter' },
];

const FALLBACK_MODELS: AIModelCatalogItemDto[] = [
  {
    id: 'gemini-2.5-flash',
    provider: 'gemini',
    label: 'Gemini 2.5 Flash (موصى به — متوازن وسريع)',
    tier: 'free',
    pricing: {
      inputPerMillionUsd: 0.15,
      outputPerMillionUsd: 0.6,
      isFreeTier: true,
      pricingNote:
        'متاح ضمن الطبقة المجانية في Google AI Studio (مع حدود استخدام يومية) أو 0.15$ / 0.60$ لكل مليون توكن في الطبقة المدفوعة',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'الاستخراج التحريري اليومي والصياغة الإذاعية السريعة',
    available: true,
  },
  {
    id: 'gemini-2.5-flash-lite',
    provider: 'gemini',
    label: 'Gemini 2.5 Flash-Lite (اقتصادي فائق السرعة)',
    tier: 'free',
    pricing: {
      inputPerMillionUsd: 0.075,
      outputPerMillionUsd: 0.3,
      isFreeTier: true,
      pricingNote:
        'متاح مجاناً في Google AI Studio ضمن حدود الاستخدام أو بتكلفة منخفضة جداً 0.075$ / 0.30$ لكل مليون توكن',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'الأخبار القصيرة والمعالجة السريعة منخفضة التكلفة',
    available: true,
  },
  {
    id: 'gemini-2.5-pro',
    provider: 'gemini',
    label: 'Gemini 2.5 Pro (تحليل معمق)',
    tier: 'paid',
    pricing: {
      inputPerMillionUsd: 1.25,
      outputPerMillionUsd: 10.0,
      isFreeTier: false,
      pricingNote:
        '1.25$ للمدخلات / 10.00$ للمخرجات لكل مليون توكن (وتتوفر حصة تجريبية محدودة في AI Studio)',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'التقارير المركبة والترجمة التحريرية الدقيقة من الإنجليزية',
    available: true,
  },
  {
    id: 'gpt-4.1-mini',
    provider: 'openai',
    label: 'GPT-4.1 Mini (سريع ومتوازن التكلفة)',
    tier: 'paid',
    pricing: {
      inputPerMillionUsd: 0.4,
      outputPerMillionUsd: 1.6,
      isFreeTier: false,
      pricingNote:
        'مدفوع حسب الاستخدام: 0.40$ للمدخلات / 1.60$ للمخرجات لكل مليون توكن (لا توجد طبقة مجانية دائمة في OpenAI API)',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'الصياغة الإخبارية السريعة والالتزام الصارم بمخطط JSON',
    available: true,
  },
  {
    id: 'gpt-4.1',
    provider: 'openai',
    label: 'GPT-4.1 (دقة تحريرية عالية)',
    tier: 'paid',
    pricing: {
      inputPerMillionUsd: 2.0,
      outputPerMillionUsd: 8.0,
      isFreeTier: false,
      pricingNote: 'مدفوع حسب الاستخدام: 2.00$ للمدخلات / 8.00$ للمخرجات لكل مليون توكن',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'التحرير الإذاعي المتقدم ومطابقة الإسناد الصارمة',
    available: true,
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    label: 'GPT-4o Mini (اقتصادي)',
    tier: 'paid',
    pricing: {
      inputPerMillionUsd: 0.15,
      outputPerMillionUsd: 0.6,
      isFreeTier: false,
      pricingNote: 'مدفوع حسب الاستخدام: 0.15$ للمدخلات / 0.60$ للمخرجات لكل مليون توكن',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'المعالجة الاقتصادية السريعة',
    available: true,
  },
  {
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    label: 'Claude Sonnet 4 (جودة لغوية عربية ممتازة)',
    tier: 'paid',
    pricing: {
      inputPerMillionUsd: 3.0,
      outputPerMillionUsd: 15.0,
      isFreeTier: false,
      pricingNote:
        'مدفوع حسب الاستخدام: 3.00$ للمدخلات / 15.00$ للمخرجات لكل مليون توكن (لا توجد طبقة مجانية في Anthropic API)',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'الصياغة العربية الرصينة وتحليل المصادر الطويلة',
    available: true,
  },
  {
    id: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    label: 'Claude 3.5 Haiku (سريع واقتصادي)',
    tier: 'paid',
    pricing: {
      inputPerMillionUsd: 0.8,
      outputPerMillionUsd: 4.0,
      isFreeTier: false,
      pricingNote: 'مدفوع حسب الاستخدام: 0.80$ للمدخلات / 4.00$ للمخرجات لكل مليون توكن',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'الاستخراج السريع للمسودات اليومية',
    available: true,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    provider: 'openrouter',
    label: 'Llama 3.3 70B Instruct (مجاني عبر OpenRouter)',
    tier: 'free',
    pricing: {
      inputPerMillionUsd: 0,
      outputPerMillionUsd: 0,
      isFreeTier: true,
      pricingNote:
        'مجاني (0.00$) عبر OpenRouter مع حدود معدل طلبات (Rate Limits) تخضع لتوافر المزود',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'التجربة المجانية والتوليد الاحتياطي',
    available: true,
  },
  {
    id: 'google/gemini-2.0-flash-exp:free',
    provider: 'openrouter',
    label: 'Gemini 2.0 Flash Exp (مجاني عبر OpenRouter)',
    tier: 'free',
    pricing: {
      inputPerMillionUsd: 0,
      outputPerMillionUsd: 0,
      isFreeTier: true,
      pricingNote: 'مجاني (0.00$) عبر OpenRouter ضمن حدود الاستخدام التجريبية',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'التوليد السريع المجاني عبر بوابة موحدة',
    available: true,
  },
  {
    id: 'qwen/qwen-2.5-72b-instruct:free',
    provider: 'openrouter',
    label: 'Qwen 2.5 72B Instruct (مجاني — داعم للعربية)',
    tier: 'free',
    pricing: {
      inputPerMillionUsd: 0,
      outputPerMillionUsd: 0,
      isFreeTier: true,
      pricingNote: 'مجاني (0.00$) عبر OpenRouter ضمن حدود الطلبات اليومية',
      verifiedAt: '2026-10-11',
    },
    recommendedFor: 'المعالجة العربية متعددة الصيغ بدون تكلفة',
    available: true,
  },
];

function normalizeProviderId(raw?: string | null): AIProviderId {
  if (!raw) return 'gemini';
  const norm = raw.trim().toLowerCase();
  if (norm === 'openrouter' || norm.includes('openrouter')) return 'openrouter';
  if (norm === 'openai' || norm.includes('openai')) return 'openai';
  if (norm === 'anthropic' || norm.includes('anthropic') || norm.includes('claude')) return 'anthropic';
  if (norm === 'gemini' || norm === 'google' || norm.includes('gemini') || norm.includes('google')) return 'gemini';
  return 'gemini';
}

export function mountSettings(container: HTMLElement, opts: SettingsOptions): EditorHandle {
  let disposed = false;
  let dirty = false;
  let providersCatalog: AIProviderStatusDto[] = MODEL_PROVIDERS.map((p) => ({
    provider: p.value,
    label: p.label,
    configured: false,
    models: FALLBACK_MODELS.filter((m) => m.provider === p.value),
  }));
  let globalAiConfigured = false;

  const stationInput = h('input', {
    id: 'setting-station-name',
    class: 'input',
    type: 'text',
    maxlength: '200',
    value: 'NAS FM — إذاعة ناس',
    placeholder: 'إذاعة ناس 98.7 FM',
  });

  const styleSelect = h(
    'select',
    { id: 'setting-editorial-style', class: 'select' },
    ...EDITORIAL_STYLES.map((s) => h('option', { value: s }, s)),
  );

  const lengthSelect = h(
    'select',
    { id: 'setting-radio-length', class: 'select' },
    ...RADIO_LENGTHS.map((l) => h('option', { value: l }, l)),
  );

  const providerSelect = h(
    'select',
    { id: 'setting-model-provider', class: 'select' },
    ...MODEL_PROVIDERS.map((p) => h('option', { value: p.value }, p.label)),
  );

  const modelSelect = h('select', {
    id: 'setting-model-name',
    class: 'select ltr',
  });

  const pricingNoteEl = h(
    'div',
    { id: 'setting-model-pricing-note', class: 'note' },
    '',
  );

  const aiStatusBadge = h(
    'span',
    { id: 'setting-ai-status', class: 'badge', 'data-status': 'قيد المراجعة' },
    'غير متصل — Not Configured',
  );

  const feedbackBox = h('div', { id: 'settings-feedback', class: 'alert', role: 'status', hidden: true });
  const testModelBtn = h(
    'button',
    { type: 'button', id: 'btn-test-model', class: 'btn' },
    'اختبار الاتصال بالمزود',
  );
  const saveBtn = h('button', { type: 'submit', id: 'btn-save-settings', class: 'btn btn-primary' }, 'حفظ الإعدادات');

  function getModelsForProvider(providerId: AIProviderId): AIModelCatalogItemDto[] {
    const found = providersCatalog.find((p) => p.provider === providerId);
    if (found && found.models.length > 0) return found.models;
    return FALLBACK_MODELS.filter((m) => m.provider === providerId);
  }

  function isSelectedProviderConfigured(providerId: AIProviderId): boolean {
    const found = providersCatalog.find((p) => p.provider === providerId);
    if (found) return found.configured;
    return globalAiConfigured;
  }

  function updateStatusBadge(providerId: AIProviderId): void {
    if (isSelectedProviderConfigured(providerId)) {
      aiStatusBadge.textContent = 'متصل ومُعدّ — Configured';
      aiStatusBadge.dataset.status = 'معتمد';
    } else {
      aiStatusBadge.textContent = 'غير متصل — Not Configured';
      aiStatusBadge.dataset.status = 'قيد المراجعة';
    }
  }

  function updatePricingNote(providerId: AIProviderId, modelId: string): void {
    const models = getModelsForProvider(providerId);
    const item = models.find((m) => m.id === modelId) ?? FALLBACK_MODELS.find((m) => m.id === modelId);
    if (!item) {
      pricingNoteEl.textContent = `النموذج المحدد: ${modelId}`;
      return;
    }
    const tierLabel = item.tier === 'free' || item.pricing.isFreeTier ? 'مجاني — Free Tier' : 'مدفوع — Paid';
    pricingNoteEl.textContent = `[${tierLabel}] ${item.pricing.pricingNote} — الاستخدام الموصى به: ${item.recommendedFor}.`;
  }

  function populateModelOptions(providerId: AIProviderId, preferredModel?: string): void {
    clear(modelSelect);
    const models = getModelsForProvider(providerId);
    for (const m of models) {
      const tierTag = m.tier === 'free' || m.pricing.isFreeTier ? ' [مجاني]' : ' [مدفوع]';
      modelSelect.append(h('option', { value: m.id }, `${m.label}${tierTag} — (${m.id})`));
    }
    const target = preferredModel?.trim();
    if (target) {
      const existsInProvider = models.some((m) => m.id === target);
      if (!existsInProvider) {
        modelSelect.append(h('option', { value: target }, target));
      }
      modelSelect.value = target;
    } else if (models[0]) {
      modelSelect.value = models[0].id;
    }
    updateStatusBadge(providerId);
    updatePricingNote(providerId, modelSelect.value);
  }

  // Initial population with default provider
  populateModelOptions('gemini', 'gemini-2.5-flash');

  function applySettings(s: SettingsDto): void {
    stationInput.value = s.stationName;
    if (s.editorialStyle && !EDITORIAL_STYLES.includes(s.editorialStyle)) {
      styleSelect.append(h('option', { value: s.editorialStyle }, s.editorialStyle));
    }
    if (s.editorialStyle) styleSelect.value = s.editorialStyle;

    if (s.radioLength && !RADIO_LENGTHS.includes(s.radioLength)) {
      lengthSelect.append(h('option', { value: s.radioLength }, s.radioLength));
    }
    if (s.radioLength) lengthSelect.value = s.radioLength;

    if (s.providers && s.providers.length > 0) {
      providersCatalog = s.providers;
    }
    globalAiConfigured = Boolean(s.aiConfigured);

    const prov = normalizeProviderId(s.modelProvider);
    providerSelect.value = prov;
    populateModelOptions(prov, s.modelName);
    dirty = false;
  }

  async function saveSettings(): Promise<boolean> {
    feedbackBox.hidden = true;
    saveBtn.disabled = true;
    try {
      const res = await api.putSettings({
        stationName: stationInput.value.trim() || 'إذاعة ناس',
        editorialStyle: styleSelect.value || EDITORIAL_STYLES[0],
        radioLength: lengthSelect.value || RADIO_LENGTHS[0],
        modelProvider: providerSelect.value || 'gemini',
        modelName: modelSelect.value || 'gemini-2.5-flash',
      });
      if (disposed) return true;
      applySettings(res.settings);
      opts.onSettingsSaved?.(res.settings);
      feedbackBox.className = 'alert alert-info';
      feedbackBox.textContent = 'تم حفظ إعدادات غرفة الأخبار في قاعدة البيانات بنجاح.';
      feedbackBox.hidden = false;
      return true;
    } catch (err) {
      if (disposed) return false;
      if (err instanceof ApiError && err.isUnauthenticated) {
        opts.onSessionLost();
        return false;
      }
      feedbackBox.className = 'alert alert-danger';
      feedbackBox.textContent = 'تعذّر حفظ الإعدادات. تحقق من القيم والاتصال ثم أعد المحاولة.';
      feedbackBox.hidden = false;
      return false;
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function handleTestModel(): Promise<void> {
    feedbackBox.hidden = true;
    testModelBtn.disabled = true;
    const oldText = testModelBtn.textContent;
    testModelBtn.textContent = 'جارٍ الاختبار…';
    try {
      const res = await api.testModel({
        provider: providerSelect.value,
        model: modelSelect.value,
      });
      if (disposed) return;
      if (res.ok && res.connected) {
        feedbackBox.className = 'alert alert-info';
        feedbackBox.textContent = `${res.message} (${res.latencyMs}ms)`;
        feedbackBox.hidden = false;
        aiStatusBadge.textContent = 'متصل ومختبر — Connected';
        aiStatusBadge.dataset.status = 'معتمد';
      } else {
        feedbackBox.className = res.errorClass === 'not_configured' ? 'alert alert-warn' : 'alert alert-danger';
        feedbackBox.textContent = res.message || 'تعذّر الاتصال بمزود الذكاء الاصطناعي.';
        feedbackBox.hidden = false;
        updateStatusBadge(normalizeProviderId(providerSelect.value));
      }
    } catch (err) {
      if (disposed) return;
      if (err instanceof ApiError && err.isUnauthenticated) {
        opts.onSessionLost();
        return;
      }
      const msg =
        err instanceof ApiError
          ? ((err.detail as { message?: string } | null)?.message ?? 'تعذّر اختبار الاتصال بالمزود حالياً.')
          : 'تعذّر اختبار الاتصال بالمزود حالياً.';
      feedbackBox.className = 'alert alert-warn';
      feedbackBox.textContent = msg;
      feedbackBox.hidden = false;
    } finally {
      if (!disposed) {
        testModelBtn.disabled = false;
        testModelBtn.textContent = oldText;
      }
    }
  }

  testModelBtn.addEventListener('click', () => void handleTestModel());

  providerSelect.addEventListener('change', () => {
    dirty = true;
    const prov = normalizeProviderId(providerSelect.value);
    populateModelOptions(prov);
  });

  modelSelect.addEventListener('change', () => {
    dirty = true;
    const prov = normalizeProviderId(providerSelect.value);
    updatePricingNote(prov, modelSelect.value);
  });

  for (const el of [stationInput, styleSelect, lengthSelect]) {
    el.addEventListener('input', () => {
      dirty = true;
    });
    el.addEventListener('change', () => {
      dirty = true;
    });
  }

  const form = h(
    'form',
    {
      class: 'stack',
      onSubmit: (e: Event) => {
        e.preventDefault();
        void saveSettings();
      },
    },
    feedbackBox,
    h(
      'article',
      { class: 'card' },
      h(
        'div',
        { class: 'card-head' },
        h(
          'div',
          {},
          h(
            'div',
            { class: 'title-with-icon' },
            h('img', { src: '/assets/icons/nav-settings.png', alt: '', class: 'section-icon', width: '24', height: '24' }),
            h('h2', { class: 'card-title' }, 'الإعدادات التحريرية للمحطة'),
          ),
          h('p', { class: 'card-sub' }, 'تُحفظ هذه التفضيلات في قاعدة بيانات D1 وتُطبّق على مساحة العمل التحريرية.'),
        ),
      ),
      h(
        'div',
        { class: 'grid-meta' },
        h(
          'div',
          { class: 'field' },
          h('label', { class: 'label', for: 'setting-station-name' }, 'اسم المحطة / المؤسسة الإخبارية'),
          stationInput,
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { class: 'label', for: 'setting-editorial-style' }, 'الأسلوب التحريري المعتمد'),
          styleSelect,
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { class: 'label', for: 'setting-radio-length' }, 'المدة المستهدفة للموجز الإذاعي'),
          lengthSelect,
        ),
      ),
    ),
    h(
      'article',
      { class: 'card' },
      h(
        'div',
        { class: 'card-head' },
        h(
          'div',
          {},
          h(
            'div',
            { class: 'title-with-icon' },
            h('img', { src: '/assets/icons/tool-ai.png', alt: '', class: 'section-icon', width: '24', height: '24' }),
            h('h2', { class: 'card-title' }, 'إعدادات نموذج الذكاء الاصطناعي والمزودين'),
          ),
          h('p', { class: 'card-sub' }, 'تُضبط تفضيلات المزود والنموذج هنا؛ بينما يُدار مفتاح الربط السري حصرياً عبر خادم Cloudflare ولا يُطلب أو يُعرض في المتصفح أبداً.'),
        ),
        aiStatusBadge,
      ),
      h(
        'div',
        { class: 'grid-meta' },
        h(
          'div',
          { class: 'field' },
          h('label', { class: 'label', for: 'setting-model-provider' }, 'مزود النموذج (Model Provider)'),
          providerSelect,
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { class: 'label', for: 'setting-model-name' }, 'معرّف النموذج (Model Identifier)'),
          modelSelect,
        ),
      ),
      pricingNoteEl,
      h(
        'div',
        { class: 'alert alert-info compact-alert' },
        'ملاحظة أمان: لا توجد خانة لإدخال مفتاح API في المتصفح. تُربط مفاتيح المزودين حصرياً في بيئة Worker الخلفية.',
      ),
      h(
        'div',
        { class: 'save-bar' },
        h('span', { class: 'note' }, 'جميع التعديلات تُحفظ مباشرة في جدول settings ضمن قاعدة بيانات D1.'),
        h('div', { class: 'stack-row' }, testModelBtn, saveBtn),
      ),
    ),
  );

  container.append(form);

  void (async () => {
    try {
      const res = await api.getSettings();
      if (disposed) return;
      applySettings(res.settings);
    } catch (err) {
      if (disposed) return;
      if (err instanceof ApiError && err.isUnauthenticated) {
        opts.onSessionLost();
        return;
      }
      feedbackBox.className = 'alert alert-warn';
      feedbackBox.textContent = 'تعذّر تحميل الإعدادات الحالية من الخادم.';
      feedbackBox.hidden = false;
    }
  })();

  return {
    hasUnsaved: () => dirty,
    flush: () => saveSettings(),
    dispose: () => {
      disposed = true;
      clear(container);
    },
  };
}

