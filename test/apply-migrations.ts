import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach } from 'vitest';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Tests share one D1 instance, so each test starts from empty data tables (the schema stays).
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM story_events'),
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM stories'),
    env.DB.prepare('DELETE FROM users'),
  ]);
});
