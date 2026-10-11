import { ApiError, api } from './api';
import { mountArchive } from './archive';
import { clear, h } from './dom';
import { mountEditor } from './editor';
import type { EditorHandle } from './editor';
import { mountReview } from './review';
import { mountSettings } from './settings';

const root = document.getElementById('app') as HTMLElement;
let userEmail = '';
let stationName = 'إذاعة ناس 98.7 FM';
let archiveTotalCount: number | null = null;
let activeStory: { id: string; headline: string; status: string } | null = null;
let editor: EditorHandle | null = null;

type NavKey = 'new' | 'review' | 'archive' | 'settings';

type Route =
  | { name: 'login' }
  | { name: 'new' }
  | { name: 'story'; id: string }
  | { name: 'review'; id: string | null }
  | { name: 'archive' }
  | { name: 'settings' };

function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/login') return { name: 'login' };
  if (path === '/archive') return { name: 'archive' };
  if (path === '/settings') return { name: 'settings' };
  if (path === '/review') return { name: 'review', id: activeStory?.id ?? null };
  const mReview = /^\/stories\/([0-9a-f-]{36})\/review$/.exec(path);
  if (mReview?.[1]) return { name: 'review', id: mReview[1] };
  const mStory = /^\/stories\/([0-9a-f-]{36})$/.exec(path);
  if (mStory?.[1]) return { name: 'story', id: mStory[1] };
  return { name: 'new' };
}

function disposeEditor(): void {
  editor?.dispose();
  editor = null;
}

/** SPA navigation. Never silently drops edits: pending ones are saved first, or the user must confirm. */
async function navigate(path: string, replace = false): Promise<void> {
  if (editor?.hasUnsaved()) {
    const ok = await editor.flush();
    if (!ok && !window.confirm('لم يُحفظ آخر تعديل على الخادم. المتابعة قد تفقده. هل تريد المغادرة؟')) return;
  }
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  await render();
}

function renderLogin(): void {
  disposeEditor();
  clear(root);
  const errorBox = h('div', { id: 'login-error', class: 'alert alert-danger', role: 'alert', hidden: true });
  const email = h('input', { id: 'login-email', class: 'input ltr', type: 'text', name: 'email', autocomplete: 'username', required: true, maxlength: '254' });
  const password = h('input', { id: 'login-password', class: 'input ltr', type: 'password', name: 'password', autocomplete: 'current-password', required: true, maxlength: '1024' });
  const submit = h('button', { type: 'submit', id: 'btn-login', class: 'btn btn-primary' }, 'دخول إلى غرفة الأخبار');

  const form = h(
    'form',
    { class: 'stack', novalidate: true },
    errorBox,
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'login-email' }, 'البريد الإلكتروني / اسم المستخدم'), email),
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'login-password' }, 'كلمة المرور'), password),
    submit,
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void (async () => {
      errorBox.hidden = true;
      if (!email.value.trim() || !password.value) {
        errorBox.textContent = 'أدخل البريد الإلكتروني وكلمة المرور.';
        errorBox.hidden = false;
        return;
      }
      submit.disabled = true;
      try {
        const res = await api.login(email.value, password.value);
        userEmail = res.user.email;
        password.value = '';
        await navigate('/stories/new');
      } catch (err) {
        password.value = '';
        errorBox.textContent =
          err instanceof ApiError && err.status === 401
            ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
            : err instanceof ApiError && err.status === 429
              ? 'محاولات كثيرة. انتظر دقيقة ثم أعد المحاولة.'
              : err instanceof ApiError && err.isNetwork
                ? 'تعذّر الاتصال بالخادم. تحقق من الاتصال ثم أعد المحاولة.'
                : 'تعذّر تسجيل الدخول بسبب خطأ في الخادم.';
        errorBox.hidden = false;
      } finally {
        submit.disabled = false;
      }
    })();
  });

  root.append(
    h(
      'main',
      { class: 'login-wrap' },
      h(
        'div',
        { class: 'login-box' },
        h(
          'div',
          { class: 'login-brand' },
          h('img', { src: '/icon-64.png', alt: 'NAS FM Logo', class: 'login-logo', width: '48', height: '48' }),
          h('span', { class: 'login-badge' }, 'NAS FM • NEWSROOM'),
          h('h1', {}, 'دخول المحرر'),
          h('p', {}, 'منصة التحرير الإخباري الداخلية — مستخدم واحد'),
        ),
        h('div', { class: 'card' }, form),
      ),
    ),
  );
  email.focus();
}

async function logout(): Promise<void> {
  if (editor?.hasUnsaved()) {
    const ok = await editor.flush();
    if (!ok && !window.confirm('لم يُحفظ آخر تعديل على الخادم. تسجيل الخروج قد يفقده. هل تريد المتابعة؟')) return;
  }
  try {
    await api.logout();
  } catch {
    // Even if the request failed we leave the app; the server-side session expires on its own.
  }
  userEmail = '';
  activeStory = null;
  await navigate('/login');
}

const PAGE_TITLES: Record<NavKey, string> = {
  new: 'خبر جديد / إدخال المصدر',
  review: 'المراجعة والتحرير والاعتماد',
  archive: 'أرشيف الأخبار والتصنيف التلقائي',
  settings: 'إعدادات غرفة الأخبار',
};

function renderShell(active: NavKey, content: (host: HTMLElement, topRefs: {
  updateActiveStory: (s: { id: string; headline: string; status: string } | null) => void;
  updateSaveState: (state: string, label: string) => void;
  updateArchiveCount: (count: number) => void;
  updateStationName: (name: string) => void;
}) => void): void {
  clear(root);

  const brandSub = h('small', { id: 'sidebar-station-name' }, stationName);
  const archiveBadge = h(
    'span',
    { class: 'nav-badge', id: 'nav-archive-count', hidden: archiveTotalCount === null },
    archiveTotalCount !== null ? String(archiveTotalCount) : '0',
  );

  const topStoryHeadline = h('span', { id: 'top-story-headline' }, activeStory?.headline ?? '');
  const topStoryStatus = h(
    'span',
    { id: 'top-story-status', class: 'badge', 'data-status': activeStory?.status ?? 'مسودة' },
    activeStory?.status ?? 'مسودة',
  );
  const topStoryPill = h(
    'div',
    { class: 'active-story-pill', id: 'top-story-pill', hidden: !activeStory },
    h('strong', {}, 'الخبر الحالي:'),
    topStoryHeadline,
    topStoryStatus,
  );

  const topSaveState = h(
    'span',
    { id: 'top-save-state', class: 'save-state', 'data-state': 'saved', hidden: active !== 'new' && active !== 'review' },
    'محفوظ',
  );

  const quickNewBtn = h(
    'button',
    {
      type: 'button',
      id: 'top-btn-new-story',
      class: 'btn btn-sm btn-primary',
      onClick: () => {
        activeStory = null;
        void navigate('/stories/new');
      },
    },
    '+ خبر جديد',
  );

  const topBar = h(
    'header',
    { class: 'top-bar' },
    h(
      'div',
      { class: 'top-bar-title' },
      h('span', { id: 'top-page-title' }, PAGE_TITLES[active]),
      topStoryPill,
    ),
    h('div', { class: 'top-bar-actions' }, topSaveState, quickNewBtn),
  );

  const host = h('div', { class: 'page' });

  const reviewHref = activeStory ? `/stories/${activeStory.id}/review` : '/review';

  root.append(
    h(
      'div',
      { class: 'shell' },
      h(
        'aside',
        { class: 'sidebar', 'aria-label': 'القائمة الرئيسية' },
        h(
          'div',
          { class: 'brand' },
          h(
            'div',
            { class: 'brand-header' },
            h('img', { src: '/icon-32.png', alt: 'Logo', class: 'brand-icon', width: '24', height: '24' }),
            h('span', {}, 'NAS Newsroom'),
          ),
          brandSub,
        ),
        h('div', { class: 'nav-section-title' }, 'مساحة العمل'),
        h(
          'a',
          {
            href: '/stories/new',
            id: 'nav-new-story',
            class: `nav-item${active === 'new' ? ' active' : ''}`,
            onClick: (e: Event) => {
              e.preventDefault();
              void navigate('/stories/new');
            },
          },
          h('img', { src: '/assets/icons/nav-new-story.png', alt: '', class: 'nav-icon', width: '20', height: '20' }),
          h('span', {}, 'خبر جديد'),
        ),
        h(
          'a',
          {
            href: reviewHref,
            id: 'nav-review',
            class: `nav-item${active === 'review' ? ' active' : ''}`,
            onClick: (e: Event) => {
              e.preventDefault();
              void navigate(activeStory ? `/stories/${activeStory.id}/review` : '/review');
            },
          },
          h('img', { src: '/assets/icons/action-verify.png', alt: '', class: 'nav-icon', width: '20', height: '20' }),
          h('span', {}, 'المراجعة والتحرير'),
        ),
        h(
          'a',
          {
            href: '/archive',
            id: 'nav-archive',
            class: `nav-item${active === 'archive' ? ' active' : ''}`,
            onClick: (e: Event) => {
              e.preventDefault();
              void navigate('/archive');
            },
          },
          h('img', { src: '/assets/icons/nav-drafts.png', alt: '', class: 'nav-icon', width: '20', height: '20' }),
          h('span', {}, 'الأرشيف'),
          archiveBadge,
        ),
        h('div', { class: 'nav-section-title' }, 'النظام'),
        h(
          'a',
          {
            href: '/settings',
            id: 'nav-settings',
            class: `nav-item${active === 'settings' ? ' active' : ''}`,
            onClick: (e: Event) => {
              e.preventDefault();
              void navigate('/settings');
            },
          },
          h('img', { src: '/assets/icons/nav-settings.png', alt: '', class: 'nav-icon', width: '20', height: '20' }),
          h('span', {}, 'الإعدادات'),
        ),
        h('div', { class: 'spacer' }),
        h('div', { class: 'user-line', id: 'user-email' }, userEmail),
        h('button', { type: 'button', class: 'nav-item', id: 'btn-logout', onClick: () => void logout() }, 'تسجيل الخروج'),
      ),
      h('div', { class: 'main-wrap' }, topBar, h('main', { class: 'main' }, host)),
    ),
  );

  content(host, {
    updateActiveStory(s) {
      activeStory = s;
      if (s) {
        topStoryHeadline.textContent = s.headline;
        topStoryStatus.textContent = s.status;
        topStoryStatus.dataset.status = s.status;
        topStoryPill.hidden = false;
      } else {
        topStoryPill.hidden = true;
      }
    },
    updateSaveState(state, label) {
      topSaveState.dataset.state = state;
      topSaveState.textContent = label;
      topSaveState.hidden = false;
    },
    updateArchiveCount(count) {
      archiveTotalCount = count;
      archiveBadge.textContent = String(count);
      archiveBadge.hidden = false;
    },
    updateStationName(name) {
      stationName = name;
      brandSub.textContent = name;
    },
  });
}

function showSessionLost(): void {
  if (document.getElementById('session-lost')) return;
  const page = document.querySelector('.page');
  page?.prepend(
    h(
      'div',
      { class: 'alert alert-warn', id: 'session-lost', role: 'alert' },
      'انتهت جلسة الدخول. ما كتبته ما زال في الصفحة لكنه لم يُحفظ بعد. ',
      h('a', { href: '/login', class: 'btn btn-sm' }, 'تسجيل الدخول'),
    ),
  );
}

async function render(): Promise<void> {
  disposeEditor();
  const route = parseRoute(location.pathname);
  if (route.name === 'login') {
    renderLogin();
    return;
  }
  if (!userEmail) {
    try {
      userEmail = (await api.session()).user.email;
      // Load station name & archive count in background
      void api.getSettings().then((r) => {
        stationName = r.settings.stationName;
        const el = document.getElementById('sidebar-station-name');
        if (el) el.textContent = stationName;
      }).catch(() => {});
      void api.listStories({ limit: 1 }).then((r) => {
        if (r.counts) {
          archiveTotalCount = r.counts.total;
          const badge = document.getElementById('nav-archive-count');
          if (badge) {
            badge.textContent = String(archiveTotalCount);
            badge.hidden = false;
          }
        }
      }).catch(() => {});
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        history.replaceState(null, '', '/login');
        renderLogin();
        return;
      }
      clear(root);
      root.append(
        h('div', { class: 'boot' }, 'تعذّر الاتصال بالخادم. ', h('button', { class: 'btn btn-sm', type: 'button', onClick: () => void render() }, 'إعادة المحاولة')),
      );
      return;
    }
  }

  if (route.name === 'archive') {
    renderShell('archive', (host, topRefs) => {
      editor = mountArchive(host, {
        navigate: (p) => void navigate(p),
        onSessionLost: showSessionLost,
        onCountsUpdated: (c) => topRefs.updateArchiveCount(c),
      });
    });
    document.title = 'الأرشيف — NAS Newsroom';
    return;
  }

  if (route.name === 'settings') {
    renderShell('settings', (host, topRefs) => {
      editor = mountSettings(host, {
        onSessionLost: showSessionLost,
        onSettingsSaved: (s) => topRefs.updateStationName(s.stationName),
      });
    });
    document.title = 'الإعدادات — NAS Newsroom';
    return;
  }

  if (route.name === 'review') {
    renderShell('review', (host, topRefs) => {
      editor = mountReview(host, {
        storyId: route.id,
        navigate: (p) => void navigate(p),
        onSessionLost: showSessionLost,
        onStoryUpdated: (s) => topRefs.updateActiveStory(s),
        onSaveStateChange: (st, lbl) => topRefs.updateSaveState(st, lbl),
      });
    });
    document.title = 'المراجعة والتحرير — NAS Newsroom';
    return;
  }

  // 'new' or 'story'
  if (route.name === 'new') {
    activeStory = null;
  }
  renderShell('new', (host, topRefs) => {
    editor = mountEditor(host, {
      storyId: route.name === 'story' ? route.id : null,
      navigate: (p) => void navigate(p),
      onSessionLost: showSessionLost,
      onStoryUpdated: (s) => topRefs.updateActiveStory(s),
      onSaveStateChange: (st, lbl) => topRefs.updateSaveState(st, lbl),
    });
  });
  document.title = route.name === 'story' ? 'متابعة المسودة — NAS Newsroom' : 'خبر جديد — NAS Newsroom';
}

window.addEventListener('popstate', () => void render());
void render();
