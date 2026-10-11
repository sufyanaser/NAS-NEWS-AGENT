/** Session authentication — Specs §5 (single editor, revocable D1 sessions, host-only cookie). */
import { DUMMY_RECORD, bytesToHex, randomBytes, sha256Hex, verifyPassword } from './crypto';
import type { Env } from './env';
import { HttpError, getCookie, json, noContent, readJson } from './http';

export const SESSION_COOKIE = 'nas_session';
const IDLE_MS = 12 * 60 * 60 * 1000;
const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_AFTER_MS = 60 * 1000;

export interface AuthContext {
  user: { id: string; email: string };
  /** Set only when the sliding session was refreshed on this request. */
  refreshedCookie?: string;
}

/**
 * Host-only cookie: deliberately NO `Domain` attribute (never `Domain=.nasfm.info`), so the browser sends
 * it to the exact host that set it and never to the public site (Specs §15.1).
 */
export function buildSessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`;
}

export function clearSessionCookie(): string {
  return buildSessionCookie('', 0);
}

function generateToken(): string {
  return bytesToHex(randomBytes(32));
}

function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'local';
}

export async function login(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request);
  if (env.LOGIN_LIMITER) {
    const { success } = await env.LOGIN_LIMITER.limit({ key: ip });
    if (!success) throw new HttpError(429, 'rate_limited');
  }

  const body = await readJson(request);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || email.length > 254 || !password || password.length > 1024) {
    throw new HttpError(400, 'invalid_input');
  }

  const user = await env.DB.prepare('SELECT id, email, password_hash, password_salt FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string; email: string; password_hash: string; password_salt: string }>();

  // Always run one PBKDF2 verification; the response never reveals whether the email exists (Specs §5.3).
  const ok = await verifyPassword(
    password,
    user ? { passwordHash: user.password_hash, passwordSalt: user.password_salt } : DUMMY_RECORD,
  );
  if (!user || !ok) throw new HttpError(401, 'invalid_credentials');

  const token = generateToken();
  const now = Date.now();
  const iso = new Date(now).toISOString();
  const expires = new Date(now + IDLE_MS).toISOString();
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      await sha256Hex(token),
      user.id,
      iso,
      iso,
      expires,
      await sha256Hex(ip),
      (request.headers.get('User-Agent') ?? '').slice(0, 200) || null,
    )
    .run();

  return json({ ok: true, user: { id: user.id, email: user.email } }, 200, {
    'Set-Cookie': buildSessionCookie(token, IDLE_MS / 1000),
  });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) {
    // Real revocation: the row is deleted, so a stolen token stops working immediately.
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  }
  return noContent({ 'Set-Cookie': clearSessionCookie() });
}

export async function authenticate(request: Request, env: Env): Promise<AuthContext> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) throw new HttpError(401, 'unauthenticated');
  const tokenHash = await sha256Hex(token);

  const row = await env.DB.prepare(
    `SELECT s.created_at AS created_at, s.last_seen_at AS last_seen_at, s.expires_at AS expires_at,
            u.id AS user_id, u.email AS email
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{ created_at: string; last_seen_at: string; expires_at: string; user_id: string; email: string }>();
  if (!row) throw new HttpError(401, 'unauthenticated');

  const now = Date.now();
  const created = Date.parse(row.created_at);
  const lastSeen = Date.parse(row.last_seen_at);
  const expiresAt = Date.parse(row.expires_at);
  const absoluteDeadline = created + ABSOLUTE_MS;
  if (!Number.isFinite(expiresAt) || now >= expiresAt || now >= absoluteDeadline || now >= lastSeen + IDLE_MS) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    throw new HttpError(401, 'unauthenticated');
  }

  const ctx: AuthContext = { user: { id: row.user_id, email: row.email } };
  if (now - lastSeen >= REFRESH_AFTER_MS) {
    const newExpires = Math.min(now + IDLE_MS, absoluteDeadline);
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?')
      .bind(new Date(now).toISOString(), new Date(newExpires).toISOString(), tokenHash)
      .run();
    ctx.refreshedCookie = buildSessionCookie(token, (newExpires - now) / 1000);
  }
  return ctx;
}
