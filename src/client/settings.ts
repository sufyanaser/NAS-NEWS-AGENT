/** Settings screen ("الإعدادات") backed by D1 settings table without exposing AI secrets. */
import type { SettingsDto } from '../shared/contracts';
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

const MODEL_PROVIDERS = [
  { value: 'OpenAI', label: 'OpenAI GPT' },
  { value: 'Anthropic', label: 'Anthropic Claude' },
  { value: 'Google', label: 'Google Gemini' },
];

export function mountSettings(container: HTMLElement, opts: SettingsOptions): EditorHandle {
  let disposed = false;
  let dirty = false;

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

  const modelNameInput = h('input', {
    id: 'setting-model-name',
    class: 'input ltr',
    type: 'text',
    maxlength: '200',
    value: 'gpt-4.1',
    placeholder: 'claude-sonnet-4-20250514',
  });

  const aiStatusBadge = h(
    'span',
    { id: 'setting-ai-status', class: 'badge', 'data-status': 'قيد المراجعة' },
    'غير متصل — Not Configured (المرحلة التالية)',
  );

  const feedbackBox = h('div', { id: 'settings-feedback', class: 'alert', role: 'status', hidden: true });
  const saveBtn = h('button', { type: 'submit', id: 'btn-save-settings', class: 'btn btn-primary' }, 'حفظ الإعدادات');

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

    const prov = s.modelProvider || 'OpenAI';
    if (!MODEL_PROVIDERS.some((p) => p.value === prov)) {
      providerSelect.append(h('option', { value: prov }, prov));
    }
    providerSelect.value = prov;
    modelNameInput.value = s.modelName || 'gpt-4.1';

    if (s.aiConfigured) {
      aiStatusBadge.textContent = 'متصل وجاهز (Configured)';
      aiStatusBadge.dataset.status = 'معتمد';
    } else {
      aiStatusBadge.textContent = 'غير متصل — Not Configured (المرحلة التالية)';
      aiStatusBadge.dataset.status = 'قيد المراجعة';
    }
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
        modelProvider: providerSelect.value || 'OpenAI',
        modelName: modelNameInput.value.trim() || 'gpt-4.1',
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

  for (const el of [stationInput, styleSelect, lengthSelect, providerSelect, modelNameInput]) {
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
            h('h2', { class: 'card-title' }, 'إعدادات نموذج الذكاء الاصطناعي (للمرحلة القادمة)'),
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
          modelNameInput,
        ),
      ),
      h(
        'div',
        { class: 'alert alert-info' },
        'ملاحظة أمان: لا توجد خانة لإدخال مفتاح API في المتصفح. عند تفعيل المرحلة القادمة، يُربط السر برمجياً في بيئة Worker فقط.',
      ),
      h(
        'div',
        { class: 'save-bar' },
        h('span', { class: 'note' }, 'جميع التعديلات تُحفظ مباشرة في جدول settings ضمن قاعدة بيانات D1.'),
        saveBtn,
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
