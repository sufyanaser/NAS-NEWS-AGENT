/** Thin fetch wrapper. Every request is same-origin and carries the CSRF header (Specs §12.3). */
import type { StoryDto, StoryPatchBody, StorySummaryDto } from '../shared/contracts';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly detail?: unknown,
  ) {
    super(`${status} ${code}`);
  }
  get isNetwork(): boolean {
    return this.status === 0;
  }
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') headers['X-NAS-Client'] = '1';
  const init: RequestInit = { method, headers, credentials: 'same-origin' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'network_error');
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON body (e.g. a proxy error page)
  }
  if (!res.ok) {
    const code = (data as { error?: string } | null)?.error ?? 'http_error';
    throw new ApiError(res.status, code, data);
  }
  return data as T;
}

export const api = {
  session: () => request<{ user: { id: string; email: string } }>('GET', '/api/session'),
  login: (email: string, password: string) =>
    request<{ ok: true; user: { id: string; email: string } }>('POST', '/api/auth/login', { email, password }),
  logout: () => request<void>('POST', '/api/auth/logout'),
  createStory: (fields: StoryPatchBody) => request<{ story: StoryDto }>('POST', '/api/stories', fields),
  getStory: (id: string) => request<{ story: StoryDto }>('GET', `/api/stories/${id}`),
  patchStory: (id: string, fields: StoryPatchBody) => request<{ story: StoryDto }>('PATCH', `/api/stories/${id}`, fields),
  listDrafts: (limit = 10) =>
    request<{ stories: StorySummaryDto[] }>('GET', `/api/stories?status=${encodeURIComponent('مسودة')}&limit=${limit}`),
};
