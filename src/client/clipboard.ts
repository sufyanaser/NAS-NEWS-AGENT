/**
 * Contextual Copy/Paste Actions (Phase 6).
 * Floating micro-toolbar inside field boundaries supporting hover, keyboard focus-within, and touch.
 * Uses Clipboard API with permission error handling and only confirms success after the promise resolves.
 */
import { h } from './dom';

export interface CopyPasteOptions {
  /** Label for copy button (default: 'نسخ') */
  copyLabel?: string;
  /** Label for paste button (default: 'لصق') */
  pasteLabel?: string;
  /** If true, only show Copy when the field has a non-empty value (e.g. Source URL) */
  copyOnlyWhenNonEmpty?: boolean;
  /** If true, never show Paste (for read-only elements or locked states) */
  readOnly?: boolean;
  /** Positioning mode: 'singleline' (vertically centered on left) or 'multiline' (top-left corner) */
  multiline?: boolean;
}

export interface CopyPasteHandle {
  wrapper: HTMLElement;
  refreshState: (isReadOnly?: boolean) => void;
}

/**
 * Wraps an `<input>` or `<textarea>` in a `.field-clip-wrap` container with contextual copy/paste buttons.
 */
export function wrapWithCopyPaste(
  fieldEl: HTMLInputElement | HTMLTextAreaElement,
  opts: CopyPasteOptions = {},
): CopyPasteHandle {
  let forceReadOnly = Boolean(opts.readOnly);
  const copyLabel = opts.copyLabel ?? 'نسخ';
  const pasteLabel = opts.pasteLabel ?? 'لصق';

  const statusPill = h('span', {
    class: 'ctx-clip-feedback',
    'data-clip-feedback': fieldEl.id,
    role: 'status',
    'aria-live': 'polite',
    hidden: true,
  });

  const copyBtn = h(
    'button',
    {
      type: 'button',
      class: 'ctx-clip-btn ctx-btn-copy',
      'data-clip-action': 'copy',
      'data-clip-copy': fieldEl.id,
      'aria-label': copyLabel,
      title: copyLabel,
    },
    copyLabel,
  );

  const pasteBtn = h(
    'button',
    {
      type: 'button',
      class: 'ctx-clip-btn ctx-btn-paste',
      'data-clip-action': 'paste',
      'data-clip-paste': fieldEl.id,
      'aria-label': pasteLabel,
      title: pasteLabel,
    },
    pasteLabel,
  );

  const toolbar = h(
    'div',
    {
      class: `ctx-clip-bar${opts.multiline ? ' is-multiline' : ' is-singleline'}`,
      role: 'group',
      'aria-label': 'أدوات النسخ واللصق السريعة',
    },
    statusPill,
    copyBtn,
    pasteBtn,
  );

  const wrapper = h(
    'div',
    { class: `field-clip-wrap${opts.multiline ? ' wrap-multiline' : ' wrap-singleline'}` },
    fieldEl,
    toolbar,
  );

  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

  function showFeedback(text: string, isError = false): void {
    clearTimeout(feedbackTimer);
    statusPill.textContent = text;
    statusPill.className = `ctx-clip-feedback ${isError ? 'is-error' : 'is-ok'}`;
    statusPill.hidden = false;
    feedbackTimer = setTimeout(() => {
      statusPill.hidden = true;
    }, 1800);
  }

  function refreshState(isReadOnly?: boolean): void {
    if (isReadOnly !== undefined) {
      forceReadOnly = isReadOnly;
    }
    const effectivelyReadOnly = forceReadOnly || fieldEl.disabled || fieldEl.readOnly;
    pasteBtn.hidden = effectivelyReadOnly;

    if (opts.copyOnlyWhenNonEmpty) {
      copyBtn.hidden = fieldEl.value.trim().length === 0;
    } else {
      copyBtn.hidden = false;
    }
  }

  copyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void (async () => {
      const val = fieldEl.value;
      if (!val) {
        showFeedback('الحقل فارغ', true);
        return;
      }
      if (!navigator.clipboard?.writeText) {
        showFeedback('الحافظة غير مدعومة', true);
        return;
      }
      try {
        await navigator.clipboard.writeText(val);
        showFeedback('تم النسخ ✓', false);
      } catch {
        showFeedback('رفض إذن الحافظة', true);
      }
    })();
  });

  pasteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void (async () => {
      if (forceReadOnly || fieldEl.disabled || fieldEl.readOnly) return;
      if (!navigator.clipboard?.readText) {
        showFeedback('اللصق غير مدعوم', true);
        return;
      }
      try {
        const clipText = await navigator.clipboard.readText();
        if (!clipText) {
          showFeedback('الحافظة فارغة', true);
          return;
        }
        fieldEl.focus();
        fieldEl.value = clipText;
        fieldEl.dispatchEvent(new Event('input', { bubbles: true }));
        fieldEl.dispatchEvent(new Event('change', { bubbles: true }));
        refreshState();
        showFeedback('تم اللصق ✓', false);
      } catch {
        showFeedback('يرجى السماح بإذن اللصق', true);
      }
    })();
  });

  fieldEl.addEventListener('input', () => refreshState());
  fieldEl.addEventListener('change', () => refreshState());

  // Support touch activation without blocking typing
  wrapper.addEventListener(
    'touchstart',
    () => {
      wrapper.classList.add('touch-active');
    },
    { passive: true },
  );

  document.addEventListener(
    'touchstart',
    (e) => {
      if (!wrapper.contains(e.target as Node)) {
        wrapper.classList.remove('touch-active');
      }
    },
    { passive: true },
  );

  refreshState();

  return { wrapper, refreshState };
}

/**
 * Attaches a read-only contextual Copy button to a non-input reading container (e.g. Source Reading Box).
 */
export function wrapReadOnlyWithCopy(
  contentEl: HTMLElement,
  copyLabel = 'نسخ النص',
): HTMLElement {
  const statusPill = h('span', {
    class: 'ctx-clip-feedback',
    'data-clip-feedback': contentEl.id,
    role: 'status',
    'aria-live': 'polite',
    hidden: true,
  });
  const copyBtn = h(
    'button',
    {
      type: 'button',
      class: 'ctx-clip-btn ctx-btn-copy',
      'data-clip-action': 'copy',
      'data-clip-copy': contentEl.id,
      'aria-label': copyLabel,
      title: copyLabel,
    },
    copyLabel,
  );

  const toolbar = h(
    'div',
    { class: 'ctx-clip-bar is-multiline', role: 'group', 'aria-label': 'نسخ النص' },
    statusPill,
    copyBtn,
  );

  const wrapper = h('div', { class: 'field-clip-wrap wrap-multiline wrap-readonly', tabindex: '0' }, contentEl, toolbar);

  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

  copyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void (async () => {
      const text = (contentEl.textContent ?? '').trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        clearTimeout(feedbackTimer);
        statusPill.textContent = 'تم النسخ ✓';
        statusPill.className = 'ctx-clip-feedback is-ok';
        statusPill.hidden = false;
        feedbackTimer = setTimeout(() => {
          statusPill.hidden = true;
        }, 1800);
      } catch {
        clearTimeout(feedbackTimer);
        statusPill.textContent = 'رفض إذن الحافظة';
        statusPill.className = 'ctx-clip-feedback is-error';
        statusPill.hidden = false;
        feedbackTimer = setTimeout(() => {
          statusPill.hidden = true;
        }, 1800);
      }
    })();
  });

  wrapper.addEventListener(
    'touchstart',
    () => {
      wrapper.classList.add('touch-active');
    },
    { passive: true },
  );

  return wrapper;
}
