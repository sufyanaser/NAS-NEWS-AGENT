/** HTTP helpers: JSON responses, unified error codes (Specs §3.6) and security headers (Specs §12.7). */

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store',
};

export function json(data: unknown, status = 200, headers: Headers | Record<string, string> = {}): Response {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json; charset=utf-8');
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);
  return new Response(JSON.stringify(data), { status, headers: h });
}

export function noContent(headers: Headers | Record<string, string> = {}): Response {
  const h = new Headers(headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);
  return new Response(null, { status: 204, headers: h });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return json({ error: err.code, ...err.extra }, err.status);
  console.error('internal_error', err instanceof Error ? (err.stack ?? err.message) : String(err));
  return json({ error: 'internal_error' }, 500);
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const ct = request.headers.get('Content-Type') ?? '';
  if (!ct.toLowerCase().includes('application/json')) throw new HttpError(400, 'invalid_input', { field: 'content-type' });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, 'invalid_input', { field: 'body' });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'invalid_input', { field: 'body' });
  }
  return body as Record<string, unknown>;
}

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}
