import { getProvidersStatus } from './server/ai/registry';
import { authenticate, login, logout } from './server/auth';
import type { Env } from './server/env';
import { HttpError, errorResponse, json } from './server/http';
import { getSettings, putSettings, testModelSettings } from './server/settings';
import {
  STORY_ID_RE,
  approveStory,
  createStory,
  excludeStory,
  extractStory,
  getStory,
  importStorySource,
  listStories,
  patchStory,
  publishStory,
  resolveStoryBlocker,
  startStoryReview,
  updateStoryChecks,
} from './server/stories';

const SAFE_METHODS = new Set(['GET', 'HEAD']);

/**
 * CSRF layers for state-changing requests (Specs §12.3): custom header `X-NAS-Client: 1`
 * AND an exact `Origin` match. No CORS is ever enabled, so cross-origin callers cannot pass either.
 */
function assertSameOriginIntent(request: Request, env: Env): void {
  if (SAFE_METHODS.has(request.method)) return;
  if (request.headers.get('X-NAS-Client') !== '1') throw new HttpError(403, 'forbidden');
  if (request.headers.get('Origin') !== env.ALLOWED_ORIGIN) throw new HttpError(403, 'forbidden');
}

function methodNotAllowed(): never {
  throw new HttpError(405, 'method_not_allowed');
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  assertSameOriginIntent(request, env);

  if (path === '/api/auth/login') {
    if (method !== 'POST') methodNotAllowed();
    return login(request, env);
  }
  if (path === '/api/auth/logout') {
    if (method !== 'POST') methodNotAllowed();
    return logout(request, env);
  }

  // Everything else requires a valid session.
  const auth = await authenticate(request, env);
  let response: Response;

  if (path === '/api/session') {
    if (method !== 'GET') methodNotAllowed();
    response = json({ user: auth.user });
  } else if (path === '/api/settings') {
    if (method === 'GET') response = await getSettings(env);
    else if (method === 'PUT') response = await putSettings(request, env);
    else methodNotAllowed();
  } else if (path === '/api/settings/test-model') {
    if (method !== 'POST') methodNotAllowed();
    response = await testModelSettings(request, env, auth.user.id);
  } else if (path === '/api/ai/catalog') {
    if (method !== 'GET') methodNotAllowed();
    response = json({ providers: getProvidersStatus(env) });
  } else if (path === '/api/stories') {
    if (method === 'GET') response = await listStories(url, env);
    else if (method === 'POST') response = await createStory(request, env);
    else methodNotAllowed();
  } else {
    const actionMatch = /^\/api\/stories\/([^/]+)\/(import|extract|start-review|checks|resolve-blocker|approve|publish|exclude)$/.exec(
      path,
    );
    if (actionMatch) {
      const id = actionMatch[1] ?? '';
      const action = actionMatch[2] ?? '';
      if (!STORY_ID_RE.test(id)) throw new HttpError(404, 'not_found');
      if (method !== 'POST') methodNotAllowed();

      if (action === 'import') response = await importStorySource(request, env, id);
      else if (action === 'extract') response = await extractStory(request, env, id);
      else if (action === 'start-review') response = await startStoryReview(env, id);
      else if (action === 'checks') response = await updateStoryChecks(request, env, id);
      else if (action === 'resolve-blocker') response = await resolveStoryBlocker(request, env, id);
      else if (action === 'approve') response = await approveStory(env, id, auth.user.email);
      else if (action === 'publish') response = await publishStory(env, id);
      else if (action === 'exclude') response = await excludeStory(request, env, id);
      else throw new HttpError(404, 'not_found');
    } else {
      const m = /^\/api\/stories\/([^/]+)$/.exec(path);
      if (!m) throw new HttpError(404, 'not_found');
      const id = m[1] ?? '';
      if (!STORY_ID_RE.test(id)) throw new HttpError(404, 'not_found');
      if (method === 'GET') response = await getStory(env, id);
      else if (method === 'PATCH') response = await patchStory(request, env, id);
      // DELETE is intentionally unavailable in MVP 1.0 (Specs §3.2, no permanent deletion).
      else methodNotAllowed();
    }
  }

  if (auth.refreshedCookie) response.headers.append('Set-Cookie', auth.refreshedCookie);
  return response;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') {
      // Static assets are normally served before the Worker runs (run_worker_first: ["/api/*"]).
      return env.ASSETS.fetch(request);
    }
    try {
      return await route(request, env);
    } catch (err) {
      return errorResponse(err);
    }
  },
} satisfies ExportedHandler<Env>;
