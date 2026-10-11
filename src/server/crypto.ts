/** Web Crypto helpers (no external libraries). Specs §5.2. */

/**
 * Cloudflare Workers' Web Crypto PBKDF2 rejects iteration counts above 100,000, so Specs §5.2's
 * 310,000 cannot run on Workers. We use the platform maximum and store the count inside
 * password_hash so it can be raised later. Recorded as deviation D-1 in docs/04-implementation/README.md.
 */
export const PBKDF2_ITERATIONS = 100_000;

const enc = new TextEncoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(n));
  crypto.getRandomValues(out);
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export interface PasswordRecord {
  passwordHash: string;
  passwordSalt: string;
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<PasswordRecord> {
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt, iterations);
  return { passwordHash: `${iterations}$${bytesToBase64(hash)}`, passwordSalt: bytesToBase64(salt) };
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function verifyPassword(password: string, record: PasswordRecord): Promise<boolean> {
  const [iterStr, hashB64] = record.passwordHash.split('$');
  const iterations = Number(iterStr);
  if (!hashB64 || !Number.isInteger(iterations) || iterations < 1 || iterations > 100_000) return false;
  const actual = await pbkdf2(password, base64ToBytes(record.passwordSalt), iterations);
  return timingSafeEqual(actual, base64ToBytes(hashB64));
}

/** A fixed throw-away record: verifying against it keeps "unknown email" and "wrong password" timing alike. */
export const DUMMY_RECORD: PasswordRecord = {
  passwordHash: `${PBKDF2_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`,
  passwordSalt: 'AAAAAAAAAAAAAAAAAAAAAA==',
};
