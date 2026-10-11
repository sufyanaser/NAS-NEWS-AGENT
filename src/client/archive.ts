/** Archive & Automatic Multi-Format Classification ("الأرشيف") backed by D1 queries. */
import { CATEGORIES, FORMAT_LABELS, STORY_STATUSES } from '../shared/contracts';
import type { ArchiveCountsDto, FormatKey, StoryStatus, StorySummaryDto } from '../shared/contracts';
import { ApiError, api } from './api';
import { clear, h } from './dom';
import type { EditorHandle } from './editor';

export interface ArchiveOptions {
  navigate: (path: string) => void;
  onSessionLost: () => void;
  onCountsUpdated?: (total: number) => void;
}

type FormatFilter = 'all' | FormatKey;
type StatusFilter = 'all' | StoryStatus;

interface SectionCardMeta {
  key: FormatFilter;
  title: string;
  sub: string;
  icon: string;
}

const SECTION_CARDS: SectionCardMeta[] = [
  {
    key: 'all',
    title: 'جميع الأخبار',
    sub: 'كامل السجلات बिना تكرار',
    icon: '/assets/icons/nav-drafts.png',
  },
  {
    key: 'radio',
    title: 'قسم الراديو',
    sub: 'موجز إذاعي ونشرات الهواء',
    icon: '/assets/icons/format-radio.png',
  },
  {
    key: 'web',
    title: 'قسم الموقع الإلكتروني',
    sub: 'أخبار وتقارير الموقع الرقمي',
    icon: '/assets/icons/format-web.png',
  },
  {
    key: 'facebook',
    title: 'قسم فيسبوك والتواصل',
    sub: 'منشورات منصات التواصل الاجتماعي',
    icon: '/assets/icons/format-podcast.png',
  },
  {
    key: 'urgent',
    title: 'قسم العاجل',
    sub: 'الأخبار المفعّل لها شريط عاجل',
    icon: '/assets/icons/format-urgent.png',
  },
];

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' });
}

export function mountArchive(container: HTMLElement, opts: ArchiveOptions): EditorHandle {
  let disposed = false;
  let activeFormat: FormatFilter = 'all';
  let activeStatus: StatusFilter = 'all';
  let activeCategory = '';
  let searchQuery = '';
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  let stories: StorySummaryDto[] = [];
  let counts: ArchiveCountsDto = {
    total: 0,
    byStatus: {},
    byFormat: { radio: 0, web: 0, facebook: 0, urgent: 0 },
  };

  // Fix typo in Arabic subtitle for 'all' card
  SECTION_CARDS[0]!.sub = 'كامل السجلات المحفوظة دون تكرار';

  const sectionCardsHost = h('div', { class: 'archive-format-cards', id: 'archive-format-cards', role: 'tablist', 'aria-label': 'أقسام الأرشيف حسب الصيغة' });
  const searchInput = h('input', {
    id: 'archive-search',
    class: 'input',
    type: 'search',
    placeholder: 'ابحث في العناوين، اسم المصدر، أو نص الخبر…',
  });
  const categorySelect = h(
    'select',
    { id: 'archive-category', class: 'select' },
    h('option', { value: '' }, 'جميع التصنيفات الموضوعية'),
    ...CATEGORIES.map((c) => h('option', { value: c }, c)),
  );
  const statusPillsHost = h('div', { class: 'filter-pills', id: 'archive-status-pills', role: 'group', 'aria-label': 'تصفية حسب الحالة التحريرية' });
  const listHost = h('div', { id: 'archive-list-host' });

  function getFormatCount(key: FormatFilter): number {
    if (key === 'all') return counts.total;
    return counts.byFormat[key] ?? 0;
  }

  const sectionButtons = new Map<FormatFilter, { btn: HTMLButtonElement; countEl: HTMLElement }>();

  for (const meta of SECTION_CARDS) {
    const countEl = h('span', { class: 'fmt-card-count', id: `archive-count-${meta.key}` }, '0');
    const btn = h(
      'button',
      {
        type: 'button',
        class: `fmt-section-card${activeFormat === meta.key ? ' active' : ''}`,
        'data-fmt': meta.key,
        id: `archive-fmt-${meta.key}`,
        role: 'tab',
        'aria-selected': activeFormat === meta.key ? 'true' : 'false',
        onClick: () => {
          activeFormat = meta.key;
          renderSectionCards();
          void loadArchive();
        },
      },
      h('img', { src: meta.icon, alt: '', width: '38', height: '38' }),
      h(
        'div',
        { class: 'fmt-card-info' },
        h('span', { class: 'fmt-card-title' }, meta.title),
        h('span', { class: 'fmt-card-sub' }, meta.sub),
      ),
      countEl,
    );
    sectionButtons.set(meta.key, { btn, countEl });
    sectionCardsHost.append(btn);
  }

  function renderSectionCards(): void {
    for (const meta of SECTION_CARDS) {
      const ref = sectionButtons.get(meta.key);
      if (!ref) continue;
      const isActive = activeFormat === meta.key;
      ref.btn.classList.toggle('active', isActive);
      ref.btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      ref.countEl.textContent = String(getFormatCount(meta.key));
    }
  }

  function renderStatusPills(): void {
    clear(statusPillsHost);
    const statuses: { key: StatusFilter; label: string }[] = [
      { key: 'all', label: `الكل (${counts.total})` },
      ...STORY_STATUSES.map((st) => ({
        key: st as StatusFilter,
        label: `${st} (${counts.byStatus[st] ?? 0})`,
      })),
    ];

    for (const st of statuses) {
      const isActive = activeStatus === st.key;
      statusPillsHost.append(
        h(
          'button',
          {
            type: 'button',
            class: `filter-pill${isActive ? ' active' : ''}`,
            'data-status-filter': st.key,
            onClick: () => {
              activeStatus = st.key;
              renderStatusPills();
              void loadArchive();
            },
          },
          st.label,
        ),
      );
    }
  }

  function renderList(loading = false, errorMsg = ''): void {
    clear(listHost);
    if (loading) {
      listHost.append(h('p', { class: 'note', id: 'archive-loading' }, 'جارٍ تحميل سجلات الأرشيف…'));
      return;
    }
    if (errorMsg) {
      listHost.append(h('div', { class: 'alert alert-danger', id: 'archive-error', role: 'alert' }, errorMsg));
      return;
    }
    if (stories.length === 0) {
      listHost.append(
        h(
          'div',
          { class: 'card', id: 'archive-empty' },
          h('h3', { class: 'card-title' }, 'لا توجد أخبار مطابقة لمعايير التصفية الحالية'),
          h('p', { class: 'card-sub' }, 'جرّب تغيير قسم الصيغة أو الحالة أو البحث، أو ابدأ بإدخال مادة خبرية جديدة.'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-primary',
              onClick: () => opts.navigate('/stories/new'),
            },
            '+ خبر جديد',
          ),
        ),
      );
      return;
    }

    listHost.append(
      h(
        'ul',
        { class: 'draft-list', id: 'archive-list' },
        ...stories.map((s) => {
          const formats = [...s.selectedFormats];
          if (s.urgentEnabled && !formats.includes('urgent')) {
            formats.push('urgent');
          }
          const displayTitle = s.headline || s.sourceName || 'مسودة بدون عنوان';
          return h(
            'li',
            { class: 'draft-item', 'data-story-id': s.id },
            h(
              'div',
              { class: 'card-head' },
              h(
                'div',
                {},
                h(
                  'a',
                  {
                    href: `/stories/${s.id}/review`,
                    class: 'draft-title',
                    onClick: (e: Event) => {
                      e.preventDefault();
                      opts.navigate(`/stories/${s.id}/review`);
                    },
                  },
                  displayTitle,
                ),
                h('div', { class: 'draft-preview' }, s.textPreview || '(لا يوجد نص مصدر بعد)'),
                h(
                  'div',
                  { class: 'draft-meta' },
                  h('span', { class: 'badge', 'data-status': s.status }, s.status),
                  ...formats.map((fmt) => h('span', { class: 'fmt-pill', 'data-fmt': fmt }, FORMAT_LABELS[fmt])),
                  s.category ? h('span', { class: 'badge' }, s.category) : null,
                  s.sourceName ? h('span', {}, `المصدر: ${s.sourceName}`) : null,
                  h('span', {}, `آخر تحديث: ${formatWhen(s.updatedAt)}`),
                ),
              ),
              h(
                'div',
                { class: 'stack-row' },
                h(
                  'a',
                  {
                    href: `/stories/${s.id}/review`,
                    class: 'btn btn-sm btn-primary',
                    onClick: (e: Event) => {
                      e.preventDefault();
                      opts.navigate(`/stories/${s.id}/review`);
                    },
                  },
                  'المراجعة والتحرير',
                ),
                h(
                  'a',
                  {
                    href: `/stories/${s.id}`,
                    class: 'btn btn-sm',
                    onClick: (e: Event) => {
                      e.preventDefault();
                      opts.navigate(`/stories/${s.id}`);
                    },
                  },
                  'بيانات المصدر',
                ),
              ),
            ),
          );
        }),
      ),
    );
  }

  async function loadArchive(): Promise<void> {
    renderList(true);
    try {
      const res = await api.listStories({
        limit: 50,
        format: activeFormat === 'all' ? undefined : activeFormat,
        status: activeStatus === 'all' ? undefined : activeStatus,
        category: activeCategory || undefined,
        q: searchQuery.trim() || undefined,
      });
      if (disposed) return;
      stories = res.stories;
      if (res.counts) {
        counts = res.counts;
        opts.onCountsUpdated?.(counts.total);
      }
      renderSectionCards();
      renderStatusPills();
      renderList(false);
    } catch (err) {
      if (disposed) return;
      if (err instanceof ApiError && err.isUnauthenticated) {
        opts.onSessionLost();
        return;
      }
      renderList(false, 'تعذّر تحميل سجلات الأرشيف. تحقق من الاتصال ثم أعد المحاولة.');
    }
  }

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void loadArchive(), 280);
  });

  categorySelect.addEventListener('change', () => {
    activeCategory = categorySelect.value;
    void loadArchive();
  });

  renderSectionCards();
  renderStatusPills();

  container.append(
    h(
      'div',
      { class: 'archive-fit-stack' },
      h(
        'section',
        { class: 'card archive-top-card' },
        h(
          'div',
          { class: 'card-head compact-head' },
          h(
            'div',
            { class: 'title-with-icon' },
            h('img', { src: '/assets/icons/nav-drafts.png', alt: '', class: 'section-icon', width: '20', height: '20' }),
            h('h2', { class: 'card-title' }, 'أرشيف الأخبار والمسودات والتصنيف التلقائي'),
          ),
          h('span', { class: 'note' }, 'استكمل المسودات المحفوظة أو تصفّح الأخبار المعتمدة والمنشورة حسب القسم أو الحالة'),
        ),
        sectionCardsHost,
      ),
      h(
        'section',
        { class: 'card archive-list-card' },
        h(
          'div',
          { class: 'archive-filters-bar' },
          h('div', { class: 'stack-row' }, searchInput, categorySelect),
          statusPillsHost,
        ),
        listHost,
      ),
    ),
  );

  void loadArchive();

  return {
    hasUnsaved: () => false,
    flush: async () => true,
    dispose: () => {
      disposed = true;
      clearTimeout(searchTimer);
    },
  };
}
