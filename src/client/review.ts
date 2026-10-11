/** Editorial Workspace ("المراجعة والتحرير") — Split screen comparison, manual facts, 4-format editors, and human approval workflow. */
import { FORMAT_KEYS, FORMAT_LABELS, LIMITS } from '../shared/contracts';
import type { FactType, FormatKey, StoryDto, StoryFact, StoryFormats, StoryPatchBody } from '../shared/contracts';
import { ApiError, api } from './api';
import { wrapReadOnlyWithCopy, wrapWithCopyPaste } from './clipboard';
import { clear, h } from './dom';
import type { EditorHandle } from './editor';

const AUTOSAVE_DEBOUNCE_MS = 1500;
const EDITABLE_STATUSES = ['مسودة', 'قيد المراجعة'];

type StepKey = 'source' | 'facts' | 'draft' | 'approval';
type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

export interface ReviewOptions {
  storyId: string | null;
  navigate: (path: string) => void;
  onSessionLost: () => void;
  onStoryUpdated?: (story: { id: string; headline: string; status: string }) => void;
  onSaveStateChange?: (state: SaveState, label: string) => void;
}

const FORMAT_ICONS: Record<FormatKey, string> = {
  radio: '/assets/icons/format-radio.png',
  web: '/assets/icons/format-web.png',
  facebook: '/assets/icons/format-podcast.png',
  urgent: '/assets/icons/format-urgent.png',
};

const FORMAT_HINTS: Record<FormatKey, string> = {
  radio: 'الصيغة الحالية: النص الإذاعي المعد للقراءة المباشرة على الهواء (الهدف: 20–40 ثانية، 45–90 كلمة).',
  web: 'الصيغة الحالية: خبر الموقع الإلكتروني الموثق بالمصدر والتواريخ.',
  facebook: 'الصيغة الحالية: منشور منصات التواصل الاجتماعي المركز والمباشر.',
  urgent: 'الصيغة الحالية: الشريط العاجل المقتضب (يُفعل عند الحاجة التحريرية فقط).',
};

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function estimateRadioSeconds(words: number): number {
  if (words === 0) return 0;
  // Broadcast Arabic standard ~ 135 words per minute (~2.25 words/sec)
  return Math.max(1, Math.round(words / 2.25));
}

export function mountReview(container: HTMLElement, opts: ReviewOptions): EditorHandle {
  const id = opts.storyId;
  let story: StoryDto | null = null;
  let activeFormat: FormatKey = 'radio';
  let state: SaveState = 'idle';
  let version = 0;
  let savedVersion = 0;
  let currentSave: Promise<void> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let readOnly = false;
  let aiExtracting = false;

  // Local editable state
  let headlineVal = '';
  let formatsVal: StoryFormats = { radio: '', web: '', facebook: '', urgent: '' };
  let selectedFormatsVal: FormatKey[] = ['radio', 'web', 'facebook'];
  let urgentEnabledVal = false;
  let factsVal: StoryFact[] = [];
  let hasBlockerVal = false;
  let blockerReasonVal = '';

  // Confirmed server state for diffing
  let confirmedHeadline = '';
  let confirmedFormats: StoryFormats = { radio: '', web: '', facebook: '', urgent: '' };
  let confirmedSelectedFormats: FormatKey[] = ['radio', 'web', 'facebook'];
  let confirmedUrgentEnabled = false;
  let confirmedFactsJson = '[]';
  let confirmedHasBlocker = false;
  let confirmedBlockerReason = '';

  function setState(next: SaveState, customText?: string): void {
    state = next;
    let label = customText ?? '';
    if (!label) {
      if (next === 'idle' || next === 'saved') label = 'محفوظ';
      else if (next === 'saving') label = 'جارٍ الحفظ…';
      else if (next === 'failed') label = 'تعذّر الحفظ';
    }
    saveBadge.dataset.state = next;
    saveBadge.textContent = label;
    opts.onSaveStateChange?.(next, label);
  }

  const saveBadge = h('span', { class: 'save-state', id: 'review-save-state', 'data-state': 'saved' }, 'محفوظ');

  // If no storyId is provided, try loading the most recent story or show empty state
  if (!id) {
    container.append(h('div', { class: 'card' }, h('p', { class: 'note' }, 'جارٍ البحث عن آخر خبر للتحرير…')));
    void (async () => {
      try {
        const res = await api.listStories({ limit: 1 });
        if (disposed) return;
        const latest = res.stories[0];
        if (latest) {
          opts.navigate(`/stories/${latest.id}/review`);
        } else {
          clear(container);
          container.append(
            h(
              'article',
              { class: 'card', id: 'review-empty-state' },
              h('h2', { class: 'card-title' }, 'لا يوجد خبر نشط للمراجعة حالياً'),
              h('p', { class: 'card-sub' }, 'ابدأ بإنشاء خبر جديد أو اختر خبراً من الأرشيف لمتابعة التحرير والمراجعة.'),
              h(
                'div',
                { class: 'stack-row' },
                h('button', { type: 'button', class: 'btn btn-primary', onClick: () => opts.navigate('/stories/new') }, '+ إنشاء خبر جديد'),
                h('button', { type: 'button', class: 'btn', onClick: () => opts.navigate('/archive') }, 'فتح الأرشيف'),
              ),
            ),
          );
        }
      } catch (err) {
        if (err instanceof ApiError && err.isUnauthenticated) opts.onSessionLost();
      }
    })();

    return {
      hasUnsaved: () => false,
      flush: () => Promise.resolve(true),
      dispose: () => {
        disposed = true;
      },
    };
  }

  // ---- Build UI Skeleton -----------------------------------------------------------------------
  const stepButtons: Record<StepKey, HTMLButtonElement> = {
    source: h('button', { type: 'button', class: 'step-pill', 'data-step': 'source' }, h('span', { class: 'step-num' }, '1'), h('span', {}, 'المصدر')),
    facts: h('button', { type: 'button', class: 'step-pill active', 'data-step': 'facts' }, h('span', { class: 'step-num' }, '2'), h('span', {}, 'الحقائق')),
    draft: h('button', { type: 'button', class: 'step-pill', 'data-step': 'draft' }, h('span', { class: 'step-num' }, '3'), h('span', {}, 'الصياغة')),
    approval: h('button', { type: 'button', class: 'step-pill', 'data-step': 'approval' }, h('span', { class: 'step-num' }, '4'), h('span', {}, 'مراجعة الاعتماد')),
  };

  function setStep(step: StepKey, scroll = true): void {
    for (const k of ['source', 'facts', 'draft', 'approval'] as const) {
      stepButtons[k].classList.toggle('active', k === step);
    }
    if (scroll) {
      const targetId =
        step === 'source'
          ? 'card-source'
          : step === 'facts'
            ? 'card-facts'
            : step === 'draft'
              ? 'card-draft'
              : 'card-approval';
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  for (const k of ['source', 'facts', 'draft', 'approval'] as const) {
    stepButtons[k].addEventListener('click', () => setStep(k, true));
  }

  const workflowBar = h(
    'div',
    { class: 'workflow-bar', 'aria-label': 'شريط خطوات التحرير' },
    h(
      'div',
      { class: 'workflow-bar-label' },
      h('strong', {}, 'خطوة العمل التحريرية الحالية'),
      h('span', {}, 'خطوات واجهة لتنظيم المراجعة — مستقلة عن «حالة الخبر» التحريرية'),
    ),
    h('div', { class: 'workflow-steps', role: 'tablist' }, stepButtons.source, stepButtons.facts, stepButtons.draft, stepButtons.approval),
  );

  // Mobile switcher
  const btnMobileEditor = h('button', { type: 'button', class: 'mobile-switch-btn active', id: 'btn-mobile-editor' }, 'الحقائق والمحرر');
  const btnMobileSource = h('button', { type: 'button', class: 'mobile-switch-btn', id: 'btn-mobile-source' }, 'المصدر الأصلي (للمقارنة)');
  const mobileSwitcher = h('div', { class: 'mobile-pane-switcher' }, btnMobileEditor, btnMobileSource);

  // Card 1: Original Source
  const sourceNameEl = h('span', { class: 'source-meta-val', id: 'review-source-name' }, '—');
  const sourceDateCatEl = h('span', { class: 'source-meta-val', id: 'review-source-date' }, '—');
  const sourceUrlEl = h('span', { class: 'source-meta-val ltr', id: 'review-source-url' }, '—');
  const sourceBodyEl = h('div', { class: 'source-reading-box', id: 'review-source-body' }, '');
  const sourceBodyCopyWrap = wrapReadOnlyWithCopy(sourceBodyEl, 'نسخ النص');

  const editSourceBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-sm',
      id: 'btn-edit-source-return',
      onClick: () => {
        if (id) opts.navigate(`/stories/${id}`);
      },
    },
    'تعديل بيانات المصدر',
  );

  const startReviewBanner = h(
    'div',
    { class: 'alert alert-warn', id: 'draft-mode-banner', hidden: true },
    h('span', {}, 'هذا الخبر لا يزال في حالة «مسودة». لبدء إجراءات الاعتماد الرسمية، انقله إلى «قيد المراجعة».'),
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-sm btn-primary',
        id: 'btn-start-review',
        onClick: () => void handleStartReview(),
      },
      'بدء المراجعة الرسمية (نقل إلى قيد المراجعة)',
    ),
  );

  const sourceCard = h(
    'article',
    { class: 'card source-sticky-card', id: 'card-source' },
    h(
      'div',
      { class: 'card-head compact-head' },
      h(
        'div',
        {},
        h(
          'div',
          { class: 'title-with-icon' },
          h('img', { src: '/assets/icons/nav-new-story.png', alt: '', class: 'section-icon', width: '20', height: '20' }),
          h('h2', { class: 'card-title' }, 'بطاقة المصدر الأصلي'),
        ),
        h('p', { class: 'card-sub' }, 'مرجع المقارنة المباشرة للأسماء والأرقام والتواريخ'),
      ),
      editSourceBtn,
    ),
    h(
      'div',
      { class: 'source-meta-grid' },
      h('div', { class: 'source-meta-item' }, h('span', { class: 'source-meta-label' }, 'اسم المصدر'), sourceNameEl),
      h('div', { class: 'source-meta-item' }, h('span', { class: 'source-meta-label' }, 'تاريخ النشر والتصنيف'), sourceDateCatEl),
      h('div', { class: 'source-meta-item full' }, h('span', { class: 'source-meta-label' }, 'رابط المصدر الموثق'), sourceUrlEl),
    ),
    sourceBodyCopyWrap,
  );

  // Card 2: Facts & Missing Info
  const aiStatusBanner = h(
    'span',
    { class: 'note', id: 'ai-disconnected-notice' },
    'الاستخراج الآلي (AI) غير متصل — وثّق الحقائق والنواقص يدوياً',
  );

  const factsSummaryBadge = h('span', { class: 'badge', id: 'facts-summary-badge' }, '0 حقائق موثقة');
  const aiGenerateBtn = h(
    'button',
    { type: 'button', class: 'btn btn-sm btn-primary', id: 'btn-ai-generate' },
    '✨ توليد بالذكاء الاصطناعي',
  );
  const factsListHost = h('div', { class: 'facts-list', id: 'facts-list-container' });

  // AI Overwrite Confirmation Box & AI Insights Box
  const aiFillEmptyBtn = h(
    'button',
    { type: 'button', class: 'btn btn-sm btn-primary', id: 'btn-ai-fill-empty' },
    'توليد الفارغ فقط',
  );
  const aiOverwriteAllBtn = h(
    'button',
    { type: 'button', class: 'btn btn-sm btn-danger-outline', id: 'btn-ai-overwrite-all' },
    'استبدال الكل',
  );
  const aiCancelOverwriteBtn = h(
    'button',
    { type: 'button', class: 'btn btn-sm', id: 'btn-ai-cancel-overwrite' },
    'إلغاء',
  );
  const aiOverwriteConfirmBox = h(
    'div',
    { class: 'alert alert-warn compact-alert', id: 'ai-overwrite-confirm-box', hidden: true },
    h('span', {}, 'توجد صياغات محررة حالياً. كيف ترغب في المتابعة؟'),
    h('div', { class: 'stack-row' }, aiFillEmptyBtn, aiOverwriteAllBtn, aiCancelOverwriteBtn),
  );

  const aiInsightsBox = h(
    'div',
    { class: 'alert alert-info compact-alert', id: 'ai-insights-box', hidden: true },
  );

  // Add Fact form
  const newFactLabel = h('input', { type: 'text', class: 'input input-sm', id: 'input-fact-label', placeholder: 'العنصر (مثال: الأرقام، المتحدث)' });
  const newFactValue = h('input', { type: 'text', class: 'input input-sm', id: 'input-fact-value', placeholder: 'المعلومة أو النقص كما ورد في المصدر…' });
  const newFactType = h(
    'select',
    { class: 'select select-sm', id: 'select-fact-type' },
    h('option', { value: 'sourced' }, 'وارد في المصدر'),
    h('option', { value: 'missing' }, 'غير مذكور في المصدر (نقص)'),
    h('option', { value: 'review-req' }, 'يحتاج مراجعة إسناد (مانع)'),
  );
  const addFactBtn = h('button', { type: 'button', class: 'btn btn-sm btn-primary', id: 'btn-add-fact' }, '+ إضافة حقيقة');
  const addFactRow = h('div', { class: 'add-fact-row', id: 'add-fact-form' }, newFactLabel, newFactValue, newFactType, addFactBtn);

  // Blocker box
  const blockerReasonSpan = h('span', { id: 'editorial-blocker-text' }, '');
  const resolveNoteInput = h('input', {
    type: 'text',
    class: 'input input-sm',
    id: 'input-resolve-blocker-note',
    placeholder: 'اكتب ملاحظة معالجة المانع التحريري (مثال: تم حذف الادعاء غير المسند)…',
  });
  const resolveBlockerBtn = h('button', { type: 'button', class: 'btn btn-sm btn-danger-outline', id: 'btn-resolve-blocker' }, 'تأكيد معالجة المانع');
  const blockerBox = h(
    'div',
    { class: 'alert alert-danger compact-alert', id: 'editorial-blocker-box', hidden: true },
    h('div', {}, h('strong', {}, 'مانع تحريري يمنع الاعتماد: '), blockerReasonSpan),
    h('div', { class: 'input-with-button' }, resolveNoteInput, resolveBlockerBtn),
  );

  const flagBlockerBtn = h('button', { type: 'button', class: 'btn btn-sm btn-danger-outline', id: 'btn-flag-blocker' }, 'تسجيل مانع تحريري يدوي');

  const factsCard = h(
    'article',
    { class: 'card review-facts-card', id: 'card-facts' },
    h(
      'div',
      { class: 'card-head compact-head' },
      h(
        'div',
        { class: 'title-with-icon' },
        h('img', { src: '/assets/icons/tool-ai.png', alt: '', class: 'section-icon', width: '20', height: '20' }),
        h('h2', { class: 'card-title' }, 'الحقائق والنواقص'),
        aiStatusBanner,
      ),
      h('div', { class: 'stack-row' }, factsSummaryBadge, aiGenerateBtn, flagBlockerBtn),
    ),
    blockerBox,
    aiOverwriteConfirmBox,
    aiInsightsBox,
    factsListHost,
    addFactRow,
  );

  // Card 3: Drafting & Formats Editor
  const radioMeter = h('span', { class: 'radio-meter', id: 'radio-duration-meter', 'data-fit': 'optimal' }, 'قراءة إذاعية: 0 ثانية (0 كلمة)');
  const headlineInput = h('input', {
    type: 'text',
    class: 'input',
    id: 'editor-headline-input',
    maxlength: String(LIMITS.headline),
    placeholder: 'عنوان الخبر الواضح والمسند…',
  });
  const headlineClip = wrapWithCopyPaste(headlineInput, {
    copyLabel: 'نسخ',
    pasteLabel: 'لصق',
  });
  const headlineCounter = h('span', { class: 'hint', id: 'headline-char-count' }, '0 حرف');

  const formatTabButtons: Record<FormatKey, HTMLButtonElement> = {
    radio: h(
      'button',
      { type: 'button', class: 'format-tab active', id: 'tab-fmt-radio', 'data-format': 'radio', role: 'tab' },
      h('img', { src: FORMAT_ICONS.radio, alt: '' }),
      h('span', {}, FORMAT_LABELS.radio),
    ),
    web: h(
      'button',
      { type: 'button', class: 'format-tab', id: 'tab-fmt-web', 'data-format': 'web', role: 'tab' },
      h('img', { src: FORMAT_ICONS.web, alt: '' }),
      h('span', {}, FORMAT_LABELS.web),
    ),
    facebook: h(
      'button',
      { type: 'button', class: 'format-tab', id: 'tab-fmt-facebook', 'data-format': 'facebook', role: 'tab' },
      h('img', { src: FORMAT_ICONS.facebook, alt: '' }),
      h('span', {}, FORMAT_LABELS.facebook),
    ),
    urgent: h(
      'button',
      { type: 'button', class: 'format-tab', id: 'tab-fmt-urgent', 'data-format': 'urgent', role: 'tab' },
      h('img', { src: FORMAT_ICONS.urgent, alt: '' }),
      h('span', {}, FORMAT_LABELS.urgent),
    ),
  };

  // Format classification toggles right inside Review workspace as well
  const reviewFormatCheckboxes: Record<FormatKey, HTMLInputElement> = {
    radio: h('input', { type: 'checkbox', id: 'rev-chk-fmt-radio' }),
    web: h('input', { type: 'checkbox', id: 'rev-chk-fmt-web' }),
    facebook: h('input', { type: 'checkbox', id: 'rev-chk-fmt-facebook' }),
    urgent: h('input', { type: 'checkbox', id: 'rev-chk-fmt-urgent' }),
  };

  const formatClassificationBar = h(
    'div',
    { class: 'format-tabs-bar' },
    h('div', { class: 'format-tabs', role: 'tablist' }, formatTabButtons.radio, formatTabButtons.web, formatTabButtons.facebook, formatTabButtons.urgent),
    h(
      'div',
      { class: 'stack-row format-archive-checks' },
      h('span', { class: 'note' }, 'الأرشفة:'),
      ...FORMAT_KEYS.map((fmt) =>
        h(
          'label',
          { class: 'check-item compact-check' },
          reviewFormatCheckboxes[fmt],
          h('span', {}, FORMAT_LABELS[fmt]),
        ),
      ),
    ),
  );

  const urgentOptinBox = h(
    'div',
    { class: 'alert alert-warn compact-alert', id: 'urgent-optin-box', hidden: true },
    h('div', {}, h('strong', {}, 'الشريط العاجل اختياري: '), h('span', {}, 'لم يتم تفعيله لهذا الخبر بعد.')),
    h('button', { type: 'button', class: 'btn btn-sm', id: 'btn-enable-urgent' }, 'تفعيل الشريط العاجل لهذا الخبر'),
  );

  const formatTextarea = h('textarea', {
    class: 'textarea review-fit-textarea',
    id: 'editor-format-textarea',
    placeholder: 'اكتب أو حرر الصياغة الصحفية لهذه الصيغة هنا استناداً إلى المصدر…',
  });
  const formatClip = wrapWithCopyPaste(formatTextarea, {
    copyLabel: 'نسخ الصيغة',
    pasteLabel: 'لصق النص',
    multiline: true,
  });

  const formatHintEl = h('span', { class: 'note', id: 'editor-format-hint' }, FORMAT_HINTS.radio);
  const copyFormatBtn = h('button', { type: 'button', class: 'btn btn-sm', id: 'btn-copy-current-format' }, 'نسخ نص الصيغة');
  const saveDraftBtn = h('button', { type: 'button', class: 'btn btn-sm btn-primary', id: 'btn-review-save' }, 'حفظ التعديلات الآن');

  const draftCard = h(
    'article',
    { class: 'card review-draft-card', id: 'card-draft' },
    h(
      'div',
      { class: 'card-head compact-head' },
      h(
        'div',
        { class: 'title-with-icon' },
        h('img', { src: '/assets/icons/format-radio.png', alt: '', class: 'section-icon', width: '20', height: '20' }),
        h('h2', { class: 'card-title' }, 'الصياغة والتحرير'),
      ),
      h('div', { class: 'stack-row' }, radioMeter, saveBadge),
    ),
    h(
      'div',
      { class: 'field compact-headline-field' },
      h('label', { class: 'label', for: 'editor-headline-input' }, h('span', {}, 'عنوان الخبر الرئيسي'), headlineCounter),
      headlineClip.wrapper,
    ),
    formatClassificationBar,
    urgentOptinBox,
    formatClip.wrapper,
    h(
      'div',
      { class: 'save-bar compact-save-bar' },
      formatHintEl,
      h('div', { class: 'stack-row' }, copyFormatBtn, saveDraftBtn),
    ),
  );

  // Card 4: Human Verification & Approval Actions
  const readinessBadge = h('span', { class: 'sufficiency-badge short', id: 'approval-readiness-badge' }, 'بانتظار استكمال شروط المراجعة');
  const chkFacts = h('input', { type: 'checkbox', id: 'chk-verify-facts' });
  const chkAttribution = h('input', { type: 'checkbox', id: 'chk-verify-attribution' });

  const postApprovalBox = h(
    'div',
    { class: 'alert alert-success compact-alert', id: 'post-approval-publish-box', hidden: true },
    h(
      'div',
      {},
      h('strong', { id: 'post-approval-title' }, 'الخبر معتمد وجاهز للنشر اليدوي الخارجي. '),
      h('span', { id: 'post-approval-desc' }, 'بعد نشرك للخبر على الهواء أو المنصات، سجّل حالته كـ «منشور».'),
    ),
    h('button', { type: 'button', class: 'btn btn-sm btn-primary', id: 'btn-mark-published' }, 'تسجيل الحالة كـ «منشور»'),
  );

  const excludeBox = h(
    'div',
    { class: 'alert alert-danger compact-alert', id: 'exclude-dialog-box', hidden: true },
  );
  const excludeReasonInput = h('input', {
    type: 'text',
    class: 'input input-sm',
    id: 'input-exclude-reason',
    placeholder: 'أدخل سبب استبعاد الخبر (إلزامي — لا يتم حذف الخبر نهائياً)…',
  });
  const confirmExcludeBtn = h('button', { type: 'button', class: 'btn btn-sm btn-danger-outline', id: 'btn-confirm-exclude' }, 'تأكيد الاستبعاد');
  const cancelExcludeBtn = h('button', { type: 'button', class: 'btn btn-sm', onClick: () => { excludeBox.hidden = true; } }, 'إلغاء');
  excludeBox.append(
    h('div', {}, h('strong', {}, 'استبعاد المسودة مع الاحتفاظ بالسجل:')),
    h('div', { class: 'input-with-button' }, excludeReasonInput, confirmExcludeBtn, cancelExcludeBtn),
  );

  const actionAlertBox = h('div', { class: 'alert alert-danger compact-alert', id: 'approval-error-box', hidden: true });
  const approveBtn = h('button', { type: 'button', class: 'btn btn-sm btn-success', id: 'btn-approve-story', disabled: true }, '✓ اعتماد الخبر');
  const excludeTriggerBtn = h('button', { type: 'button', class: 'btn btn-danger-outline btn-sm', id: 'btn-exclude-story' }, 'استبعاد المسودة');

  const approvalCard = h(
    'article',
    { class: 'card review-approval-card', id: 'card-approval' },
    h(
      'div',
      { class: 'card-head compact-head' },
      h(
        'div',
        { class: 'title-with-icon' },
        h('img', { src: '/assets/icons/tool-security.png', alt: '', class: 'section-icon', width: '20', height: '20' }),
        h('h2', { class: 'card-title' }, 'التحقق البشري وإجراءات الاعتماد'),
      ),
      h('div', { class: 'stack-row' }, readinessBadge, approveBtn, excludeTriggerBtn),
    ),
    startReviewBanner,
    postApprovalBox,
    actionAlertBox,
    excludeBox,
    h(
      'div',
      { class: 'verification-checklist' },
      h(
        'label',
        { class: 'check-item' },
        chkFacts,
        h('span', {}, 'راجعت النص الأصلي وطابقت جميع الأسماء والأرقام والتواريخ مع المصدر المرفق.'),
      ),
      h(
        'label',
        { class: 'check-item' },
        chkAttribution,
        h('span', {}, 'تأكدت من دقة إسناد التصريحات، وخلو جميع الصيغ من أي ادعاء غير مذكور في المصدر.'),
      ),
    ),
  );

  const editorialStack = h('div', { class: 'editorial-stack' }, factsCard, draftCard, approvalCard);
  const splitGrid = h('div', { class: 'review-split-grid', id: 'review-split-grid', 'data-mobile-pane': 'editor' }, sourceCard, editorialStack);

  container.append(workflowBar, mobileSwitcher, splitGrid);

  // ---- Interactive Helpers --------------------------------------------------------------------
  btnMobileEditor.addEventListener('click', () => {
    splitGrid.dataset.mobilePane = 'editor';
    btnMobileEditor.classList.add('active');
    btnMobileSource.classList.remove('active');
  });
  btnMobileSource.addEventListener('click', () => {
    splitGrid.dataset.mobilePane = 'source';
    btnMobileSource.classList.add('active');
    btnMobileEditor.classList.remove('active');
  });

  function updateMeters(): void {
    headlineCounter.textContent = `${headlineInput.value.length} حرف`;
    const activeText = formatsVal[activeFormat] ?? '';
    const words = countWords(activeText);
    const secs = estimateRadioSeconds(words);
    if (activeFormat === 'radio') {
      radioMeter.textContent = `قراءة إذاعية: ~${secs} ثانية (${words} كلمة)`;
      radioMeter.dataset.fit = secs >= 20 && secs <= 40 ? 'optimal' : 'warn';
    } else {
      radioMeter.textContent = `طول الصيغة (${FORMAT_LABELS[activeFormat]}): ${words} كلمة (${activeText.length} حرف)`;
      radioMeter.dataset.fit = words > 0 ? 'optimal' : 'warn';
    }
  }

  function switchFormatTab(fmt: FormatKey): void {
    // Save current textarea value into formatsVal before switching
    formatsVal[activeFormat] = formatTextarea.value;
    activeFormat = fmt;
    for (const k of FORMAT_KEYS) {
      formatTabButtons[k].classList.toggle('active', k === fmt);
    }
    formatTextarea.value = formatsVal[fmt] ?? '';
    formatHintEl.textContent = FORMAT_HINTS[fmt];

    if (fmt === 'urgent' && !urgentEnabledVal) {
      urgentOptinBox.hidden = false;
      formatTextarea.disabled = true;
      formatClip.refreshState(true);
    } else {
      urgentOptinBox.hidden = true;
      formatTextarea.disabled = readOnly;
      formatClip.refreshState(readOnly);
    }
    updateMeters();
  }

  for (const k of FORMAT_KEYS) {
    formatTabButtons[k].addEventListener('click', () => switchFormatTab(k));
  }

  function renderFactsList(): void {
    clear(factsListHost);
    factsSummaryBadge.textContent = `${factsVal.length} عناصر موثقة`;

    if (factsVal.length === 0) {
      factsListHost.append(
        h('p', { class: 'note', id: 'facts-empty-note' }, 'لا توجد حقائق مضافة بعد. أضف الحقائق الأساسية والأرقام والنواقص من نص المصدر للمقارنة.'),
      );
      return;
    }

    factsVal.forEach((f, idx) => {
      const rowClass = f.type === 'missing' ? 'fact-row is-missing' : f.type === 'review-req' ? 'fact-row is-review-req' : 'fact-row';
      const delBtn = h(
        'button',
        {
          type: 'button',
          class: 'btn btn-sm',
          disabled: readOnly,
          onClick: () => {
            factsVal.splice(idx, 1);
            renderFactsList();
            triggerEdit();
          },
        },
        'حذف',
      );
      factsListHost.append(
        h(
          'div',
          { class: rowClass },
          h('span', { class: 'fact-label' }, f.label),
          h('span', { class: 'fact-val' }, f.value),
          h('span', { class: `fact-type-badge ${f.type}` }, f.status),
          readOnly ? null : delBtn,
        ),
      );
    });
  }

  function renderBlockerAndApprovalState(): void {
    if (!story) return;
    const isDraft = story.status === 'مسودة';
    const isReview = story.status === 'قيد المراجعة';
    const isApproved = story.status === 'معتمد';
    const isPublished = story.status === 'منشور';
    const isExcluded = story.status === 'مستبعد';

    startReviewBanner.hidden = !isDraft;

    const effectiveBlocker = hasBlockerVal || factsVal.some((f) => f.type === 'review-req');
    blockerBox.hidden = !effectiveBlocker;
    if (effectiveBlocker) {
      blockerReasonSpan.textContent =
        blockerReasonVal || 'يوجد عنصر يتطلب مراجعة إسناد إلزامية أو مانع تحريري نشط يمنع الاعتماد.';
    }

    const sourceSufficient = (story.sourceText ?? '').trim().length >= LIMITS.minExtractedChars && (story.sourceName ?? '').trim().length > 0;
    const checksComplete = chkFacts.checked && chkAttribution.checked;
    const canApprove = isReview && sourceSufficient && !effectiveBlocker && checksComplete && !readOnly;

    approveBtn.disabled = !canApprove;

    if (isApproved) {
      readinessBadge.className = 'sufficiency-badge ready';
      readinessBadge.textContent = 'الخبر معتمد رسمياً';
      postApprovalBox.hidden = false;
      const markBtn = postApprovalBox.querySelector('#btn-mark-published') as HTMLButtonElement | null;
      if (markBtn) markBtn.hidden = false;
    } else if (isPublished) {
      readinessBadge.className = 'sufficiency-badge ready';
      readinessBadge.textContent = 'الخبر منشور ومؤرشف';
      postApprovalBox.hidden = false;
      const titleEl = postApprovalBox.querySelector('#post-approval-title');
      const descEl = postApprovalBox.querySelector('#post-approval-desc');
      const markBtn = postApprovalBox.querySelector('#btn-mark-published') as HTMLButtonElement | null;
      if (titleEl) titleEl.textContent = 'تم نشر هذا الخبر وتسجيله في الأرشيف. ';
      if (descEl) descEl.textContent = story.publishedAt ? `تاريخ التسجيل: ${new Date(story.publishedAt).toLocaleString('ar-IQ')}` : '';
      if (markBtn) markBtn.hidden = true;
    } else if (isExcluded) {
      readinessBadge.className = 'sufficiency-badge short';
      readinessBadge.textContent = `خبر مستبعد (${story.excludeReason || 'بدون سبب'})`;
      postApprovalBox.hidden = true;
    } else if (canApprove) {
      readinessBadge.className = 'sufficiency-badge ready';
      readinessBadge.textContent = 'مستوفٍ لجميع شروط الاعتماد البشري';
      postApprovalBox.hidden = true;
    } else {
      readinessBadge.className = 'sufficiency-badge short';
      if (isDraft) readinessBadge.textContent = 'الخبر في مرحلة مسودة — اضغط «بدء المراجعة الرسمية» أولاً';
      else if (!sourceSufficient) readinessBadge.textContent = 'مادة المصدر غير كافية (أقل من 50 حرفاً أو بلا اسم مصدر)';
      else if (effectiveBlocker) readinessBadge.textContent = 'يوجد مانع تحريري يمنع الاعتماد';
      else readinessBadge.textContent = 'بانتظار تأكيد مربعات التحقق البشري الاثنين';
      postApprovalBox.hidden = true;
    }
  }

  function hasExistingEditorialContent(): boolean {
    if (headlineInput.value.trim().length > 0) return true;
    const currentFmtVal = formatTextarea.value.trim();
    if (currentFmtVal.length > 0) return true;
    return FORMAT_KEYS.some((k) => (formatsVal[k] ?? '').trim().length > 0);
  }

  function updateAiButtonLabel(): void {
    if (aiExtracting) {
      aiGenerateBtn.textContent = 'جارٍ التوليد…';
      aiGenerateBtn.disabled = true;
      return;
    }
    aiGenerateBtn.disabled = readOnly;
    aiGenerateBtn.textContent = hasExistingEditorialContent()
      ? '↻ إعادة التوليد (AI)'
      : '✨ توليد بالذكاء الاصطناعي';
  }

  function applyStoryToWorkspace(s: StoryDto): void {
    story = s;
    readOnly = !EDITABLE_STATUSES.includes(s.status);

    sourceNameEl.textContent = s.sourceName || 'غير محدد';
    sourceDateCatEl.textContent = `${s.publishDate || 'بدون تاريخ'} • ${s.category || 'بدون تصنيف'} (${s.sourceLang || 'العربية'})`;
    sourceUrlEl.textContent = s.sourceUrl || 'لا يوجد رابط محفوظ';
    sourceBodyEl.textContent = s.sourceText || '(لا يوجد نص أصلي محفوظ بعد)';

    headlineVal = s.headline;
    confirmedHeadline = s.headline;
    headlineInput.value = s.headline;

    formatsVal = { ...s.formats };
    confirmedFormats = { ...s.formats };
    formatTextarea.value = formatsVal[activeFormat] ?? '';

    selectedFormatsVal = s.selectedFormats.length > 0 ? [...s.selectedFormats] : ['radio', 'web', 'facebook'];
    confirmedSelectedFormats = [...selectedFormatsVal];
    urgentEnabledVal = s.urgentEnabled || selectedFormatsVal.includes('urgent');
    confirmedUrgentEnabled = urgentEnabledVal;

    for (const fmt of FORMAT_KEYS) {
      reviewFormatCheckboxes[fmt].checked = selectedFormatsVal.includes(fmt);
      reviewFormatCheckboxes[fmt].disabled = readOnly;
    }

    factsVal = s.facts.map((f) => ({ ...f }));
    confirmedFactsJson = JSON.stringify(factsVal);

    hasBlockerVal = s.hasBlocker;
    confirmedHasBlocker = s.hasBlocker;
    blockerReasonVal = s.blockerReason;
    confirmedBlockerReason = s.blockerReason;

    chkFacts.checked = s.checks.factsVerified;
    chkAttribution.checked = s.checks.attributionVerified;
    chkFacts.disabled = readOnly;
    chkAttribution.disabled = readOnly;

    headlineInput.disabled = readOnly;
    headlineClip.refreshState(readOnly);
    newFactLabel.disabled = readOnly;
    newFactValue.disabled = readOnly;
    newFactType.disabled = readOnly;
    addFactBtn.disabled = readOnly;
    flagBlockerBtn.disabled = readOnly;
    excludeTriggerBtn.disabled = readOnly;
    saveDraftBtn.disabled = readOnly;

    if (s.aiMetadata?.usage) {
      aiStatusBanner.textContent = `آخر توليد AI: ${s.aiMetadata.usage.model} (${s.aiMetadata.usage.totalTokens} توكن • ${s.aiMetadata.usage.latencyMs}ms)`;
    }

    switchFormatTab(activeFormat);
    renderFactsList();
    renderBlockerAndApprovalState();
    updateAiButtonLabel();

    opts.onStoryUpdated?.({
      id: s.id,
      headline: s.headline || s.sourceName || 'خبر قيد التحرير',
      status: s.status,
    });
  }

  function buildPatchDiff(): StoryPatchBody {
    formatsVal[activeFormat] = formatTextarea.value;
    headlineVal = headlineInput.value;

    const patch: StoryPatchBody = {};
    if (headlineVal !== confirmedHeadline) patch.headline = headlineVal;

    const fmtDiff: Partial<StoryFormats> = {};
    for (const k of FORMAT_KEYS) {
      if (formatsVal[k] !== confirmedFormats[k]) {
        fmtDiff[k] = formatsVal[k];
      }
    }
    if (Object.keys(fmtDiff).length > 0) patch.formats = fmtDiff;

    const selSorted = [...selectedFormatsVal].sort().join(',');
    const confSorted = [...confirmedSelectedFormats].sort().join(',');
    if (selSorted !== confSorted) {
      patch.selectedFormats = [...selectedFormatsVal];
    }
    if (urgentEnabledVal !== confirmedUrgentEnabled) {
      patch.urgentEnabled = urgentEnabledVal;
    }

    const currentFactsStr = JSON.stringify(factsVal);
    if (currentFactsStr !== confirmedFactsJson) {
      patch.facts = factsVal.map((f) => ({ ...f }));
    }

    if (hasBlockerVal !== confirmedHasBlocker) {
      patch.hasBlocker = hasBlockerVal;
    }
    if (blockerReasonVal !== confirmedBlockerReason) {
      patch.blockerReason = blockerReasonVal;
    }

    return patch;
  }

  async function runSave(): Promise<void> {
    if (!id || readOnly) return;
    const startVer = version;
    const patch = buildPatchDiff();
    if (Object.keys(patch).length === 0) {
      savedVersion = startVer;
      setState('saved');
      return;
    }

    setState('saving');
    try {
      const { story: updated } = await api.patchStory(id, patch);
      story = updated;
      confirmedHeadline = updated.headline;
      confirmedFormats = { ...updated.formats };
      confirmedSelectedFormats = [...updated.selectedFormats];
      confirmedUrgentEnabled = updated.urgentEnabled;
      confirmedFactsJson = JSON.stringify(updated.facts);
      confirmedHasBlocker = updated.hasBlocker;
      confirmedBlockerReason = updated.blockerReason;
      // Sync verification checkboxes (in case server reset them on substantive edit)
      chkFacts.checked = updated.checks.factsVerified;
      chkAttribution.checked = updated.checks.attributionVerified;
      savedVersion = startVer;
      renderBlockerAndApprovalState();
      opts.onStoryUpdated?.({
        id: updated.id,
        headline: updated.headline || updated.sourceName || 'خبر قيد التحرير',
        status: updated.status,
      });
      if (version === startVer) setState('saved');
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        opts.onSessionLost();
      }
      setState('failed');
    }
  }

  function save(): Promise<void> {
    clearTimeout(debounceTimer);
    if (disposed || readOnly) return Promise.resolve();
    if (currentSave) return currentSave;
    currentSave = (async () => {
      try {
        await runSave();
      } finally {
        currentSave = null;
      }
      if (!disposed && state !== 'failed' && version > savedVersion) await save();
    })();
    return currentSave;
  }

  function triggerEdit(): void {
    if (readOnly) return;
    formatsVal[activeFormat] = formatTextarea.value;
    headlineVal = headlineInput.value;
    version++;
    updateMeters();
    updateAiButtonLabel();
    setState('saving');
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void save(), AUTOSAVE_DEBOUNCE_MS);
  }

  async function handleAiExtract(overwriteExisting: boolean): Promise<void> {
    if (!id || readOnly || aiExtracting) return;
    aiOverwriteConfirmBox.hidden = true;
    aiInsightsBox.hidden = true;
    aiExtracting = true;
    updateAiButtonLabel();

    try {
      await save();
      const res = await api.extractStory(id, { overwriteExisting });
      if (disposed) return;

      applyStoryToWorkspace(res.story);
      aiStatusBanner.textContent = `آخر توليد AI: ${res.usage.model} (${res.usage.totalTokens} توكن • ${res.usage.latencyMs}ms)`;

      const parts: string[] = [
        `تم التوليد الآلي (${res.usage.model} • ${res.usage.totalTokens} توكن • ${res.usage.latencyMs}ms).`,
      ];
      if (res.editorialNotes?.trim()) {
        parts.push(`ملاحظات تحريرية: ${res.editorialNotes.trim()}`);
      }
      if (res.preservedManualFormats && res.preservedManualFormats.length > 0) {
        parts.push('تم الحفاظ على الصياغات المحررة يدوياً.');
      }
      if (res.numberWarnings && res.numberWarnings.length > 0) {
        parts.push(`تنبيهات مطابقة الأرقام: ${res.numberWarnings.join(' — ')}`);
        aiInsightsBox.className = 'alert alert-warn compact-alert';
      } else {
        aiInsightsBox.className = 'alert alert-info compact-alert';
      }
      aiInsightsBox.textContent = parts.join(' | ');
      aiInsightsBox.hidden = false;
    } catch (err) {
      if (disposed) return;
      if (err instanceof ApiError && err.isUnauthenticated) {
        opts.onSessionLost();
        return;
      }
      const serverMsg =
        err instanceof ApiError
          ? ((err.detail as { message?: string } | null)?.message ?? undefined)
          : undefined;
      const fallbackMsg = 'تعذّر تشغيل التوليد الآلي حالياً. يمكنك متابعة التحرير اليدوي بشكل كامل.';
      aiInsightsBox.className = 'alert alert-warn compact-alert';
      aiInsightsBox.textContent = serverMsg
        ? `${serverMsg} — يمكنك متابعة التحرير اليدوي بشكل كامل.`
        : fallbackMsg;
      aiInsightsBox.hidden = false;
    } finally {
      if (!disposed) {
        aiExtracting = false;
        updateAiButtonLabel();
      }
    }
  }

  aiGenerateBtn.addEventListener('click', () => {
    if (readOnly || aiExtracting) return;
    if (hasExistingEditorialContent()) {
      aiOverwriteConfirmBox.hidden = false;
    } else {
      aiOverwriteConfirmBox.hidden = true;
      void handleAiExtract(false);
    }
  });

  aiFillEmptyBtn.addEventListener('click', () => {
    aiOverwriteConfirmBox.hidden = true;
    void handleAiExtract(false);
  });

  aiOverwriteAllBtn.addEventListener('click', () => {
    aiOverwriteConfirmBox.hidden = true;
    void handleAiExtract(true);
  });

  aiCancelOverwriteBtn.addEventListener('click', () => {
    aiOverwriteConfirmBox.hidden = true;
  });

  // ---- Event Listeners ------------------------------------------------------------------------
  headlineInput.addEventListener('input', triggerEdit);
  formatTextarea.addEventListener('input', triggerEdit);
  saveDraftBtn.addEventListener('click', () => void save());

  for (const fmt of FORMAT_KEYS) {
    reviewFormatCheckboxes[fmt].addEventListener('change', () => {
      selectedFormatsVal = FORMAT_KEYS.filter((k) => reviewFormatCheckboxes[k].checked);
      urgentEnabledVal = selectedFormatsVal.includes('urgent');
      if (activeFormat === 'urgent') {
        urgentOptinBox.hidden = urgentEnabledVal;
        formatTextarea.disabled = !urgentEnabledVal || readOnly;
        formatClip.refreshState(!urgentEnabledVal || readOnly);
      }
      triggerEdit();
    });
  }

  const enableUrgentBtn = urgentOptinBox.querySelector('#btn-enable-urgent');
  enableUrgentBtn?.addEventListener('click', () => {
    urgentEnabledVal = true;
    if (!selectedFormatsVal.includes('urgent')) selectedFormatsVal.push('urgent');
    reviewFormatCheckboxes.urgent.checked = true;
    urgentOptinBox.hidden = true;
    formatTextarea.disabled = readOnly;
    formatClip.refreshState(readOnly);
    formatTextarea.focus();
    triggerEdit();
  });

  copyFormatBtn.addEventListener('click', () => {
    const txt = formatTextarea.value.trim();
    if (!txt) return;
    void navigator.clipboard?.writeText(txt);
    const old = copyFormatBtn.textContent;
    copyFormatBtn.textContent = '✓ تم النسخ للحافظة';
    setTimeout(() => {
      copyFormatBtn.textContent = old;
    }, 1800);
  });

  addFactBtn.addEventListener('click', () => {
    const label = newFactLabel.value.trim();
    const value = newFactValue.value.trim();
    const fType = newFactType.value as FactType;
    if (!label || !value) return;

    const fStatus =
      fType === 'missing'
        ? 'غير مذكور في المصدر'
        : fType === 'review-req'
          ? 'المتحدث غير محدد — مراجعة إلزامية'
          : 'وارد في المصدر';

    factsVal.push({ label, value, status: fStatus, type: fType });
    if (fType === 'review-req') {
      hasBlockerVal = true;
      if (!blockerReasonVal) blockerReasonVal = `يوجد عنصر يتطلب مراجعة إسناد: ${label}`;
    }
    newFactLabel.value = '';
    newFactValue.value = '';
    renderFactsList();
    renderBlockerAndApprovalState();
    triggerEdit();
  });

  flagBlockerBtn.addEventListener('click', () => {
    hasBlockerVal = true;
    blockerReasonVal = 'تم تسجيل مانع تحريري يدوي للمراجعة والتدقيق قبل الاعتماد.';
    renderBlockerAndApprovalState();
    triggerEdit();
  });

  resolveBlockerBtn.addEventListener('click', () => {
    void (async () => {
      if (!id) return;
      const note = resolveNoteInput.value.trim();
      if (!note) {
        resolveNoteInput.focus();
        return;
      }
      await save();
      try {
        const { story: updated } = await api.resolveBlocker(id, note);
        resolveNoteInput.value = '';
        applyStoryToWorkspace(updated);
      } catch (err) {
        if (err instanceof ApiError && err.isUnauthenticated) opts.onSessionLost();
      }
    })();
  });

  async function handleStartReview(): Promise<void> {
    if (!id) return;
    actionAlertBox.hidden = true;
    await save();
    try {
      const { story: updated } = await api.startReview(id);
      applyStoryToWorkspace(updated);
    } catch (err) {
      actionAlertBox.hidden = false;
      actionAlertBox.textContent =
        err instanceof ApiError && err.status === 400
          ? 'لا يمكن بدء المراجعة قبل إدخال اسم المصدر ونص أصلي لا يقل عن 50 حرفاً.'
          : 'تعذّر بدء المراجعة. تحقق من حفظ بيانات المصدر.';
    }
  }

  async function handleChecksChange(): Promise<void> {
    if (!id || readOnly) return;
    // Flush any pending content edits first so they don't overwrite checks
    await save();
    try {
      const { checks } = await api.updateChecks(id, {
        factsVerified: chkFacts.checked,
        attributionVerified: chkAttribution.checked,
      });
      if (story) {
        story.checks = checks;
      }
      chkFacts.checked = checks.factsVerified;
      chkAttribution.checked = checks.attributionVerified;
      renderBlockerAndApprovalState();
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) opts.onSessionLost();
    }
  }

  chkFacts.addEventListener('change', () => void handleChecksChange());
  chkAttribution.addEventListener('change', () => void handleChecksChange());

  approveBtn.addEventListener('click', () => {
    void (async () => {
      if (!id) return;
      actionAlertBox.hidden = true;
      await save();
      try {
        const { story: updated } = await api.approveStory(id);
        applyStoryToWorkspace(updated);
      } catch (err) {
        if (err instanceof ApiError) {
          const detail = err.detail as { reasons?: string[] } | undefined;
          const reasons = detail?.reasons?.join(' — ') || 'شروط الاعتماد البشري غير مستوفاة.';
          actionAlertBox.hidden = false;
          actionAlertBox.textContent = `تعذّر الاعتماد: ${reasons}`;
        }
      }
    })();
  });

  const markPublishedBtn = postApprovalBox.querySelector('#btn-mark-published');
  markPublishedBtn?.addEventListener('click', () => {
    void (async () => {
      if (!id) return;
      actionAlertBox.hidden = true;
      try {
        const { story: updated } = await api.publishStory(id);
        applyStoryToWorkspace(updated);
      } catch {
        actionAlertBox.hidden = false;
        actionAlertBox.textContent = 'تعذّر تسجيل النشر؛ يجب أن يكون الخبر في حالة «معتمد» أولاً.';
      }
    })();
  });

  excludeTriggerBtn.addEventListener('click', () => {
    excludeBox.hidden = false;
    excludeReasonInput.focus();
  });

  confirmExcludeBtn.addEventListener('click', () => {
    void (async () => {
      if (!id) return;
      const reason = excludeReasonInput.value.trim();
      if (!reason) {
        excludeReasonInput.focus();
        return;
      }
      await save();
      try {
        const { story: updated } = await api.excludeStory(id, reason);
        excludeBox.hidden = true;
        applyStoryToWorkspace(updated);
      } catch {
        actionAlertBox.hidden = false;
        actionAlertBox.textContent = 'تعذّر استبعاد المسودة.';
      }
    })();
  });

  // ---- Initial Load ---------------------------------------------------------------------------
  void (async () => {
    try {
      const { story: loaded } = await api.getStory(id);
      if (disposed) return;
      applyStoryToWorkspace(loaded);
    } catch (err) {
      if (disposed) return;
      clear(container);
      if (err instanceof ApiError && err.isUnauthenticated) {
        opts.onSessionLost();
        return;
      }
      container.append(
        h(
          'article',
          { class: 'card', id: 'load-error' },
          h('h2', { class: 'card-title' }, 'الخبر غير موجود'),
          h('p', { class: 'card-sub' }, 'تعذّر العثور على هذا الخبر في قاعدة البيانات.'),
          h(
            'p',
            {},
            h('button', { type: 'button', class: 'btn', onClick: () => opts.navigate('/stories/new') }, 'خبر جديد'),
          ),
        ),
      );
    }
  })();

  return {
    hasUnsaved: () => version > savedVersion || state === 'failed',
    async flush(): Promise<boolean> {
      for (let i = 0; i < 3 && (version > savedVersion || state === 'failed'); i++) {
        await save();
      }
      return !(version > savedVersion) && state !== 'failed';
    },
    dispose(): void {
      disposed = true;
      clearTimeout(debounceTimer);
    },
  };
}
