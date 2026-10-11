/** "خبر جديد" / draft editor with real server-confirmed autosave (Specs §10, Wireframe WF-02). */
import { CATEGORIES, SOURCE_LANGS } from '../shared/contracts';
import type { StoryDto, StoryPatchBody, StorySummaryDto } from '../shared/contracts';
import { ApiError, api } from './api';
import { clear, h } from './dom';

const AUTOSAVE_DEBOUNCE_MS = 1500;
const AUTO_RETRY_MS = 8000;

const FIELD_KEYS = ['sourceName', 'sourceUrl', 'publishDate', 'category', 'sourceLang', 'sourceText'] as const;
type FieldKey = (typeof FIELD_KEYS)[number];
type Fields = Record<FieldKey, string>;
type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

const EDITABLE_STATUSES = ['مسودة', 'قيد المراجعة'];

function emptyFields(): Fields {
  return { sourceName: '', sourceUrl: '', publishDate: '', category: '', sourceLang: '', sourceText: '' };
}

function fieldsOf(s: StoryDto): Fields {
  return {
    sourceName: s.sourceName,
    sourceUrl: s.sourceUrl,
    publishDate: s.publishDate,
    category: s.category,
    sourceLang: s.sourceLang,
    sourceText: s.sourceText,
  };
}

export interface EditorHandle {
  /** True when edits exist that the server has not confirmed. */
  hasUnsaved(): boolean;
  /** Tries to save pending edits; resolves true only if the server confirmed everything. */
  flush(): Promise<boolean>;
  dispose(): void;
}

export interface EditorOptions {
  storyId: string | null;
  navigate: (path: string) => void;
  onSessionLost: () => void;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' });
}

export function mountEditor(container: HTMLElement, opts: EditorOptions): EditorHandle {
  let id = opts.storyId;
  let version = 0;
  let savedVersion = 0;
  let confirmed = emptyFields();
  let state: SaveState = 'idle';
  let failureMessage = '';
  let sessionLost = false;
  let currentSave: Promise<void> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let readOnly = false;

  // ---- static skeleton -------------------------------------------------------------------------
  const titleText = h('h2', { class: 'card-title' }, 'إدخال مادة خبرية');
  const title = h(
    'div',
    { class: 'title-with-icon' },
    h('img', { src: '/assets/icons/nav-new-story.png', alt: '', class: 'section-icon', width: '24', height: '24' }),
    titleText,
  );
  const statusBadge = h('span', { class: 'badge', hidden: true });
  const subtitle = h('p', { class: 'card-sub' }, 'الصق النص الأصلي وبيانات المصدر. تُحفظ المسودة تلقائياً على الخادم ويمكن استعادتها لاحقاً.');

  const nameInput = h('input', { id: 'f-source-name', class: 'input', type: 'text', maxlength: '200', autocomplete: 'off', placeholder: 'مثال: وكالة الأنباء العراقية' });
  const urlInput = h('input', { id: 'f-source-url', class: 'input ltr', type: 'text', inputmode: 'url', maxlength: '2048', autocomplete: 'off', placeholder: 'https://example.org/news-item' });
  const dateInput = h('input', { id: 'f-publish-date', class: 'input', type: 'date' });
  const categorySelect = h('select', { id: 'f-category', class: 'select' }, h('option', { value: '' }, '— غير محدد —'), ...CATEGORIES.map((c) => h('option', { value: c }, c)));
  const langSelect = h('select', { id: 'f-source-lang', class: 'select' }, h('option', { value: '' }, '— غير محدد —'), ...SOURCE_LANGS.map((l) => h('option', { value: l }, l)));
  const textArea = h('textarea', { id: 'f-source-text', class: 'textarea', placeholder: 'الصق النص الكامل للخبر من المصدر هنا…' });
  const counter = h('span', { class: 'note', id: 'char-counter' }, '0 حرف');

  const importButton = h('button', { type: 'button', id: 'btn-import', class: 'btn btn-sm' }, 'قراءة الرابط');
  const importBox = h('div', { id: 'import-status', class: 'alert', role: 'alert', hidden: true });

  const inputs: Record<FieldKey, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> = {
    sourceName: nameInput,
    sourceUrl: urlInput,
    publishDate: dateInput,
    category: categorySelect,
    sourceLang: langSelect,
    sourceText: textArea,
  };

  const stateLabel = h('span', { id: 'save-state', class: 'save-state', role: 'status', 'aria-live': 'polite' });
  const saveButton = h('button', { type: 'button', id: 'btn-save', class: 'btn btn-primary' }, 'حفظ المسودة');
  const retryButton = h('button', { type: 'button', id: 'btn-retry', class: 'btn', hidden: true }, 'إعادة المحاولة');
  const errorBox = h('div', { id: 'save-error', class: 'alert alert-danger', role: 'alert', hidden: true });
  const lockedNote = h('div', { class: 'alert alert-warn', hidden: true }, 'هذا الخبر خرج من مرحلة المسودة، فالحقول للقراءة فقط في هذه النسخة.');

  const field = (label: string, input: HTMLElement, hint?: string): HTMLElement =>
    h('div', { class: 'field' }, h('label', { class: 'label', for: input.id }, h('span', {}, label), hint ? h('span', { class: 'hint' }, hint) : null), input);

  const draftsHost = h('section', { class: 'card', id: 'drafts-card' });

  const urlFieldContainer = h(
    'div',
    { class: 'field' },
    h('label', { class: 'label', for: 'f-source-url' }, h('span', {}, 'رابط المصدر'), h('span', { class: 'hint' }, 'يدعم روابط HTTPS المباشرة؛ إذا تعذّرت القراءة يمكنك لصق النص يدوياً')),
    h('div', { class: 'input-with-button' }, urlInput, importButton),
  );

  const card = h(
    'article',
    { class: 'card' },
    h('div', { class: 'card-head' }, h('div', {}, title, subtitle), statusBadge),
    lockedNote,
    urlFieldContainer,
    importBox,
    h('div', { class: 'grid-meta' }, field('اسم المصدر / الجهة', nameInput), field('تاريخ النشر', dateInput), field('تصنيف الخبر', categorySelect), field('لغة المادة الأصلية', langSelect)),
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'f-source-text' }, h('span', {}, 'النص الأصلي للمادة الخبرية'), h('span', { class: 'hint' }, 'المرجع الوحيد لاستخراج الحقائق لاحقاً')), textArea, counter),
    errorBox,
    h('div', { class: 'save-bar' }, stateLabel, h('div', { class: 'stack-row' }, retryButton, saveButton)),
    h('p', { class: 'note' }, 'استخراج الحقائق والصياغة والاعتماد تُضاف في مراحل لاحقة؛ هذه الشاشة تحفظ المسودة وتستورد النص بأمان.'),
  );
  container.append(card, draftsHost);

  // ---- helpers ---------------------------------------------------------------------------------
  function current(): Fields {
    const f = emptyFields();
    for (const k of FIELD_KEYS) f[k] = inputs[k].value;
    return f;
  }

  function diff(a: Fields, b: Fields): StoryPatchBody {
    const out: StoryPatchBody = {};
    for (const k of FIELD_KEYS) if (a[k] !== b[k]) out[k] = a[k];
    return out;
  }

  function setState(next: SaveState, savedAt?: string): void {
    state = next;
    stateLabel.dataset.state = next;
    retryButton.hidden = next !== 'failed' || sessionLost;
    errorBox.hidden = next !== 'failed';
    if (next === 'idle') stateLabel.textContent = id ? 'محفوظ' : 'مسودة جديدة — لم تُحفظ بعد';
    if (next === 'saving') stateLabel.textContent = 'جارٍ الحفظ…';
    if (next === 'saved') stateLabel.textContent = savedAt ? `محفوظ — ${formatWhen(savedAt)}` : 'محفوظ';
    if (next === 'failed') {
      stateLabel.textContent = 'تعذّر الحفظ';
      errorBox.textContent = failureMessage;
    }
    saveButton.disabled = readOnly || next === 'saving';
  }

  function updateCounter(): void {
    counter.textContent = `${textArea.value.length.toLocaleString('ar-IQ')} حرف`;
  }

  function describeFailure(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.isNetwork) return 'تعذّر الاتصال بالخادم. نصك ما زال في الحقول ولم يُفقد؛ سنعيد المحاولة تلقائياً أو اضغط «إعادة المحاولة».';
      if (err.isUnauthenticated) return 'انتهت جلسة الدخول. نصك ما زال في هذه الصفحة؛ انسخه قبل تسجيل الدخول مجدداً.';
      if (err.status === 400) return 'إحدى القيم غير صالحة ولم تُحفظ. صحّح الحقل ثم أعد المحاولة.';
      if (err.status === 409) return 'هذا الخبر لم يعد قابلاً للتعديل.';
    }
    return 'تعذّر الحفظ بسبب خطأ في الخادم. نصك ما زال في الحقول؛ سنعيد المحاولة تلقائياً.';
  }

  function schedule(ms: number): void {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void save(), ms);
  }

  async function runSave(): Promise<void> {
    const snapshot = current();
    const startVersion = version;
    const changes = diff(snapshot, confirmed);
    if (Object.keys(changes).length === 0) {
      savedVersion = startVersion;
      setState(id ? 'saved' : 'idle');
      return;
    }
    setState('saving');
    try {
      let savedAt: string;
      if (id === null) {
        const { story } = await api.createStory(changes);
        id = story.id;
        savedAt = story.updatedAt;
        // The URL now names the persisted draft, so reload/bookmark restores it.
        history.replaceState(null, '', `/stories/${story.id}`);
        void loadDrafts();
      } else {
        const { story } = await api.patchStory(id, changes);
        savedAt = story.updatedAt;
      }
      // Success is claimed only here, after the server responded 2xx.
      confirmed = snapshot;
      savedVersion = startVersion;
      failureMessage = '';
      if (version === startVersion) setState('saved', savedAt);
    } catch (err) {
      failureMessage = describeFailure(err);
      if (err instanceof ApiError && err.isUnauthenticated) {
        sessionLost = true;
        opts.onSessionLost();
      } else if (!(err instanceof ApiError && (err.status === 400 || err.status === 409))) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => void save(), AUTO_RETRY_MS);
      }
      setState('failed');
    }
  }

  function save(): Promise<void> {
    clearTimeout(debounceTimer);
    clearTimeout(retryTimer);
    if (disposed || readOnly) return Promise.resolve();
    if (currentSave) return currentSave;
    currentSave = (async () => {
      try {
        await runSave();
      } finally {
        currentSave = null;
      }
      // Edits made while the request was in flight get their own save, unless the last attempt failed.
      if (!disposed && state !== 'failed' && version > savedVersion) await save();
    })();
    return currentSave;
  }

  function onInput(): void {
    version++;
    updateCounter();
    setState('saving');
    schedule(AUTOSAVE_DEBOUNCE_MS);
  }

  async function handleImport(): Promise<void> {
    const rawUrl = urlInput.value.trim();
    if (!rawUrl) {
      importBox.hidden = false;
      importBox.className = 'alert alert-warn';
      importBox.textContent = 'يرجى إدخال رابط المصدر أولاً.';
      return;
    }
    if (!rawUrl.startsWith('https://')) {
      importBox.hidden = false;
      importBox.className = 'alert alert-warn';
      importBox.textContent = 'نقبل روابط HTTPS المباشرة فقط لحماية النظام.';
      return;
    }

    // Flush any pending draft save so story has an ID before calling /import
    if (id === null) {
      await save();
    }
    if (id === null) {
      importBox.hidden = false;
      importBox.className = 'alert alert-danger';
      importBox.textContent = 'تعذّر إنشاء المسودة لحفظ الرابط. حاول مجدداً.';
      return;
    }

    importButton.disabled = true;
    const prevBtnText = importButton.textContent;
    importButton.textContent = 'جارٍ القراءة…';
    importBox.hidden = false;
    importBox.className = 'alert alert-info';
    importBox.textContent = 'جارٍ الاتصال بالمصدر واستخراج النص…';

    try {
      const res = await api.importSource(id, rawUrl);
      if (res.ok) {
        importBox.className = 'alert alert-info';
        importBox.textContent = res.importMessage || 'تم استيراد نص المادة بنجاح.';
        textArea.value = res.sourceText;
        updateCounter();
        version++;
        schedule(500); // trigger quick autosave of the imported text
      } else {
        // Failure: alert editor with friendly Arabic message, NEVER touch existing textArea content
        importBox.className = 'alert alert-warn';
        importBox.textContent = res.importMessage || 'تعذّرت قراءة الرابط. يرجى لصق نص الخبر يدوياً في الخانة أدناه.';
      }
    } catch {
      importBox.className = 'alert alert-danger';
      importBox.textContent = 'تعذّر الاتصال بخادم التحرير لإتمام الاستيراد. يمكنك لصق النص يدوياً.';
    } finally {
      importButton.disabled = readOnly;
      importButton.textContent = prevBtnText;
    }
  }

  for (const k of FIELD_KEYS) {
    inputs[k].addEventListener('input', onInput);
    inputs[k].addEventListener('change', onInput);
  }
  importButton.addEventListener('click', () => void handleImport());
  saveButton.addEventListener('click', () => void save());
  retryButton.addEventListener('click', () => void save());

  const beforeUnload = (e: BeforeUnloadEvent): void => {
    if (version > savedVersion || state === 'failed') {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', beforeUnload);

  // ---- drafts list (restore entry point) --------------------------------------------------------
  async function loadDrafts(): Promise<void> {
    let stories: StorySummaryDto[] = [];
    let failed = false;
    try {
      stories = (await api.listDrafts(10)).stories;
    } catch {
      failed = true;
    }
    if (disposed) return;
    clear(draftsHost);
    draftsHost.append(
      h(
        'div',
        { class: 'card-head' },
        h(
          'div',
          {},
          h(
            'div',
            { class: 'title-with-icon' },
            h('img', { src: '/assets/icons/nav-drafts.png', alt: '', class: 'section-icon', width: '22', height: '22' }),
            h('h2', { class: 'card-title' }, 'المسودات المحفوظة'),
          ),
          h('p', { class: 'card-sub' }, 'افتح مسودة لمتابعة التحرير من حيث توقفت.'),
        ),
      ),
    );
    const others = stories.filter((s) => s.id !== id);
    if (failed) {
      draftsHost.append(h('div', { class: 'alert alert-warn' }, 'تعذّر تحميل قائمة المسودات الآن.'));
    } else if (others.length === 0) {
      draftsHost.append(h('p', { class: 'note', id: 'drafts-empty' }, 'لا توجد مسودات أخرى محفوظة.'));
    } else {
      draftsHost.append(
        h(
          'ul',
          { class: 'draft-list', id: 'drafts-list' },
          ...others.map((s) =>
            h(
              'li',
              {},
              h(
                'a',
                {
                  class: 'draft-item',
                  href: `/stories/${s.id}`,
                  'data-story-id': s.id,
                  onClick: (e: Event) => {
                    e.preventDefault();
                    opts.navigate(`/stories/${s.id}`);
                  },
                },
                h('div', { class: 'draft-title' }, s.sourceName || 'بدون اسم مصدر'),
                h('div', { class: 'draft-preview' }, s.textPreview || '(لا يوجد نص بعد)'),
                h('div', { class: 'draft-meta' }, h('span', { class: 'badge' }, s.status), h('span', {}, formatWhen(s.updatedAt))),
              ),
            ),
          ),
        ),
      );
    }
  }

  // ---- initial load -----------------------------------------------------------------------------
  function applyStory(s: StoryDto): void {
    const f = fieldsOf(s);
    for (const k of FIELD_KEYS) inputs[k].value = f[k];
    confirmed = f;
    updateCounter();
    statusBadge.textContent = s.status;
    statusBadge.hidden = false;
    titleText.textContent = 'متابعة المسودة';
    if (!EDITABLE_STATUSES.includes(s.status)) {
      readOnly = true;
      lockedNote.hidden = false;
      for (const k of FIELD_KEYS) inputs[k].disabled = true;
      importButton.disabled = true;
    }
    setState('saved', s.updatedAt);
  }

  if (id === null) {
    setState('idle');
    updateCounter();
    void loadDrafts();
  } else {
    const loadingId = id;
    for (const k of FIELD_KEYS) inputs[k].disabled = true;
    saveButton.disabled = true;
    stateLabel.textContent = 'جارٍ تحميل المسودة…';
    void (async () => {
      try {
        const { story } = await api.getStory(loadingId);
        if (disposed) return;
        for (const k of FIELD_KEYS) inputs[k].disabled = false;
        applyStory(story);
        void loadDrafts();
      } catch (err) {
        if (disposed) return;
        clear(container);
        if (err instanceof ApiError && err.isUnauthenticated) {
          opts.onSessionLost();
          return;
        }
        const notFound = err instanceof ApiError && err.status === 404;
        container.append(
          h(
            'article',
            { class: 'card', id: 'load-error' },
            h('h2', { class: 'card-title' }, notFound ? 'المسودة غير موجودة' : 'تعذّر تحميل المسودة'),
            h('p', { class: 'card-sub' }, notFound ? 'ربما حُذف الرابط أو لم يُحفظ هذا الخبر.' : 'تحقق من الاتصال ثم أعد تحميل الصفحة.'),
            h('p', {}, h('a', { class: 'btn', href: '/stories/new', onClick: (e: Event) => { e.preventDefault(); opts.navigate('/stories/new'); } }, 'خبر جديد')),
          ),
        );
      }
    })();
  }

  return {
    hasUnsaved: () => version > savedVersion || state === 'failed',
    async flush(): Promise<boolean> {
      for (let i = 0; i < 3 && (version > savedVersion || state === 'failed'); i++) {
        if (sessionLost) return false;
        await save();
      }
      return !(version > savedVersion) && state !== 'failed';
    },
    dispose(): void {
      disposed = true;
      clearTimeout(debounceTimer);
      clearTimeout(retryTimer);
      window.removeEventListener('beforeunload', beforeUnload);
    },
  };
}
