import { ApiError, api } from './api';
import { clear, h } from './dom';
import { mountEditor } from './editor';
import type { EditorHandle } from './editor';

const root = document.getElementById('app') as HTMLElement;
let userEmail = '';
let editor: EditorHandle | null = null;

type Route = { name: 'login' } | { name: 'new' } | { name: 'story'; id: string };

function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/login') return { name: 'login' };
  const m = /^\/stories\/([0-9a-f-]{36})$/.exec(path);
  if (m?.[1]) return { name: 'story', id: m[1] };
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
  const email = h('input', { id: 'login-email', class: 'input ltr', type: 'email', name: 'email', autocomplete: 'username', required: true, maxlength: '254' });
  const password = h('input', { id: 'login-password', class: 'input ltr', type: 'password', name: 'password', autocomplete: 'current-password', required: true, maxlength: '1024' });
  const submit = h('button', { type: 'submit', id: 'btn-login', class: 'btn btn-primary' }, 'دخول إلى غرفة الأخبار');

  const form = h(
    'form',
    { class: 'stack', novalidate: true },
    errorBox,
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'login-email' }, 'البريد الإلكتروني'), email),
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
  await navigate('/login');
}

function renderShell(active: 'new', content: (host: HTMLElement) => void): void {
  clear(root);
  const host = h('div', { class: 'page' });
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
          h('div', { class: 'brand-header' }, h('img', { src: '/icon-32.png', alt: 'Logo', class: 'brand-icon', width: '24', height: '24' }), h('span', {}, 'NAS Newsroom')),
          h('small', {}, 'غرفة الأخبار'),
        ),
        h(
          'a',
          {
            href: '/stories/new',
            class: `nav-item${active === 'new' ? ' active' : ''}`,
            onClick: (e: Event) => {
              e.preventDefault();
              void navigate('/stories/new');
            },
          },
          h('img', { src: '/assets/icons/nav-new-story.png', alt: '', class: 'nav-icon', width: '20', height: '20' }),
          h('span', {}, 'خبر جديد'),
        ),
        h('div', { class: 'spacer' }),
        h('div', { class: 'user-line', id: 'user-email' }, userEmail),
        h('button', { type: 'button', class: 'nav-item', id: 'btn-logout', onClick: () => void logout() }, 'تسجيل الخروج'),
      ),
      h('main', { class: 'main' }, host),
    ),
  );
  content(host);
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
  renderShell('new', (host) => {
    editor = mountEditor(host, {
      storyId: route.name === 'story' ? route.id : null,
      navigate: (p) => void navigate(p),
      onSessionLost: showSessionLost,
    });
  });
  document.title = route.name === 'story' ? 'متابعة المسودة — NAS Newsroom' : 'خبر جديد — NAS Newsroom';
}

window.addEventListener('popstate', () => void render());
void render();
