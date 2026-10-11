import { env, exports } from 'cloudflare:workers';
import { hashPassword } from '../src/server/crypto';

export const ORIGIN = 'https://nr.nasfm.info';
export const EDITOR_EMAIL = 'editor@example.test';
// Throw-away value for tests only; the hash is created at runtime in an isolated test D1.
export const EDITOR_SECRET = 'correct horse battery staple 1';

let ipCounter = 0;

export interface ReqOpts {
  method?: string;
  cookie?: string | null;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
  /** Omit the CSRF header / origin to prove they are enforced. */
  noClientHeader?: boolean;
  origin?: string | null;
}

export async function api(path: string, opts: ReqOpts = {}): Promise<Response> {
  const method = opts.method ?? 'GET';
  const headers = new Headers(opts.headers);
  headers.set('CF-Connecting-IP', headers.get('CF-Connecting-IP') ?? `203.0.113.${(ipCounter++ % 250) + 1}`);
  if (opts.cookie) headers.set('Cookie', opts.cookie);
  if (method !== 'GET') {
    if (!opts.noClientHeader) headers.set('X-NAS-Client', '1');
    const origin = opts.origin === undefined ? ORIGIN : opts.origin;
    if (origin !== null) headers.set('Origin', origin);
  }
  let body: string | undefined = opts.rawBody;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers.set('Content-Type', 'application/json');
  }
  return exports.default.fetch(new Request(`https://nr.nasfm.info${path}`, { method, headers, body }));
}

export async function seedUser(email = EDITOR_EMAIL, password = EDITOR_SECRET): Promise<string> {
  const { passwordHash, passwordSalt } = await hashPassword(password);
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO users (id, email, password_hash, password_salt) VALUES (?, ?, ?, ?)')
    .bind(id, email, passwordHash, passwordSalt)
    .run();
  return id;
}

export function cookieFrom(res: Response): string {
  const setCookie = res.headers.get('Set-Cookie') ?? '';
  const first = setCookie.split(';')[0] ?? '';
  return first;
}

export async function loginCookie(): Promise<string> {
  await seedUser();
  const res = await api('/api/auth/login', { method: 'POST', body: { email: EDITOR_EMAIL, password: EDITOR_SECRET } });
  if (res.status !== 200) throw new Error(`login failed in test helper: ${res.status}`);
  return cookieFrom(res);
}

export async function createDraft(cookie: string, body?: unknown): Promise<{ id: string }> {
  const res = await api('/api/stories', { method: 'POST', cookie, body: body ?? undefined, rawBody: body === undefined ? '' : undefined });
  if (res.status !== 201) throw new Error(`create failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { story: { id: string } };
  return data.story;
}
