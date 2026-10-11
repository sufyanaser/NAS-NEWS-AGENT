import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { PBKDF2_ITERATIONS, hashPassword, sha256Hex, verifyPassword } from '../src/server/crypto';
import { EDITOR_EMAIL, EDITOR_SECRET, api, cookieFrom, loginCookie, seedUser } from './helpers';

describe('password hashing (Specs §5.2)', () => {
  it('uses PBKDF2 at the Workers-supported iteration count and verifies correctly', async () => {
    const rec = await hashPassword('s3cret-value');
    expect(rec.passwordHash.startsWith(`${PBKDF2_ITERATIONS}$`)).toBe(true);
    expect(rec.passwordHash).not.toContain('s3cret-value');
    expect(await verifyPassword('s3cret-value', rec)).toBe(true);
    expect(await verifyPassword('wrong', rec)).toBe(false);
  });

  it('never exceeds the production Workers PBKDF2 cap of 100,000 (deviation D-1)', async () => {
    // Local workerd does not enforce the cap that Cloudflare production enforces, so we guard it ourselves:
    // the configured count must be within the cap, and stored records above it are refused, never trusted.
    expect(PBKDF2_ITERATIONS).toBeLessThanOrEqual(100_000);
    const over = await hashPassword('x', 310_000);
    expect(await verifyPassword('x', over)).toBe(false);
  });
});

describe('login', () => {
  it('accepts correct credentials, returns the user, and sets a hardened host-only cookie', async () => {
    await seedUser();
    const res = await api('/api/auth/login', { method: 'POST', body: { email: EDITOR_EMAIL, password: EDITOR_SECRET } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, user: { email: EDITOR_EMAIL } });

    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toMatch(/^nas_session=[0-9a-f]{64};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=43200');
    // Host-only: never scoped to the parent domain (Specs §15.1).
    expect(cookie.toLowerCase()).not.toContain('domain=');
    expect(cookie).not.toContain('nasfm.info');
  });

  it('stores only the SHA-256 of the token, never the raw token', async () => {
    await seedUser();
    const res = await api('/api/auth/login', { method: 'POST', body: { email: EDITOR_EMAIL, password: EDITOR_SECRET } });
    const token = cookieFrom(res).split('=')[1] ?? '';
    const rows = await env.DB.prepare('SELECT token_hash, ip_hash FROM sessions').all<{ token_hash: string; ip_hash: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]?.token_hash).toBe(await sha256Hex(token));
    expect(rows.results[0]?.token_hash).not.toBe(token);
    expect(rows.results[0]?.ip_hash).toMatch(/^[0-9a-f]{64}$/); // hashed, not a raw IP
  });

  it('rejects a wrong password and an unknown email with the identical generic response', async () => {
    await seedUser();
    const wrongPw = await api('/api/auth/login', { method: 'POST', body: { email: EDITOR_EMAIL, password: 'nope' } });
    const unknown = await api('/api/auth/login', { method: 'POST', body: { email: 'ghost@example.test', password: 'nope' } });
    expect(wrongPw.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrongPw.text()).toBe(await unknown.text());
    expect(wrongPw.headers.get('Set-Cookie')).toBeNull();
    const count = await env.DB.prepare('SELECT COUNT(*) AS c FROM sessions').first<{ c: number }>();
    expect(count?.c).toBe(0);
  });

  it('rejects malformed login bodies', async () => {
    const empty = await api('/api/auth/login', { method: 'POST', body: { email: '', password: '' } });
    expect(empty.status).toBe(400);
    const notJson = await api('/api/auth/login', { method: 'POST', rawBody: 'email=a&password=b' });
    expect(notJson.status).toBe(400);
  });

  it('GET /api/auth/login is not allowed', async () => {
    const res = await api('/api/auth/login');
    expect(res.status).toBe(405);
  });
});

describe('session & access control', () => {
  it('denies unauthenticated access to every protected endpoint', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const calls: [string, string][] = [
      ['GET', '/api/session'],
      ['GET', '/api/stories'],
      ['POST', '/api/stories'],
      ['GET', `/api/stories/${id}`],
      ['PATCH', `/api/stories/${id}`],
      ['GET', '/api/does-not-exist'],
    ];
    for (const [method, path] of calls) {
      const res = await api(path, { method, body: method === 'GET' ? undefined : {} });
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthenticated' });
    }
  });

  it('rejects a forged / unknown session cookie', async () => {
    const res = await api('/api/session', { cookie: `nas_session=${'a'.repeat(64)}` });
    expect(res.status).toBe(401);
  });

  it('authenticates with the issued cookie', async () => {
    const cookie = await loginCookie();
    const res = await api('/api/session', { cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ user: { email: EDITOR_EMAIL } });
  });

  it('logout deletes the session row and the old token stops working (real revocation)', async () => {
    const cookie = await loginCookie();
    expect((await api('/api/session', { cookie })).status).toBe(200);

    const out = await api('/api/auth/logout', { method: 'POST', cookie });
    expect(out.status).toBe(204);
    expect(out.headers.get('Set-Cookie')).toContain('Max-Age=0');
    const count = await env.DB.prepare('SELECT COUNT(*) AS c FROM sessions').first<{ c: number }>();
    expect(count?.c).toBe(0);

    // Replaying the stolen/old cookie after logout must fail.
    const replay = await api('/api/session', { cookie });
    expect(replay.status).toBe(401);
  });

  it('logout without a session is idempotent', async () => {
    const out = await api('/api/auth/logout', { method: 'POST' });
    expect(out.status).toBe(204);
  });

  it('expires after 12h idle', async () => {
    const cookie = await loginCookie();
    const past = new Date(Date.now() - 13 * 3600 * 1000).toISOString();
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ?').bind(past, new Date(Date.now() + 3600_000).toISOString()).run();
    expect((await api('/api/session', { cookie })).status).toBe(401);
    const count = await env.DB.prepare('SELECT COUNT(*) AS c FROM sessions').first<{ c: number }>();
    expect(count?.c).toBe(0); // expired rows are purged
  });

  it('expires after the 7-day absolute limit even with recent activity', async () => {
    const cookie = await loginCookie();
    const old = new Date(Date.now() - 7 * 24 * 3600 * 1000 - 1000).toISOString();
    const recent = new Date().toISOString();
    await env.DB.prepare('UPDATE sessions SET created_at = ?, last_seen_at = ?, expires_at = ?')
      .bind(old, recent, new Date(Date.now() + 3600_000).toISOString())
      .run();
    expect((await api('/api/session', { cookie })).status).toBe(401);
  });

  it('slides the idle window (and re-issues the host-only cookie) on activity', async () => {
    const cookie = await loginCookie();
    const earlier = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ?').bind(earlier).run();
    const res = await api('/api/session', { cookie });
    expect(res.status).toBe(200);
    const refreshed = res.headers.get('Set-Cookie') ?? '';
    expect(refreshed).toContain('HttpOnly');
    expect(refreshed.toLowerCase()).not.toContain('domain=');
    const row = await env.DB.prepare('SELECT last_seen_at FROM sessions').first<{ last_seen_at: string }>();
    expect(Date.parse(row?.last_seen_at ?? '')).toBeGreaterThan(Date.parse(earlier));
  });
});

describe('CSRF & origin enforcement (Specs §12.3)', () => {
  it('rejects state-changing requests without X-NAS-Client', async () => {
    await seedUser();
    const res = await api('/api/auth/login', { method: 'POST', body: { email: EDITOR_EMAIL, password: EDITOR_SECRET }, noClientHeader: true });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  it('rejects a foreign or missing Origin on state-changing requests', async () => {
    await seedUser();
    const body = { email: EDITOR_EMAIL, password: EDITOR_SECRET };
    expect((await api('/api/auth/login', { method: 'POST', body, origin: 'https://nasfm.info' })).status).toBe(403);
    expect((await api('/api/auth/login', { method: 'POST', body, origin: 'https://evil.example' })).status).toBe(403);
    expect((await api('/api/auth/login', { method: 'POST', body, origin: null })).status).toBe(403);
  });

  it('never emits CORS headers', async () => {
    const res = await api('/api/session', { headers: { Origin: 'https://evil.example' } });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
